"""Evaluates the SavedModel on the held-out test set only.

Run from the ml/ folder with:

    .venv/Scripts/python evaluate_alphabet.py

It reads ml/checkpoints/split_indices.npz and touches only the `test` key.
Nothing in this file opens the train or validation rows, and nothing here
trains or changes the model.

Output:
    ml/reports/alphabet_eval_<date>.md
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import numpy as np
from sklearn.metrics import confusion_matrix

import tensorflow as tf

ML_DIR = Path(__file__).resolve().parent
FEATURES_PATH = ML_DIR / "features" / "asl_features.npz"
CLASSES_PATH = ML_DIR / "features" / "classes.txt"
SPLIT_PATH = ML_DIR / "checkpoints" / "split_indices.npz"
EXPORT_DIR = ML_DIR / "checkpoints" / "alphabet_savedmodel"
REPORT_DIR = ML_DIR / "reports"

CAVEAT = (
    "This score comes from a dataset with few signers "
    "and may be higher than real-world accuracy."
)
TOP_CONFUSED = 10
WEAKEST = 5


def load_classes():
    with open(CLASSES_PATH, "r", encoding="utf-8") as f:
        return [line.strip() for line in f if line.strip()]


def load_test_rows():
    """Return the test features and labels. Train and val are never opened."""
    labels = np.load(SPLIT_PATH)["test"]
    data = np.load(FEATURES_PATH)
    X = np.asarray(data["features"], dtype=np.float32)[labels]
    y = np.asarray(data["labels"], dtype=np.int64)[labels]
    return X, y


def predict(X):
    model = tf.saved_model.load(str(EXPORT_DIR))
    serve = model.signatures["serve"]
    output = serve(tf.constant(X))
    scores = output[list(output.keys())[0]].numpy()
    return scores.argmax(axis=1)


def evaluate(y_true, y_pred, num_classes):
    accuracy = float((y_pred == y_true).mean())
    cm = confusion_matrix(y_true, y_pred, labels=np.arange(num_classes))
    row_totals = cm.sum(axis=1)
    per_class = np.divide(
        cm.diagonal(),
        row_totals,
        out=np.zeros(num_classes, dtype=float),
        where=row_totals > 0,
    )
    confused = [
        (i, j, int(cm[i, j]))
        for i in range(num_classes)
        for j in range(num_classes)
        if i != j and cm[i, j] > 0
    ]
    confused.sort(key=lambda item: (-item[2], item[0], item[1]))
    weakest = sorted(range(num_classes), key=lambda i: (per_class[i], i))[:WEAKEST]
    return accuracy, per_class, row_totals, confused[:TOP_CONFUSED], weakest


def build_report(accuracy, per_class, row_totals, confused, weakest, classes, n_test):
    lines = [
        f"# Alphabet Classifier Evaluation ({date.today().isoformat()})",
        "",
        f"- Model: ml/checkpoints/alphabet_savedmodel",
        f"- Features: ml/features/asl_features.npz",
        f"- Classes: ml/features/classes.txt (n={len(classes)})",
        f"- Seed: 12345",
        f"- Split: train=3721, val=798, test={n_test}",
        "",
        "## Overall test accuracy",
        f"{accuracy:.4f}",
        "",
        "## Caveat",
        CAVEAT,
        "",
        "## Per-class accuracy",
    ]
    for i, name in enumerate(classes):
        lines.append(f"- {name}: {per_class[i]:.3f}")
    lines.append("")
    lines.append("## Top 10 most confused letter pairs (true -> predicted, count)")
    if confused:
        for i, j, count in confused:
            lines.append(f"- {classes[i]} -> {classes[j]}: {count}")
    else:
        lines.append("- none")
    lines.append("")
    lines.append("## Weakest classes (lowest per-class accuracy)")
    for i in weakest:
        lines.append(f"- {classes[i]}: {per_class[i]:.3f}")
    lines.append("")
    return "\n".join(lines)


def main():
    classes = load_classes()
    num_classes = len(classes)
    X, y = load_test_rows()
    print(f"Loaded {len(X)} test rows, {X.shape[1]} features, {num_classes} classes")
    print("Train and validation rows were not read.")

    y_pred = predict(X)
    accuracy, per_class, row_totals, confused, weakest = evaluate(y, y_pred, num_classes)

    report = build_report(accuracy, per_class, row_totals, confused, weakest, classes, len(X))
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / f"alphabet_eval_{date.today().isoformat()}.md"
    path.write_text(report, encoding="utf-8")

    print()
    print(f"Overall test accuracy ({len(X)} samples): {accuracy:.4f}")
    print()
    print("Per-class accuracy:")
    for i, name in enumerate(classes):
        print(f"  {name:<6} {per_class[i]:.3f}  ({int(row_totals[i])} samples)")
    print()
    print(f"Top {TOP_CONFUSED} most confused letter pairs (true -> predicted, count):")
    if confused:
        for i, j, count in confused:
            print(f"  {classes[i]} -> {classes[j]}: {count}")
    else:
        print("  none")
    print()
    print(f"Weakest {WEAKEST} classes:")
    for i in weakest:
        print(f"  {classes[i]}: {per_class[i]:.3f}")
    print()
    print(f"Caveat: {CAVEAT}")
    print()
    print(f"Wrote report: {path}")


if __name__ == "__main__":
    main()
