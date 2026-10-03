"""Checks the Python feature function against the same fake landmarks the
JavaScript tests use, so both sides of ml/FEATURE_SPEC.md stay in step.

Run from the ml/ folder with:  .venv/Scripts/python -m pytest
"""

from __future__ import annotations

import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hand_features import (  # noqa: E402
    FEATURE_LENGTH,
    FEATURES_PER_HAND,
    HAND_SLOT_COUNT,
    MIN_SCALE,
    WINDOW_LENGTH,
    extract_hand_features,
    hands_from_result,
)

# A different step per axis, so a mixed up x, y or z is caught.
STEP = {"x": 0.01, "y": 0.02, "z": 0.03}
MIDDLE_FINGER_BASE_INDEX = 9


class Landmark:
    def __init__(self, x: float, y: float, z: float) -> None:
        self.x = x
        self.y = y
        self.z = z


class FakeResult:
    """Mimics a MediaPipe result, including the handedness labels that the
    extraction must ignore."""

    def __init__(self, hands: list[list[Landmark]]) -> None:
        self.hand_landmarks = hands
        self.handedness = [[{"category_name": "Right", "score": 0.99}] for _ in hands]


def make_fake_hand(wrist_x: float, wrist_y: float = 0.5, wrist_z: float = 0.0) -> list[Landmark]:
    return [
        Landmark(wrist_x + index * STEP["x"], wrist_y + index * STEP["y"], wrist_z + index * STEP["z"])
        for index in range(21)
    ]


def fake_middle_finger_base_scale() -> float:
    offsets = [MIDDLE_FINGER_BASE_INDEX * step for step in (STEP["x"], STEP["y"], STEP["z"])]
    return math.sqrt(sum(offset * offset for offset in offsets))


def middle_finger_base_of(features: list[float], slot: int = 0) -> list[float]:
    start = slot * FEATURES_PER_HAND + MIDDLE_FINGER_BASE_INDEX * 3
    return features[start : start + 3]


def test_shape_matches_the_model():
    assert FEATURES_PER_HAND == 63
    assert HAND_SLOT_COUNT == 2
    assert FEATURE_LENGTH == 126
    assert WINDOW_LENGTH == 1


def test_no_hands_returns_nothing():
    assert extract_hand_features([]) is None
    assert extract_hand_features(None) is None


def test_output_is_always_126_numbers():
    features = extract_hand_features([make_fake_hand(0.2)])

    assert features is not None
    assert len(features) == FEATURE_LENGTH
    assert all(isinstance(value, float) for value in features)


def test_one_hand_fills_only_the_first_slot():
    features = extract_hand_features([make_fake_hand(0.4)])

    assert features is not None
    first_slot = features[:FEATURES_PER_HAND]
    second_slot = features[FEATURES_PER_HAND:]

    assert any(value != 0.0 for value in first_slot)
    assert len(second_slot) == FEATURES_PER_HAND
    assert all(value == 0.0 for value in second_slot)


def test_two_hands_are_ordered_by_wrist_position():
    left_hand = make_fake_hand(0.2)
    right_hand = make_fake_hand(0.7)

    # The handedness labels disagree with the positions on purpose.
    features = extract_hand_features([right_hand, left_hand])
    left_only = extract_hand_features([left_hand])
    right_only = extract_hand_features([right_hand])

    assert features is not None and left_only is not None and right_only is not None
    assert features[:FEATURES_PER_HAND] == left_only[:FEATURES_PER_HAND]
    assert features[FEATURES_PER_HAND:] == right_only[:FEATURES_PER_HAND]


def test_wrist_becomes_the_origin_of_each_slot():
    features = extract_hand_features([make_fake_hand(0.6, 0.3, -0.2), make_fake_hand(0.15)])

    assert features is not None
    for slot in (0, 1):
        start = slot * FEATURES_PER_HAND
        assert features[start : start + 3] == [0.0, 0.0, 0.0]


def test_each_hand_is_divided_by_its_own_scale():
    features = extract_hand_features([make_fake_hand(0.2)])
    scale = fake_middle_finger_base_scale()

    assert features is not None
    scaled = middle_finger_base_of(features)
    assert math.sqrt(sum(value * value for value in scaled)) == pytest.approx(1.0, abs=1e-10)

    offsets = [MIDDLE_FINGER_BASE_INDEX * step for step in (STEP["x"], STEP["y"], STEP["z"])]
    for value, offset in zip(scaled, offsets):
        assert value == pytest.approx(offset / scale, abs=1e-10)


def test_each_hand_is_scaled_on_its_own_size():
    small_hand = make_fake_hand(0.2)
    large_hand = [
        Landmark(landmark.x * 2, landmark.y * 2, landmark.z * 2) for landmark in small_hand
    ]

    small = extract_hand_features([small_hand])
    large = extract_hand_features([large_hand])

    assert small == large


def test_collapsed_hand_stays_finite():
    collapsed = [Landmark(0.4, 0.5, 0.0) for _ in range(21)]
    features = extract_hand_features([collapsed])

    assert features is not None
    assert len(features) == FEATURE_LENGTH
    assert all(math.isfinite(value) for value in features)
    assert MIN_SCALE > 0


def test_input_hands_are_left_in_their_original_order():
    hands = [make_fake_hand(0.7), make_fake_hand(0.2)]
    original = [hand[0].x for hand in hands]

    extract_hand_features(hands)

    assert [hand[0].x for hand in hands] == original


def test_result_reader_accepts_both_field_names():
    hand = make_fake_hand(0.2)

    class JavaStyleResult:
        landmarks = [hand]

    assert hands_from_result(FakeResult([hand])) == [hand]
    assert hands_from_result(JavaStyleResult()) == [hand]
    assert hands_from_result({"hand_landmarks": [hand]}) == [hand]
    assert hands_from_result(None) is None