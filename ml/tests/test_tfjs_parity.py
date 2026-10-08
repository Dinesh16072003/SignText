"""Checks the exported TensorFlow.js graph model against the SavedModel it was
converted from, using real held-out test samples.

Run from the ml/ folder with:

    .venv/Scripts/python tests/test_tfjs_parity.py

or with pytest:

    .venv/Scripts/python -m pytest tests/test_tfjs_parity.py

Running it as a script also writes ml/reports/tfjs_parity_<date>.md.

The graph model is read the way the browser reads it: model.json plus the
weight shard in frontend/public/models/sign-model/. Nothing here installs or
downloads anything.
"""

from __future__ import annotations

import json
import platform
import sys
from datetime import date
from functools import lru_cache
from pathlib import Path

import numpy as np

ML_DIR = Path(__file__).resolve().parents[1]
ROOT_DIR = ML_DIR.parent
MODEL_DIR = ROOT_DIR / "frontend" / "public" / "models" / "sign-model"
MODEL_JSON = MODEL_DIR / "model.json"
CLASS_NAMES_JSON = MODEL_DIR / "class_names.json"
CLASSES_PATH = ML_DIR / "features" / "classes.txt"
FEATURES_PATH = ML_DIR / "features" / "asl_features.npz"
SPLIT_PATH = ML_DIR / "checkpoints" / "split_indices.npz"
EXPORT_DIR = ML_DIR / "checkpoints" / "alphabet_savedmodel"
REPORT_DIR = ML_DIR / "reports"

FEATURE_LENGTH = 126
NUM_CLASSES = 28
SAMPLES_PER_CLASS = 2
MAX_ABS_DIFF = 1e-5


def load_classes() -> list[str]:
    with open(CLASSES_PATH, "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]


def load_exported_classes() -> list[str]:
    return json.loads(CLASS_NAMES_JSON.read_text(encoding="utf-8"))


def real_test_samples():
    """A handful of held-out test rows: up to SAMPLES_PER_CLASS per class.

    The rows come from the test key of the split the trainer wrote, so none of
    them were ever trained on. Rows are picked in class order rather than at
    random so a rerun checks the same samples.
    """
    test_idx = np.load(SPLIT_PATH)["test"]
    data = np.load(FEATURES_PATH)
    X = np.asarray(data["features"], dtype=np.float32)[test_idx]
    y = np.asarray(data["labels"], dtype=np.int64)[test_idx]

    chosen: list[int] = []
    for cls in range(NUM_CLASSES):
        rows = np.flatnonzero(y == cls)[:SAMPLES_PER_CLASS]
        if len(rows) == 0:
            raise RuntimeError(f"No test sample for class index {cls}")
        chosen.extend(rows.tolist())
    return X[chosen], y[chosen]


@lru_cache(maxsize=1)
def load_graph_model():
    """Load frontend/public/models/sign-model/ as a TensorFlow.js graph model.

    The model.json topology is a TensorFlow GraphDef in JSON form. It is
    parsed back into a GraphDef, the Const nodes get their bytes from the
    weight shard listed in weightsManifest, and the result is imported into a
    Graph. This is what tf.loadGraphModel() does in the browser, and it is the
    only way to read this export: the format is graph-model, so the layers
    loader (tf.loadLayersModel) rejects it.
    """
    from google.protobuf import json_format
    import tensorflow as tf

    model = json.loads(MODEL_JSON.read_text(encoding="utf-8"))
    if model.get("format") != "graph-model":
        raise RuntimeError(f"Expected a graph-model, got format {model.get('format')!r}")

    graph_def = tf.compat.v1.GraphDef()
    json_format.Parse(json.dumps(model["modelTopology"]), graph_def)

    # Weights live in the shard files, not in the topology.
    blob = b""
    for group in model["weightsManifest"]:
        for path in group["paths"]:
            blob += (MODEL_DIR / path).read_bytes()

    nodes = {node.name: node for node in graph_def.node}
    offset = 0
    for group in model["weightsManifest"]:
        for weight in group["weights"]:
            size = int(np.prod(weight["shape"])) * 4
            chunk = blob[offset : offset + size]
            if len(chunk) != size:
                raise RuntimeError(f"Weight shard is short at {weight['name']}")
            offset += size
            tensor = nodes[weight["name"]].attr["value"].tensor
            tensor.dtype = tf.float32.as_datatype_enum
            tensor.tensor_content = chunk
    if offset != len(blob):
        raise RuntimeError("Weight shard has trailing bytes the model does not use")

    # TensorFlow.js writes an _input_shapes attribute that TensorFlow does not
    # know about, and TensorFlow rejects a GraphDef that mentions it.
    for node in graph_def.node:
        for key in [k for k in node.attr if k.startswith("_")]:
            del node.attr[key]

    signature = model["signature"]
    input_name = next(iter(signature["inputs"].values()))["name"]
    output_name = next(iter(signature["outputs"].values()))["name"]

    graph = tf.Graph()
    with graph.as_default():
        tf.compat.v1.import_graph_def(graph_def, name="")
    return tf.compat.v1.Session(graph=graph), graph.get_tensor_by_name(input_name), graph.get_tensor_by_name(
        output_name
    )


def graph_model_predict(X: np.ndarray) -> np.ndarray:
    session, inputs, outputs = load_graph_model()
    return session.run(outputs, feed_dict={inputs: X})


def savedmodel_predict(X: np.ndarray) -> np.ndarray:
    import tensorflow as tf

    model = tf.saved_model.load(str(EXPORT_DIR))
    if "serving_default" in model.signatures:
        serve = model.signatures["serving_default"]
    else:
        serve = model.signatures[next(iter(model.signatures))]
    out = serve(tf.constant(X))
    return out[next(iter(out))].numpy()


def environment() -> list[str]:
    import tensorflow as tf

    return [
        f"Python {platform.python_version()} ({sys.executable})",
        f"TensorFlow {tf.__version__}",
        f"NumPy {np.__version__}",
        f"OS {platform.platform()}",
        "TensorFlow.js model converted by "
        + json.loads(MODEL_JSON.read_text(encoding="utf-8")).get("convertedBy", "unknown"),
    ]


def compare():
    classes = load_classes()
    X, y = real_test_samples()

    saved = savedmodel_predict(X)
    converted = graph_model_predict(X)

    if saved.shape != (len(y), NUM_CLASSES) or converted.shape != saved.shape:
        raise RuntimeError(f"Unexpected shapes: SavedModel {saved.shape}, graph model {converted.shape}")

    saved_argmax = saved.argmax(axis=1)
    converted_argmax = converted.argmax(axis=1)
    matches = int((saved_argmax == converted_argmax).sum())
    max_diff = float(np.abs(saved - converted).max())
    return classes, X, y, saved, converted, matches, max_diff


def build_report(classes, y, saved, converted, matches, max_diff) -> str:
    total = len(y)
    wrong = [(i, int(saved[i].argmax()), int(converted[i].argmax())) for i in range(total) if saved[i].argmax() != converted[i].argmax()]
    lines = [
        f"# TensorFlow.js Model Parity Check ({date.today().isoformat()})",
        "",
        "- Converted model: frontend/public/models/sign-model/model.json",
        "- Original model: ml/checkpoints/alphabet_savedmodel",
        f"- Samples: {total} held-out test rows, up to {SAMPLES_PER_CLASS} per class, picked in class order",
        "",
        "## Environment",
    ]
    lines += [f"- {item}" for item in environment()]
    lines += [
        "",
        "## Result",
        f"- Predictions that match: {matches}/{total}",
        f"- Largest probability difference: {max_diff:.3e}",
        f"- Tolerance: {MAX_ABS_DIFF}",
        f"- Outcome: {'PASS' if matches == total and max_diff <= MAX_ABS_DIFF else 'FAIL'}",
        "",
        "## Class order checked",
        f"- class_names.json has {len(classes)} entries and matches ml/features/classes.txt",
        "- " + ", ".join(classes),
        "",
        "## Samples that disagreed",
    ]
    if wrong:
        for row, saved_cls, conv_cls in wrong:
            lines.append(f"- test row {row}: SavedModel {classes[saved_cls]}, graph model {classes[conv_cls]}")
    else:
        lines.append("- none")
    lines.append("")
    return "\n".join(lines)


def test_class_names_match_training_order():
    exported = load_exported_classes()
    trained = load_classes()
    assert len(exported) == NUM_CLASSES, f"Expected {NUM_CLASSES} entries, got {len(exported)}"
    assert exported == trained, "class_names.json does not follow ml/features/classes.txt"


def test_converted_model_shapes():
    session, inputs, outputs = load_graph_model()
    assert inputs.shape.as_list() == [None, FEATURE_LENGTH]
    assert outputs.shape.as_list() == [None, NUM_CLASSES]


def test_predictions_match_savedmodel():
    _, _, _, saved, converted, matches, max_diff = compare()
    assert matches == len(saved), f"{len(saved) - matches} of {len(saved)} predictions differ"
    assert max_diff <= MAX_ABS_DIFF, f"Largest probability difference {max_diff:.3e} exceeds {MAX_ABS_DIFF}"


def main():
    classes, X, y, saved, converted, matches, max_diff = compare()
    report = build_report(classes, y, saved, converted, matches, max_diff)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / f"tfjs_parity_{date.today().isoformat()}.md"
    path.write_text(report, encoding="utf-8")

    print(f"Samples:            {len(y)} held-out test rows ({SAMPLES_PER_CLASS} per class, class order)")
    print(f"Predictions match:  {matches}/{len(y)}")
    print(f"Max probability diff: {max_diff:.3e} (tolerance {MAX_ABS_DIFF})")
    print()
    for line in environment():
        print(f"  {line}")
    print()
    print("PASS" if matches == len(y) and max_diff <= MAX_ABS_DIFF else "FAIL")
    print(f"Wrote report: {path}")


if __name__ == "__main__":
    main()
