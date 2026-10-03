"""Turns the landmarks of one image into the numbers the model will read.

This is the Python twin of frontend/src/services/handFeatures.js and follows
ml/FEATURE_SPEC.md exactly. It is deliberately free of MediaPipe and OpenCV
imports so the tests can run on their own.

Both sides must produce identical numbers for identical landmarks.
"""

from __future__ import annotations

import math
from typing import Any, Iterable, Sequence

LANDMARK_COUNT = 21
VALUES_PER_LANDMARK = 3
FEATURES_PER_HAND = LANDMARK_COUNT * VALUES_PER_LANDMARK
HAND_SLOT_COUNT = 2
FEATURE_LENGTH = FEATURES_PER_HAND * HAND_SLOT_COUNT

# Frames per model input. This is 1 for letter level signs. Change it to 30
# for word level signs, in this file and in the JavaScript one, together.
WINDOW_LENGTH = 1

# Keeps a collapsed hand from dividing by zero.
MIN_SCALE = 1e-6

WRIST_INDEX = 0
MIDDLE_FINGER_BASE_INDEX = 9


def _scale_for(hand: Sequence[Any]) -> float:
    """Straight line distance from the wrist to the middle finger base joint."""
    wrist = hand[WRIST_INDEX]
    middle_base = hand[MIDDLE_FINGER_BASE_INDEX]
    dx = middle_base.x - wrist.x
    dy = middle_base.y - wrist.y
    dz = middle_base.z - wrist.z
    return max(math.sqrt(dx * dx + dy * dy + dz * dz), MIN_SCALE)


def _hand_to_features(hand: Sequence[Any]) -> list[float]:
    """One hand as 63 numbers: every landmark made relative to the wrist and
    divided by the wrist to middle finger base distance, written in landmark
    order as x, y, z."""
    wrist = hand[WRIST_INDEX]
    scale = _scale_for(hand)

    features: list[float] = []
    for index in range(LANDMARK_COUNT):
        landmark = hand[index]
        features.append((landmark.x - wrist.x) / scale)
        features.append((landmark.y - wrist.y) / scale)
        features.append((landmark.z - wrist.z) / scale)

    return features


def extract_hand_features(hands: Iterable[Sequence[Any]] | None) -> list[float] | None:
    """Return FEATURE_LENGTH numbers for one frame, or None when no hands are
    visible.

    ``hands`` is a list of hands, each hand a list of 21 landmarks that expose
    ``x``, ``y`` and ``z``. Hands are placed left to right by the horizontal
    position of their wrists. MediaPipe's handedness label is never used. A
    missing hand leaves its slot as zeros.
    """
    hands = list(hands or [])
    if not hands:
        return None

    # Sorting a copy keeps the caller's result in the order MediaPipe gave it.
    ordered = sorted(hands, key=lambda hand: hand[WRIST_INDEX].x)

    features: list[float] = []
    for slot in range(HAND_SLOT_COUNT):
        if slot >= len(ordered):
            features.extend([0.0] * FEATURES_PER_HAND)
            continue
        features.extend(_hand_to_features(ordered[slot]))

    return features


def hands_from_result(result: Any) -> list[Sequence[Any]] | None:
    """Read the hands out of a Hand Landmarker result.

    MediaPipe 1.0.1 names the field ``hand_landmarks`` in Python while the
    JavaScript build names it ``landmarks``. Both are accepted here so the same
    extraction works against either binding.
    """
    if result is None:
        return None

    for attribute in ("hand_landmarks", "landmarks"):
        hands = getattr(result, attribute, None)
        if hands is not None:
            return list(hands)

    if isinstance(result, dict):
        for key in ("hand_landmarks", "landmarks"):
            hands = result.get(key)
            if hands is not None:
                return list(hands)

    return None