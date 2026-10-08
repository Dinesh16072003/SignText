"""Turns the downloaded word level videos into 30 frame feature sequences.

Usage from the ml/ folder:

    .venv/Scripts/python extract_word_features.py
    .venv/Scripts/python extract_word_features.py --limit-per-word 5 --debug-per-word 2

It reads every video under ml/datasets/wlasl/<word>/<video_id>.mp4, runs the
same Hand Landmarker model file as the web app plus a Pose Landmarker for the
shoulders, and writes one 30 by 136 sequence per video as described in
ml/FEATURE_SPEC_V2.md. Videos that cannot be read, or that do not hold enough
frames with hands, are skipped and counted per word.

Output:
    ml/features/words_v2/sequences/*.npz   one file per video, the resume point
    ml/features/words_v2/words_v2.npz      every sequence, labels and names
    ml/features/words_v2/classes.txt       class names in label order
    ml/features/words_v2/report.md         what was kept and what was skipped
    ml/features/words_v2/processed.json    per video outcome, so a re-run skips
    ml/debug/words_v2/<word>/*.jpg         landmarks drawn on sampled frames

No model is trained here.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

sys.path.insert(0, str(Path(__file__).resolve().parent))

from hand_features_v2 import (  # noqa: E402
    FEATURE_LENGTH_V2,
    WINDOW_LENGTH_V2,
    build_sequence,
    extract_frame,
)

ML_DIR = Path(__file__).resolve().parent
DEFAULT_DATASET = ML_DIR / "datasets" / "wlasl"
DEFAULT_OUT = ML_DIR / "features" / "words_v2"
DEFAULT_DEBUG = ML_DIR / "debug" / "words_v2"
HAND_MODEL = ML_DIR.parent / "frontend" / "public" / "mediapipe" / "hand_landmarker.task"
POSE_MODEL = ML_DIR.parent / "frontend" / "public" / "mediapipe" / "pose_landmarker_lite.task"

VIDEO_SUFFIXES = {".mp4", ".mov", ".webm", ".m4v"}

NUM_HANDS = 2
NUM_POSES = 1

# Building a dataset is a different job from running live. The browser uses
# 0.6; 0.5 keeps more of the WLASL clips without accepting empty frames, and
# the value used is written into the report as ml/FEATURE_SPEC.md rule 2 asks.
DEFAULT_MIN_CONFIDENCE = 0.5

HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),
    (0, 5), (5, 6), (6, 7), (7, 8),
    (5, 9), (9, 10), (10, 11), (11, 12),
    (9, 13), (13, 14), (14, 15), (15, 16),
    (13, 17), (17, 18), (18, 19), (19, 20),
    (0, 17),
]
# Only the upper body is drawn: shoulders, elbows and wrists.
POSE_CONNECTIONS = [(11, 12), (11, 13), (13, 15), (12, 14), (14, 16)]
# OpenCV colours are BGR.
HAND_COLORS = [((208, 95, 31), (140, 63, 18)), ((88, 122, 15), (64, 90, 10))]
POSE_COLOR = (40, 40, 200)

SKIP_RATE_WARNING = 0.30


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset-root", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--debug-dir", type=Path, default=DEFAULT_DEBUG)
    parser.add_argument("--hand-model", type=Path, default=HAND_MODEL)
    parser.add_argument("--pose-model", type=Path, default=POSE_MODEL)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="Optional manifest json with signer ids. Defaults to <dataset-root>/manifest.json.",
    )
    parser.add_argument("--words", nargs="*", default=None, help="Only process these words.")
    parser.add_argument("--limit-per-word", type=int, default=None)
    parser.add_argument("--debug-per-word", type=int, default=3)
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=DEFAULT_MIN_CONFIDENCE,
        help=f"Hand and pose confidence used while reading videos. Default: {DEFAULT_MIN_CONFIDENCE}.",
    )
    parser.add_argument(
        "--retry-skipped",
        action="store_true",
        help="Look at videos that were skipped last time again instead of trusting processed.json.",
    )
    return parser.parse_args()


def build_landmarkers(hand_model: Path, pose_model: Path, min_confidence: float):
    for label, path in (("hand", hand_model), ("pose", pose_model)):
        if not path.exists():
            print(f"{label.capitalize()} model file not found: {path}", file=sys.stderr)
            if label == "hand":
                print("Run npm install in the frontend folder to download it.", file=sys.stderr)
            raise SystemExit(1)

    hand_options = vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(hand_model)),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=NUM_HANDS,
        min_hand_detection_confidence=min_confidence,
        min_hand_presence_confidence=min_confidence,
        min_tracking_confidence=min_confidence,
    )
    pose_options = vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(pose_model)),
        running_mode=vision.RunningMode.VIDEO,
        num_poses=NUM_POSES,
        min_pose_detection_confidence=min_confidence,
        min_pose_presence_confidence=min_confidence,
        min_tracking_confidence=min_confidence,
    )
    return (
        vision.HandLandmarker.create_from_options(hand_options),
        vision.PoseLandmarker.create_from_options(pose_options),
    )


def find_videos(dataset_root: Path, words: list[str] | None) -> dict[str, list[Path]]:
    """Every video, grouped by the word folder it sits in."""
    found: dict[str, list[Path]] = {}
    if not dataset_root.is_dir():
        return found

    for word_dir in sorted(path for path in dataset_root.iterdir() if path.is_dir()):
        if word_dir.name in {"sequences", "raw"}:
            continue
        if words and word_dir.name not in words:
            continue
        videos = sorted(
            path for path in word_dir.iterdir() if path.suffix.lower() in VIDEO_SUFFIXES
        )
        if videos:
            found[word_dir.name] = videos

    return found


def load_manifest(path: Path) -> dict[str, dict]:
    """video_id to {signer_id, split, url}, when a download left one behind."""
    if not path.exists():
        return {}

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        print(f"Could not read the manifest {path}: {error}", file=sys.stderr)
        return {}

    entries = raw.get("videos", raw) if isinstance(raw, dict) else raw
    by_id: dict[str, dict] = {}
    if isinstance(entries, list):
        for entry in entries:
            if isinstance(entry, dict) and entry.get("video_id"):
                by_id[str(entry["video_id"])] = entry
    return by_id


def to_image(rgb: np.ndarray) -> "mp.Image":
    return mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)


def read_video(path: Path, hand_landmarker, pose_landmarker, clock: list[int]):
    """Decode one video and return (frames, timestamps).

    Timestamps come from the file when OpenCV reports them and fall back to
    the frame number over the frame rate. They never go backwards, which
    MediaPipe's video mode requires, and they keep rising across videos by
    advancing the shared ``clock``.
    """
    capture = cv2.VideoCapture(str(path))
    if not capture.isOpened():
        return None, None

    fps = capture.get(cv2.CAP_PROP_FPS)
    if not fps or fps != fps or fps <= 0:
        fps = 25.0

    frames = []
    timestamps: list[int] = []
    previous_ms = clock[0] - 1
    index = 0

    while True:
        ok, bgr = capture.read()
        if not ok:
            break

        media_ms = capture.get(cv2.CAP_PROP_POS_MSEC)
        if media_ms and media_ms > 0:
            ms = clock[0] + int(round(media_ms))
        else:
            ms = clock[0] + int(round(index * 1000.0 / fps))
        if ms <= previous_ms:
            ms = previous_ms + 1
        previous_ms = ms

        image = to_image(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
        hands = hand_landmarker.detect_for_video(image, ms).hand_landmarks
        pose = pose_landmarker.detect_for_video(image, ms)
        frames.append(extract_frame(hands, pose))
        timestamps.append(ms)
        index += 1

    capture.release()
    if timestamps:
        clock[0] = timestamps[-1] + 1000
    return frames, timestamps


def draw_landmarks(image_bgr: np.ndarray, hands: list, pose_landmarks: list | None) -> np.ndarray:
    height, width = image_bgr.shape[:2]
    canvas = image_bgr.copy()

    if pose_landmarks:
        points = [
            (int(landmark.x * width), int(landmark.y * height)) for landmark in pose_landmarks
        ]
        for start_index, end_index in POSE_CONNECTIONS:
            if start_index < len(points) and end_index < len(points):
                cv2.line(canvas, points[start_index], points[end_index], POSE_COLOR, 2)
        for index in (11, 12):
            if index < len(points):
                cv2.circle(canvas, points[index], 4, POSE_COLOR, -1)

    for hand_index, hand in enumerate(hands):
        line_color, point_color = HAND_COLORS[hand_index % len(HAND_COLORS)]
        points = np.array(
            [[landmark.x * width, landmark.y * height] for landmark in hand], dtype=np.float32
        )
        thickness = max(2, width // 320)
        for start_index, end_index in HAND_CONNECTIONS:
            cv2.line(
                canvas,
                tuple(points[start_index].astype(int)),
                tuple(points[end_index].astype(int)),
                line_color,
                thickness,
            )
        for point in points:
            cv2.circle(canvas, tuple(point.astype(int)), max(3, width // 220), point_color, -1)

    return canvas


def write_debug_images(
    video_path: Path,
    debug_dir: Path,
    frame_indices: list[int],
    wanted: int,
    hand_landmarker,
    pose_landmarker,
    clock: list[int],
) -> int:
    """Re-read a few frames of the video and draw the landmarks on them."""
    if wanted <= 0 or not frame_indices:
        return 0

    if len(frame_indices) > wanted:
        frame_indices = [
            frame_indices[round(step * (len(frame_indices) - 1) / (wanted - 1))]
            for step in range(wanted)
        ]

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        return 0

    target_dir = debug_dir / video_path.parent.name
    target_dir.mkdir(parents=True, exist_ok=True)

    fps = capture.get(cv2.CAP_PROP_FPS) or 25.0
    saved = 0
    try:
        for offset, frame_index in enumerate(frame_indices):
            capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            ok, bgr = capture.read()
            if not ok:
                continue

            ms = clock[0] + int(round(frame_index * 1000.0 / fps)) + offset
            image = to_image(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
            hands = hand_landmarker.detect_for_video(image, ms).hand_landmarks
            pose = pose_landmarker.detect_for_video(image, ms)

            target = target_dir / f"{video_path.stem}_f{frame_index}.jpg"
            cv2.imwrite(str(target), draw_landmarks(bgr, hands, pose.pose_landmarks))
            saved += 1
    finally:
        capture.release()
        if frame_indices:
            clock[0] += 1000

    return saved


def debug_frame_indices(stats: dict) -> list[int]:
    """Approximate source frame indices for the debug pictures."""
    segment = stats.get("segment")
    if not segment:
        return []
    start, end = segment
    count = min(end - start, WINDOW_LENGTH_V2)
    if count <= 0:
        return []
    return [start + round(step * (end - start - 1) / (count - 1)) for step in range(count)]


def write_report(out_dir: Path, counts: dict[str, dict[str, int]], min_confidence: float) -> str:
    lines = [
        "# Word level feature extraction",
        "",
        f"Hand and pose confidence: {min_confidence}. The browser uses 0.6.",
        f"Sequences are {WINDOW_LENGTH_V2} frames of {FEATURE_LENGTH_V2} numbers, "
        "as ml/FEATURE_SPEC_V2.md requires.",
        "",
        f"{'word':<14}{'found':>7}{'kept':>7}{'skipped':>9}{'skip rate':>11}",
    ]

    totals: dict[str, int] = defaultdict(int)
    for word in sorted(counts):
        entry = counts[word]
        found = entry["kept"] + entry["skipped"]
        rate = entry["skipped"] / found if found else 0.0
        lines.append(
            f"{word:<14}{found:>7}{entry['kept']:>7}{entry['skipped']:>9}{rate * 100:>10.1f}%"
        )
        for key in ("kept", "skipped", "unreadable", "too_few_hands", "too_few_valid_frames"):
            totals[key] += entry[key]

    found = totals["kept"] + totals["skipped"]
    rate = totals["skipped"] / found if found else 0.0
    lines.append("-" * 48)
    lines.append(
        f"{'total':<14}{found:>7}{totals['kept']:>7}{totals['skipped']:>9}{rate * 100:>10.1f}%"
    )

    lines += ["", "Why videos were skipped", ""]
    for reason in ("unreadable", "too_few_hands", "too_few_valid_frames"):
        lines.append(f"  {reason.replace('_', ' ')}: {totals[reason]}")

    warned = [
        f"  {word}: {counts[word]['skipped']} of "
        f"{counts[word]['kept'] + counts[word]['skipped']} videos skipped"
        for word in sorted(counts)
        if counts[word]["kept"] + counts[word]["skipped"]
        and counts[word]["skipped"] / (counts[word]["kept"] + counts[word]["skipped"])
        > SKIP_RATE_WARNING
    ]

    lines.append("")
    if warned:
        lines.append(f"Words that lost more than {SKIP_RATE_WARNING * 100:.0f}% of their videos:")
        lines.extend(warned)
    else:
        lines.append(f"No word lost more than {SKIP_RATE_WARNING * 100:.0f}% of its videos.")

    report = "\n".join(lines) + "\n"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "report.md").write_text(report, encoding="utf-8")
    return report


def load_processed(path: Path, retry_skipped: bool) -> dict[str, dict]:
    if retry_skipped or not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def main() -> None:
    args = parse_args()
    dataset_root = args.dataset_root
    manifest = load_manifest(args.manifest or (dataset_root / "manifest.json"))

    videos_by_word = find_videos(dataset_root, args.words)
    if not videos_by_word:
        print(f"No videos found under {dataset_root}.", file=sys.stderr)
        print(
            "Download the approved words first: ml/datasets/wlasl/<word>/<video_id>.mp4",
            file=sys.stderr,
        )
        raise SystemExit(1)

    processed_path = args.out_dir / "processed.json"
    processed = load_processed(processed_path, args.retry_skipped)

    sequences_dir = args.out_dir / "sequences"
    sequences_dir.mkdir(parents=True, exist_ok=True)
    args.debug_dir.mkdir(parents=True, exist_ok=True)

    hand_landmarker, pose_landmarker = build_landmarkers(
        args.hand_model, args.pose_model, args.min_confidence
    )
    # MediaPipe's video mode wants timestamps that only ever rise, so one
    # clock is shared by every video in the run. Only differences between
    # timestamps reach the feature rules, so the offset cannot change them.
    clock = [0]

    class_names = sorted(videos_by_word)
    counts: dict[str, dict[str, int]] = {word: defaultdict(int) for word in class_names}
    kept: list[dict] = []

    total_found = sum(len(paths) for paths in videos_by_word.values())
    print(f"Reading {total_found} videos from {dataset_root} at confidence {args.min_confidence}")

    try:
        for label, word in enumerate(class_names):
            paths = videos_by_word[word]
            if args.limit_per_word is not None:
                paths = paths[: args.limit_per_word]

            for path in paths:
                video_id = path.stem
                target = sequences_dir / f"{word}__{video_id}.npz"
                previous = processed.get(video_id)

                if (
                    previous
                    and previous.get("status") == "kept"
                    and target.exists()
                ):
                    counts[word]["kept"] += 1
                    kept.append(
                        {
                            "word": word,
                            "label": label,
                            "video_id": video_id,
                            "signer_id": previous.get("signer_id", -1),
                            "split": previous.get("split", ""),
                            "path": str(target),
                        }
                    )
                    continue

                frames, timestamps = read_video(path, hand_landmarker, pose_landmarker, clock)
                sequence, stats = build_sequence(frames or [], timestamps or [])

                if sequence is None:
                    reason = stats.get("reason", "unreadable")
                    counts[word]["skipped"] += 1
                    counts[word][reason] += 1
                    processed[video_id] = {"status": "skipped", "reason": reason}
                    processed_path.write_text(json.dumps(processed, indent=1), encoding="utf-8")
                    continue

                counts[word]["kept"] += 1
                meta = manifest.get(video_id, {})
                signer_id = int(meta.get("signer_id", -1))
                split = str(meta.get("split", ""))

                np.savez_compressed(
                    target,
                    features=np.asarray(sequence, dtype=np.float32),
                    word=np.asarray(word),
                    video_id=np.asarray(video_id),
                    signer_id=np.asarray(signer_id, dtype=np.int32),
                    split=np.asarray(split),
                )
                processed[video_id] = {
                    "status": "kept",
                    "signer_id": signer_id,
                    "split": split,
                    "segment": list(stats.get("segment", [])),
                }
                processed_path.write_text(json.dumps(processed, indent=1), encoding="utf-8")
                kept.append(
                    {
                        "word": word,
                        "label": label,
                        "video_id": video_id,
                        "signer_id": signer_id,
                        "split": split,
                        "path": str(target),
                    }
                )

                if counts[word]["kept"] <= args.debug_per_word:
                    written = write_debug_images(
                        path,
                        args.debug_dir,
                        debug_frame_indices(stats),
                        args.debug_per_word,
                        hand_landmarker,
                        pose_landmarker,
                        clock,
                    )
                    if written:
                        print(f"  {word}/{video_id}: {written} debug images")

            print(
                f"{word}: {counts[word]['kept']} kept, {counts[word]['skipped']} skipped",
                flush=True,
            )
    finally:
        hand_landmarker.close()
        pose_landmarker.close()
        processed_path.parent.mkdir(parents=True, exist_ok=True)
        processed_path.write_text(json.dumps(processed, indent=1), encoding="utf-8")

    if not kept:
        print("\nNo video produced a sequence. See the report for the reasons.", file=sys.stderr)
        write_report(args.out_dir, counts, args.min_confidence)
        raise SystemExit(1)

    features, labels, names, signers, splits = [], [], [], [], []
    for entry in kept:
        data = np.load(entry["path"], allow_pickle=False)
        features.append(data["features"])
        labels.append(entry["label"])
        names.append(f"{entry['word']}/{entry['video_id']}")
        signers.append(entry["signer_id"])
        splits.append(entry["split"])

    args.out_dir.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        args.out_dir / "words_v2.npz",
        features=np.asarray(features, dtype=np.float32),
        labels=np.asarray(labels, dtype=np.int32),
        class_names=np.asarray(class_names),
        video_names=np.asarray(names),
        signer_ids=np.asarray(signers, dtype=np.int32),
        splits=np.asarray(splits),
    )
    (args.out_dir / "classes.txt").write_text("\n".join(class_names) + "\n", encoding="utf-8")

    print("\n" + write_report(args.out_dir, counts, args.min_confidence))
    print("Saved")
    print("-----")
    print(f"  {args.out_dir / 'words_v2.npz'}")
    print(f"  {args.out_dir / 'classes.txt'}")
    print(f"  {args.out_dir / 'report.md'}")
    print(f"  {args.debug_dir}")
    print(
        f"\nSequences: {len(features)}, shape {np.asarray(features).shape}, "
        f"{len(class_names)} classes in {args.out_dir / 'classes.txt'}"
    )


if __name__ == "__main__":
    main()
