"""Turns the landmarks of a video into one 30 frame word level sequence.

This is the Python twin of the word level half of ml/FEATURE_SPEC_V2.md. Like
ml/hand_features.py it is deliberately free of MediaPipe and OpenCV imports so
the tests can run on their own with made up landmarks.

The 126 hand numbers come from ml/hand_features.py unchanged, so a letter and
a word can never disagree about hand shape. This module adds the body block
and the rules that turn a variable length video into exactly 30 frames.
"""

from __future__ import annotations

import math
from typing import Any, NamedTuple, Sequence

# v1's hand scale, imported so a hand is never measured two different ways.
from hand_features import WRIST_INDEX, _scale_for, extract_hand_features

# The v1 hand block, unchanged, followed by the body block.
HAND_FEATURE_LENGTH = 126
BODY_FEATURES_PER_HAND = 5  # wrist x, wrist y, change in x, change in y, hand size
FEATURE_LENGTH_V2 = HAND_FEATURE_LENGTH + BODY_FEATURES_PER_HAND * 2  # 136

# Body numbers written before movement is added: x, y and size for each slot.
BODY_STATIC_PER_HAND = 3

WINDOW_LENGTH_V2 = 30

SHOULDER_LEFT_INDEX = 11
SHOULDER_RIGHT_INDEX = 12

# A hand-less run of this many frames or fewer stays inside a segment. Longer
# runs split the video.
GAP_MAX = 3
# Shortest segment worth keeping, counted in frames that have hands.
MIN_SEGMENT_FRAMES = 15
# Frames with hands required in a finished 30 frame sequence.
MIN_VALID_FRAMES = 24

# Keeps a collapsed shoulder line from dividing by zero.
BODY_SCALE_MIN = 1e-6


class Frame(NamedTuple):
    """One decoded frame: the v1 hand block, the body numbers before movement
    is added, and whether each hand slot is occupied."""

    hands: list[float]
    body: list[float]
    present: tuple[bool, bool]


def _first_list(result: Any, names: tuple[str, ...]) -> list | None:
    if result is None:
        return None
    for name in names:
        value = getattr(result, name, None)
        if value:
            return list(value)
    if isinstance(result, dict):
        for name in names:
            value = result.get(name)
            if value:
                return list(value)
    return None


def pose_shoulders_from_result(result: Any) -> list[Any] | None:
    """Read the shoulders out of a Pose Landmarker result.

    Only the two shoulder landmarks are wanted, and only their x and y. Pose z
    is measured from the pelvis while hand z is measured from the wrist, so the
    two do not share a scale and are never mixed.
    """
    landmarks = _first_list(result, ("pose_landmarks", "landmarks"))
    if landmarks is None or len(landmarks) <= SHOULDER_RIGHT_INDEX:
        return None
    return [landmarks[SHOULDER_LEFT_INDEX], landmarks[SHOULDER_RIGHT_INDEX]]


def body_reference(shoulders: Sequence[Any] | None) -> tuple[float, float, float] | None:
    """Midpoint of the shoulders and the distance between them, in the image
    plane, with the distance clamped away from zero."""
    if shoulders is None or len(shoulders) < 2:
        return None

    left, right = shoulders[0], shoulders[1]
    mid_x = (left.x + right.x) / 2.0
    mid_y = (left.y + right.y) / 2.0
    width = math.sqrt((right.x - left.x) ** 2 + (right.y - left.y) ** 2)
    return mid_x, mid_y, max(width, BODY_SCALE_MIN)


def extract_frame(
    hands: Sequence[Sequence[Any]] | None, pose: Any
) -> Frame | None:
    """Turn one frame's landmarks into the numbers the model reads.

    ``pose`` is a Pose Landmarker result, or anything else that carries
    ``pose_landmarks``. Returns None when the frame has no hands at all.
    Otherwise the hand block is exactly what v1 produces, and the body block
    places each wrist against the signer's shoulders and adds the hand's size
    relative to the body.
    """
    hands = list(hands or [])
    if not hands:
        return None

    # Same sort as v1, so the slots mean the same thing in both blocks.
    ordered = sorted(hands, key=lambda hand: hand[WRIST_INDEX].x)
    hand_block = extract_hand_features(ordered)

    reference = body_reference(pose_shoulders_from_result(pose))
    body: list[float] = []
    occupied: list[bool] = []
    for slot in range(2):
        hand = ordered[slot] if slot < len(ordered) else None
        if hand is None or reference is None:
            body.extend([0.0] * BODY_STATIC_PER_HAND)
            occupied.append(False)
            continue

        mid_x, mid_y, width = reference
        wrist = hand[WRIST_INDEX]
        body.append((wrist.x - mid_x) / width)
        body.append((wrist.y - mid_y) / width)
        body.append(_scale_for(hand) / width)
        occupied.append(True)

    return Frame(hands=hand_block, body=body, present=(occupied[0], occupied[1]))


def resample_indices(frame_count: int, window: int = WINDOW_LENGTH_V2) -> list[int]:
    """The frame indices that spread `window` evenly over `frame_count` frames.

    Provided for callers that have no timestamps, and for the tests. Real
    videos use resample_indices_from_timestamps, because Python and the
    browser can decode different numbers of frames from the same file.
    """
    if frame_count <= 0:
        return []
    return resample_indices_from_timestamps(list(range(frame_count)), window)


def resample_indices_from_timestamps(
    timestamps: Sequence[float],
    window: int = WINDOW_LENGTH_V2,
    start: int = 0,
    end: int | None = None,
) -> list[int]:
    """Spread `window` evenly across one segment and take the nearest frame.

    Targets are times, not frame numbers. Each target takes the frame whose
    timestamp is nearest, ties going to the earlier frame. Frames are never
    interpolated, so a short sign is stretched by repeating frames.
    """
    if not timestamps:
        return []

    last = len(timestamps) - 1 if end is None else end
    if last < start or last >= len(timestamps):
        return []

    first_time = float(timestamps[start])
    last_time = float(timestamps[last])
    duration = last_time - first_time

    indices: list[int] = []
    for step in range(window):
        target = first_time + step * duration / (window - 1)

        best = start
        best_distance = abs(float(timestamps[start]) - target)
        for index in range(start + 1, last + 1):
            distance = abs(float(timestamps[index]) - target)
            if distance < best_distance:  # strict, so ties keep the earlier frame
                best, best_distance = index, distance
        indices.append(best)

    return indices


def segments_from_presence(present: Sequence[bool]) -> list[tuple[int, int]]:
    """Split a video into half open [start, end) segments of frames.

    A run of up to GAP_MAX hand-less frames is tolerated inside a segment. A
    longer run ends the segment and the next frame with hands starts a new one.
    """
    segments: list[tuple[int, int]] = []
    start: int | None = None
    last_with_hands = 0
    gap = 0

    for index, has_hands in enumerate(present):
        if has_hands:
            if start is None:
                start = index
            last_with_hands = index
            gap = 0
        elif start is not None:
            gap += 1
            if gap > GAP_MAX:
                segments.append((start, last_with_hands + 1))
                start = None
                gap = 0

    if start is not None:
        segments.append((start, last_with_hands + 1))

    return segments


def hands_in_segment(present: Sequence[bool], start: int, end: int) -> int:
    return sum(1 for index in range(start, end) if present[index])


def assemble_sequence(
    frames: Sequence[Frame | None], indices: Sequence[int]
) -> list[list[float]] | None:
    """Build the 30 by 136 sequence for one resampled segment.

    Movement is the change against the previous frame of this finished
    sequence, so it is computed here, after resampling. A slot with no hands
    in the previous frame reports no movement. Returns None when fewer than
    MIN_VALID_FRAMES of the resampled frames have hands.
    """
    previous_body: list[float] | None = None
    previous_present: tuple[bool, bool] = (False, False)

    sequence: list[list[float]] = []
    valid = 0

    for index in indices:
        frame = frames[index]

        if frame is None:
            sequence.append([0.0] * FEATURE_LENGTH_V2)
            previous_body = None
            previous_present = (False, False)
            continue

        valid += 1
        row = list(frame.hands)
        for slot in range(2):
            x, y, size = frame.body[slot * BODY_STATIC_PER_HAND : slot * BODY_STATIC_PER_HAND + 3]

            if previous_body is None or not previous_present[slot]:
                delta_x = 0.0
                delta_y = 0.0
            else:
                previous = slot * BODY_STATIC_PER_HAND
                delta_x = x - previous_body[previous]
                delta_y = y - previous_body[previous + 1]

            row.append(x)
            row.append(y)
            row.append(delta_x)
            row.append(delta_y)
            row.append(size)

        sequence.append(row)
        previous_body = frame.body
        previous_present = frame.present

    if valid < MIN_VALID_FRAMES:
        return None

    return sequence


def build_sequence(
    frames: Sequence[Frame | None], timestamps: Sequence[float]
) -> tuple[list[list[float]] | None, dict[str, Any]]:
    """Turn every decoded frame of one video into its single best sequence.

    One video gives at most one sequence, taken from its longest usable
    segment. The second element of the return value explains what happened,
    for the skip report.
    """
    if not frames:
        return None, {"reason": "unreadable"}
    if len(timestamps) != len(frames):
        raise ValueError(
            f"Got {len(frames)} frames but {len(timestamps)} timestamps. "
            "Both must come from the same decoded video."
        )

    present = [frame is not None for frame in frames]
    segments = segments_from_presence(present)
    usable = [
        segment
        for segment in segments
        if hands_in_segment(present, *segment) >= MIN_SEGMENT_FRAMES
    ]

    if not usable:
        return None, {
            "reason": "too_few_hands",
            "segments": len(segments),
            "best_segment_frames": max(
                (hands_in_segment(present, *segment) for segment in segments), default=0
            ),
        }

    # Longest segment wins, ties going to the earliest.
    best = max(usable, key=lambda segment: (hands_in_segment(present, *segment), -segment[0]))
    indices = resample_indices_from_timestamps(timestamps, start=best[0], end=best[1] - 1)
    sequence = assemble_sequence(frames, indices)

    if sequence is None:
        return None, {"reason": "too_few_valid_frames", "segment": best}

    return sequence, {
        "segment": best,
        "segment_frames": hands_in_segment(present, *best),
        "valid_frames": sum(1 for index in indices if present[index]),
        "video_frames": len(frames),
    }
