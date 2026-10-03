"""Turns the extracted ASL Alphabet images into the model input numbers.

Usage from the ml/ folder:

    .venv/Scripts/python extract_features.py --limit-per-class 200

It runs the same Hand Landmarker model file as the web app, in image mode, on
every image, with no flipping, rotating or resizing. Each result becomes the
126 numbers described in ml/FEATURE_SPEC.md.

Output:
    ml/features/asl_features.npz   features, labels and image names
    ml/features/classes.txt        class names in label order
    ml/debug/<class>/*.jpg         a few annotated images per class to check

No model is trained here.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

from hand_features import FEATURE_LENGTH, hands_from_result, extract_hand_features

ML_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL = ML_DIR.parent / "frontend" / "public" / "mediapipe" / "hand_landmarker.task"
DEFAULT_DATASET = ML_DIR / "datasets" / "asl_alphabet"
DEFAULT_FEATURES = ML_DIR / "features" / "asl_features.npz"
DEFAULT_CLASSES = ML_DIR / "features" / "classes.txt"
DEFAULT_DEBUG = ML_DIR / "debug"

# A to Z, then space and del. The nothing class is not part of the app.
CLASS_NAMES = [chr(code) for code in range(ord("A"), ord("Z") + 1)] + ["space", "del"]

# The browser uses these, see frontend/src/hooks/useHandTracker.js.
NUM_HANDS = 2
APP_MIN_HAND_CONFIDENCE = 0.6

# Building a dataset is a different job from running live, so it uses a lower
# confidence by default. The ASL Alphabet images are 200 by 200 pixels and many
# hands sit far from the camera: at 0.6 about one image in five is thrown away
# even though a hand is clearly there. At 0.1 nearly every image with a hand is
# kept, and the handless nothing class in that dataset is still rejected.
# ml/FEATURE_SPEC.md rule 2 allows this as long as the value is reported.
DEFAULT_MIN_CONFIDENCE = 0.1

# Same connections the web app draws, so debug images look familiar.
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20),
    (0, 17),
]
# OpenCV colours are BGR, so these are the web app's hex colours reversed.
HAND_COLORS = [
    ((208, 95, 31), (140, 63, 18)),  # line, point
    ((88, 122, 15), (64, 90, 10)),
]

SKIP_RATE_WARNING = 0.20


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--features-out", type=Path, default=DEFAULT_FEATURES)
    parser.add_argument("--classes-out", type=Path, default=DEFAULT_CLASSES)
    parser.add_argument("--debug-dir", type=Path, default=DEFAULT_DEBUG)
    parser.add_argument(
        "--limit-per-class",
        type=int,
        default=None,
        help="Only read this many images per class. Use a small number to test quickly.",
    )
    parser.add_argument(
        "--debug-per-class",
        type=int,
        default=3,
        help="How many annotated images to save per class. Default: 3.",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=DEFAULT_MIN_CONFIDENCE,
        help=(
            "Hand detection confidence used while reading the dataset. The browser uses "
            f"{APP_MIN_HAND_CONFIDENCE}, which drops about one image in five of these small "
            f"dataset photos. Default: {DEFAULT_MIN_CONFIDENCE}. Pass "
            f"--min-confidence {APP_MIN_HAND_CONFIDENCE} for browser-identical behaviour."
        ),
    )
    return parser.parse_args()


def build_landmarker(model_path: Path, min_confidence: float) -> vision.HandLandmarker:
    if not model_path.exists():
        print(f"Model file not found: {model_path}", file=sys.stderr)
        print("Run npm install in the frontend folder to download it.", file=sys.stderr)
        raise SystemExit(1)

    options = vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
        running_mode=vision.RunningMode.IMAGE,
        num_hands=NUM_HANDS,
        min_hand_detection_confidence=min_confidence,
        min_hand_presence_confidence=min_confidence,
        min_tracking_confidence=min_confidence,
    )
    return vision.HandLandmarker.create_from_options(options)


def read_image_rgb(path: Path) -> np.ndarray | None:
    """Read an image exactly as it is stored, in RGB, with no changes."""
    bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if bgr is None:
        return None
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def draw_debug(image_bgr: np.ndarray, hands: list) -> np.ndarray:
    height, width = image_bgr.shape[:2]
    canvas = image_bgr.copy()
    for hand_index, hand in enumerate(hands):
        line_color, point_color = HAND_COLORS[hand_index % len(HAND_COLORS)]
        points = np.array(
            [[landmark.x * width, landmark.y * height] for landmark in hand], dtype=np.float32
        )
        for start_index, end_index in HAND_CONNECTIONS:
            cv2.line(
                canvas,
                tuple(points[start_index].astype(int)),
                tuple(points[end_index].astype(int)),
                line_color,
                max(2, width // 320),
            )
        for point in points:
            cv2.circle(
                canvas,
                tuple(point.astype(int)),
                max(3, width // 220),
                point_color,
                -1,
            )
    return canvas


def evenly_spaced(items: list, count: int) -> list:
    if count >= len(items) or count <= 0:
        return items
    step = len(items) / count
    return [items[int(index * step)] for index in range(count)]


def save_debug_images(
    debug_dir: Path, class_name: str, samples: list[tuple[str, np.ndarray, list]], wanted: int
) -> int:
    if wanted <= 0 or not samples:
        return 0

    chosen = evenly_spaced(samples, wanted)
    class_dir = debug_dir / class_name
    class_dir.mkdir(parents=True, exist_ok=True)

    for stem, image_bgr, hands in chosen:
        target = class_dir / f"{stem}_landmarks.jpg"
        cv2.imwrite(str(target), draw_debug(image_bgr, hands))
    return len(chosen)


def format_report(counts: dict[str, dict[str, int]]) -> str:
    lines = [f"{'class':<8}{'processed':>10}{'skipped':>9}{'skip rate':>11}"]
    total_processed = 0
    total_skipped = 0
    total_unreadable = 0
    for class_name in CLASS_NAMES:
        entry = counts[class_name]
        processed, skipped = entry["processed"], entry["skipped"]
        total_processed += processed
        total_skipped += skipped
        total_unreadable += entry["unreadable"]
        seen = processed + skipped + entry["unreadable"]
        rate = skipped / seen if seen else 0.0
        lines.append(f"{class_name:<8}{processed:>10}{skipped:>9}{rate * 100:>10.1f}%")

    total_seen = total_processed + total_skipped + total_unreadable
    total_rate = total_skipped / total_seen if total_seen else 0.0
    lines.append("-" * 38)
    lines.append(
        f"{'total':<8}{total_processed:>10}{total_skipped:>9}{total_rate * 100:>10.1f}%"
    )

    if total_unreadable:
        lines.append("")
        lines.append(
            f"{total_unreadable} image files could not be read and are not counted as missing hands."
        )

    warned = []
    for class_name in CLASS_NAMES:
        entry = counts[class_name]
        seen = entry["processed"] + entry["skipped"] + entry["unreadable"]
        if seen and entry["skipped"] / seen > SKIP_RATE_WARNING:
            warned.append(
                f"  {class_name}: {entry['skipped']} of {seen} images had no hand "
                f"({entry['skipped'] / seen * 100:.1f}%)"
            )

    if warned:
        lines.append("")
        lines.append(f"Warning: these classes lost more than {SKIP_RATE_WARNING * 100:.0f}% of their images.")
        lines.extend(warned)
    else:
        lines.append("")
        lines.append(
            f"No class lost more than {SKIP_RATE_WARNING * 100:.0f}% of its images."
        )

    return "\n".join(lines)


def main() -> None:
    args = parse_args()

    missing = [name for name in CLASS_NAMES if not (args.dataset_root / name).is_dir()]
    if missing:
        print(f"Missing class folders in {args.dataset_root}: {', '.join(missing)}", file=sys.stderr)
        print("Run download_dataset.py first.", file=sys.stderr)
        raise SystemExit(1)

    landmarker = build_landmarker(args.model, args.min_confidence)
    print(
        f"Reading {args.dataset_root} at confidence {args.min_confidence} "
        f"(the browser uses {APP_MIN_HAND_CONFIDENCE})"
    )

    features: list[list[float]] = []
    labels: list[int] = []
    image_names: list[str] = []
    counts = {
        name: {"processed": 0, "skipped": 0, "unreadable": 0} for name in CLASS_NAMES
    }

    try:
        for label, class_name in enumerate(CLASS_NAMES):
            class_dir = args.dataset_root / class_name
            paths = sorted(
                path for path in class_dir.iterdir() if path.suffix.lower() in {".jpg", ".jpeg", ".png"}
            )
            if args.limit_per_class is not None:
                paths = paths[: args.limit_per_class]

            debug_samples: list[tuple[str, np.ndarray, list]] = []

            for path in paths:
                rgb = read_image_rgb(path)
                if rgb is None:
                    counts[class_name]["unreadable"] += 1
                    continue

                image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                result = landmarker.detect(image)
                hands = hands_from_result(result) or []
                vector = extract_hand_features(hands)

                if vector is None or len(vector) != FEATURE_LENGTH:
                    counts[class_name]["skipped"] += 1
                    continue

                features.append(vector)
                labels.append(label)
                image_names.append(f"{class_name}/{path.name}")
                counts[class_name]["processed"] += 1

                if len(debug_samples) < args.debug_per_class * 4:
                    debug_samples.append((path.stem, cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), hands))

            saved = save_debug_images(args.debug_dir, class_name, debug_samples, args.debug_per_class)
            print(
                f"{class_name}: {counts[class_name]['processed']} images, "
                f"{counts[class_name]['skipped']} with no hand, {saved} debug images",
                flush=True,
            )
    finally:
        landmarker.close()

    if not features:
        print("\nNo images produced features. Check the dataset and the model file.", file=sys.stderr)
        raise SystemExit(1)

    args.features_out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.features_out,
        features=np.asarray(features, dtype=np.float32),
        labels=np.asarray(labels, dtype=np.int32),
        image_names=np.asarray(image_names),
    )

    args.classes_out.parent.mkdir(parents=True, exist_ok=True)
    args.classes_out.write_text("\n".join(CLASS_NAMES) + "\n", encoding="utf-8")

    print("\nReport")
    print("-------")
    print(format_report(counts))
    print("\nSaved")
    print("-----")
    print(f"  {args.features_out}")
    print(f"  {args.classes_out}")
    print(f"  {args.debug_dir}")
    print(f"\nSamples: {len(features)}, shape {np.asarray(features).shape}, "
          f"label order in {args.classes_out.name}")


if __name__ == "__main__":
    main()