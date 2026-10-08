"""Checks the word level rules of ml/FEATURE_SPEC_V2.md with made up frames.

Run from the ml/ folder with:  .venv/Scripts/python -m pytest
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hand_features_v2 import (  # noqa: E402
    FEATURE_LENGTH_V2,
    GAP_MAX,
    MIN_SEGMENT_FRAMES,
    MIN_VALID_FRAMES,
    WINDOW_LENGTH_V2,
    Frame,
    assemble_sequence,
    build_sequence,
    resample_indices,
    resample_indices_from_timestamps,
    segments_from_presence,
)


def frame_at(x: float, present: tuple[bool, bool] = (True, True)) -> Frame:
    """A frame with both body slots filled at the same place every time."""
    body = []
    for slot in range(2):
        body.extend([x + slot, 0.5, 1.0])
    return Frame(hands=[0.0] * 126, body=body, present=present)


def empty_slot_frame() -> Frame:
    """A frame with one hand: slot 0 filled, slot 1 empty."""
    body = [0.1, 0.2, 3.0, 0.0, 0.0, 0.0]
    return Frame(hands=[0.0] * 126, body=body, present=(True, False))


def test_feature_and_window_lengths_match_the_spec():
    assert FEATURE_LENGTH_V2 == 136
    assert WINDOW_LENGTH_V2 == 30
    assert GAP_MAX == 3
    assert MIN_SEGMENT_FRAMES == 15
    assert MIN_VALID_FRAMES == 24


def test_resample_shorter_than_window_stretches_by_repeating():
    indices = resample_indices(15)
    assert len(indices) == WINDOW_LENGTH_V2
    assert indices == sorted(indices)
    assert indices[0] == 0
    assert indices[-1] == 14


def test_resample_identity_when_frames_equal_window():
    assert resample_indices(30) == list(range(30))


def test_resample_longer_than_window_thins_evenly():
    indices = resample_indices(60)
    assert len(indices) == WINDOW_LENGTH_V2
    assert indices[0] == 0
    assert indices[-1] == 59
    assert indices == sorted(indices)


def test_resample_ties_go_to_the_earlier_frame():
    # 40 ms apart, targets 10 ms and 30 ms both sit between frames 0 and 1.
    indices = resample_indices_from_timestamps([0.0, 40.0, 80.0, 120.0], window=3)
    assert indices[0] == 0
    assert indices[-1] == 3
    # Mid target is 60 ms: frame 1 is 20 away, frame 2 is 20 away, tie keeps 1.
    assert indices[1] == 1


def test_resample_within_a_segment_only():
    timestamps = [0.0, 10.0, 20.0, 30.0, 40.0, 50.0]
    indices = resample_indices_from_timestamps(timestamps, window=3, start=1, end=3)
    assert indices[0] == 1
    assert indices[-1] == 3
    assert all(1 <= index <= 3 for index in indices)


def test_resample_empty_is_empty():
    assert resample_indices_from_timestamps([]) == []
    assert resample_indices(0) == []


def test_resample_out_of_range_segment_is_empty():
    assert resample_indices_from_timestamps([0.0, 1.0], window=3, start=1, end=0) == []


def test_gap_inside_a_segment_stays_inside():
    present = [True] * 5 + [False] * GAP_MAX + [True] * 5
    assert segments_from_presence(present) == [(0, 13)]


def test_longer_gap_splits_and_is_not_counted():
    present = [True] * 5 + [False] * (GAP_MAX + 1) + [True] * 5
    segments = segments_from_presence(present)
    assert segments == [(0, 5), (9, 14)]
    # The hand-less run belongs to neither segment.
    assert all(not present[index] for index in range(5, 9))


def test_leading_and_trailing_hand_less_frames_are_ignored():
    present = [False] * 4 + [True] * 3 + [False] * 2
    assert segments_from_presence(present) == [(4, 7)]
    assert segments_from_presence([False, False]) == []


def test_segment_too_short_for_the_minimum_is_dropped():
    frames = [None] * 5 + [frame_at(0.0)] * (MIN_SEGMENT_FRAMES - 5)
    frames += [None] * (GAP_MAX + 1) + [frame_at(0.0)] * (MIN_SEGMENT_FRAMES - 1)
    timestamps = list(range(len(frames)))

    sequence, stats = build_sequence(frames, timestamps)
    assert sequence is None
    assert stats["reason"] == "too_few_hands"
    # Neither run reaches the minimum; the longer one is reported.
    assert stats["best_segment_frames"] == MIN_SEGMENT_FRAMES - 1


def test_a_15_frame_segment_still_makes_a_full_window():
    frames = [frame_at(0.0)] * MIN_SEGMENT_FRAMES
    sequence, stats = build_sequence(frames, list(range(MIN_SEGMENT_FRAMES)))

    assert sequence is not None
    assert len(sequence) == WINDOW_LENGTH_V2
    assert all(len(row) == FEATURE_LENGTH_V2 for row in sequence)
    assert stats["segment"] == (0, MIN_SEGMENT_FRAMES)
    assert stats["valid_frames"] == WINDOW_LENGTH_V2


def test_longest_usable_segment_wins():
    short_run = [frame_at(0.0)] * MIN_SEGMENT_FRAMES
    long_run = [frame_at(1.0)] * (MIN_SEGMENT_FRAMES + 12)
    frames = short_run + [None] * (GAP_MAX + 1) + long_run
    timestamps = list(range(len(frames)))

    sequence, stats = build_sequence(frames, timestamps)
    assert sequence is not None
    assert stats["segment"] == (short_run.__len__() + GAP_MAX + 1, len(frames))
    # Every row came from the long run, whose body x is 1.0.
    assert all(abs(row[126] - 1.0) < 1e-6 for row in sequence)


def test_frame_without_hands_is_a_row_of_zeros():
    frames = [frame_at(0.2)] * 25 + [None] + [frame_at(0.2)] * 5
    timestamps = list(range(len(frames)))
    sequence, _ = build_sequence(frames, timestamps)

    assert sequence is not None
    blank = [0.0] * FEATURE_LENGTH_V2
    assert blank in sequence
    assert sequence.count(blank) == 1


def body_number(row: list[float], slot: int, offset: int) -> float:
    """One body number of a finished row: x, y, dx, dy or size."""
    return row[126 + slot * 5 + offset]


def test_movement_is_computed_after_resampling():
    # Two source frames, stretched to 30. Movement must stay zero, because
    # resampling can repeat a frame and a repeated frame has not moved.
    frames = [frame_at(0.0), frame_at(0.0)]
    indices = resample_indices(2)
    sequence = assemble_sequence(frames, indices)
    assert sequence is not None
    assert len(sequence) == WINDOW_LENGTH_V2
    for row in sequence:
        for slot in (0, 1):
            assert body_number(row, slot, 2) == 0.0
            assert body_number(row, slot, 3) == 0.0


def test_movement_across_real_steps_is_the_difference():
    frames = [frame_at(0.0), frame_at(1.0)]
    indices = resample_indices(2)
    sequence = assemble_sequence(frames, indices)
    assert sequence is not None
    # Slot 0 sits at x, slot 1 at x + 1 in frame_at, so both move by 1.0 on
    # the first row taken from the second frame, then settle at zero.
    change = indices.index(1)
    for row in sequence[:change]:
        for slot in (0, 1):
            assert body_number(row, slot, 2) == 0.0
            assert body_number(row, slot, 3) == 0.0
    # The first row taken from the second frame reports the step, and the
    # rows that repeat it afterwards report no further movement.
    for slot in (0, 1):
        assert abs(body_number(sequence[change], slot, 2) - 1.0) < 1e-6
        assert body_number(sequence[change], slot, 3) == 0.0
    for row in sequence[change + 1 :]:
        for slot in (0, 1):
            assert body_number(row, slot, 2) == 0.0


def test_slot_without_hands_in_the_previous_frame_reports_no_movement():
    frame = empty_slot_frame()
    sequence = assemble_sequence([frame, frame], resample_indices(2))
    assert sequence is not None
    # Slot 1 is empty every time, so its numbers stay zero throughout.
    for row in sequence:
        for offset in range(5):
            assert body_number(row, 1, offset) == 0.0
    # Slot 0 is filled, so it does carry a position.
    assert body_number(sequence[0], 0, 0) != 0.0
    assert sequence[-1][126:126 + 5] != [0.0] * 5


def test_one_hand_leaves_the_empty_slot_at_zero():
    frame = empty_slot_frame()
    assert frame.present == (True, False)
    assert frame.body[3:] == [0.0] * 3


def test_too_few_valid_frames_in_a_full_window_is_refused():
    # A segment with enough hands to be usable, but too few of them survive
    # resampling to fill a 30 frame window.
    frames = ([frame_at(0.0)] + [None] * 3) * 20
    sequence, stats = build_sequence(frames, list(range(len(frames))))
    assert sequence is None
    assert stats["reason"] == "too_few_valid_frames"


def test_assemble_sequence_refuses_a_window_under_the_minimum():
    frames = [frame_at(0.0)] * (MIN_VALID_FRAMES - 1) + [None]
    assert assemble_sequence(frames, list(range(len(frames)))) is None


def test_no_frames_at_all_is_unreadable():
    assert build_sequence([], []) == (None, {"reason": "unreadable"})


def test_timestamp_and_frame_mismatch_is_an_error():
    import pytest

    with pytest.raises(ValueError):
        build_sequence([frame_at(0.0)], [])


def test_assemble_sequence_never_shortens_a_missing_row():
    frames: list[Frame | None] = [frame_at(0.0)] * 12 + [None] + [frame_at(0.0)] * 13
    sequence = assemble_sequence(frames, list(range(len(frames))))
    assert sequence is not None
    assert len(sequence) == len(frames)
    assert sequence[12] == [0.0] * FEATURE_LENGTH_V2
    assert sequence[11] != sequence[12]
