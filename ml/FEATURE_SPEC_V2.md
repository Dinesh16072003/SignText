# Signtext Feature Specification v2 — word level signs

This file is the contract for word level signs. It is version 2 because the
model input is a whole gesture rather than one frame. The letter level
contract, `ml/FEATURE_SPEC.md`, is unchanged and still governs `alphabet-v1`.

The Python implementation is `ml/hand_features_v2.py` with tests in
`ml/tests/test_hand_features_v2.py`. The browser twin is added when the word
model is wired into the app. Any change here must be made in every
implementation in the same commit.

## Why a version 2

Hand shape alone does not tell several signs apart, because the same handshape
means different words in different places and with different movement. Version
2 therefore keeps every number v1 produces and adds a small body block that
describes where each hand is, how it is moving, and how big it is relative to
the signer's body.

The 126 hand numbers are produced by the same function as v1,
`extract_hand_features` in `ml/hand_features.py`. Nothing about hand shape
normalisation, slot order or sorting changes. A v2 frame is v1 followed by the
body block.

## Input

- One `HandLandmarker` result for the frame, `numHands: 2`, exactly as v1.
- One `PoseLandmarker` result for the same frame, `numPoses: 1`. Only the two
  shoulder landmarks are read: index 11 (left shoulder) and index 12 (right
  shoulder). Their `x` and `y` are image normalised, 0 at the left and top
  edges. Pose `z` is never used: it is measured from the pelvis while hand `z`
  is measured from the wrist, so the two do not share a scale.

A frame may have no hands, one hand, two hands, and may or may not have a
usable pose.

## Output of one frame

A plain list of exactly `FEATURE_LENGTH_V2 = 136` numbers, or `None` when the
frame has no hands.

| Constant | Value | Meaning |
| --- | --- | --- |
| `HAND_FEATURE_LENGTH` | 126 | The v1 hand block, unchanged |
| `BODY_FEATURES_PER_HAND` | 5 | Body numbers per hand slot |
| `FEATURE_LENGTH_V2` | 136 | `126 + 5 * 2`, one frame |
| `WINDOW_LENGTH_V2` | 30 | Frames in one model input |
| `SHOULDER_LEFT_INDEX` | 11 | Pose landmark, left shoulder |
| `SHOULDER_RIGHT_INDEX` | 12 | Pose landmark, right shoulder |
| `GAP_MAX` | 3 | Longest hand-less gap that stays inside a segment |
| `MIN_SEGMENT_FRAMES` | 15 | Shortest segment worth resampling |
| `MIN_VALID_FRAMES` | 24 | Frames with hands required in a finished sequence |
| `BODY_SCALE_MIN` | `0.000001` | Smallest allowed shoulder width |

The layout is always the same. Numbers 0 to 125 are the v1 hand block, in the
v1 order: slot 0 then slot 1, each 63 numbers, each hand `x, y, z` per landmark
in landmark order. Numbers 126 to 135 are the body block, slot 0 then slot 1,
five numbers each:

| Offset | Meaning |
| --- | --- |
| 0 | Wrist `x` minus shoulder midpoint `x`, divided by shoulder width |
| 1 | Wrist `y` minus shoulder midpoint `y`, divided by shoulder width |
| 2 | Frame to frame change of offset 0 |
| 3 | Frame to frame change of offset 1 |
| 4 | Hand scale divided by shoulder width |

`x` and `y` only. Hand scale is the v1 quantity, the wrist to middle finger
base distance before it is clamped.

## Body reference

1. Take the two shoulders, pose landmarks 11 and 12.
2. The origin is their midpoint: `mid_x = (x11 + x12) / 2`, `y` likewise.
3. The scale is the shoulder width, the straight line distance between the two
   shoulders in the image plane: `sqrt((x12 - x11)^2 + (y12 - y11)^2)`.
4. Clamp it: `width = max(width, 0.000001)`.
5. For each hand slot, write the wrist position relative to the midpoint,
   divided by the width, then the hand scale divided by the width.

The result is the hand's position and size measured against the signer's own
body, so it survives a camera that is close, far, high or low.

## Movement

Offsets 2 and 3 are the change since the **previous frame of the finished
30 frame sequence**, computed after resampling, not before.

- On the first frame of the sequence they are `0`.
- On any later frame they are that frame's offset minus the same slot's offset
  in the previous frame.
- If the previous frame had no value for that slot, they are `0`. Slots are
  positional, so a frame where the left most hand disappeared simply has no
  change to report.

## Missing hands and missing pose

1. No hands in a frame: there is no frame output at all, not 136 zeros. The
   sequence rules below decide whether that frame is tolerated or splits the
   video.
2. One hand in a frame: the empty slot's 126 hand numbers are zeros, and its
   five body numbers are zeros as well.
3. No usable shoulders in a frame: the body block of that frame is zeros for
   both slots. The hand block is still written, so such frames are a state the
   model can learn rather than a hole in the data.
4. Both hands and no pose is a legitimate frame. Training data must contain
   some, so zeros are in distribution.

## Resampling to 30 frames

A stored video is trimmed to the sign first, then every frame is read with its
media timestamp. The 30 target times are spread evenly across the segment:

```
duration = last_timestamp - first_timestamp
target_i = first_timestamp + i * duration / 29,  i = 0 .. 29
```

Each target takes the frame with the nearest timestamp. Ties go to the earlier
frame. Frames are never interpolated, averaged or invented: a short sign is
stretched by repeating frames, and a long sign is thinned by skipping them.

Resampling is by timestamp and never by frame index, because Python and the
browser can decode a different number of frames from the same file.

Live capture does not resample a file. It keeps the last 30 sampled frames at a
fixed cadence, which is the same 30 frame contract with a rolling source.

## Turning one video into one sequence

One video produces at most one sequence, from its longest usable segment:

1. Read every frame and extract hand features. A frame with no hands has no
   features.
2. Split the video at every run of more than `GAP_MAX` consecutive hand-less
   frames. A run of `GAP_MAX` or fewer hand-less frames is tolerated and stays
   inside the segment.
3. Drop segments shorter than `MIN_SEGMENT_FRAMES` frames that have hands.
4. Keep the longest remaining segment. Ties go to the earliest segment.
5. Resample that segment to 30 frames by the rule above.
6. Compute the 136 numbers for each of the 30 frames, with movement taken from
   the previous resampled frame.
7. If fewer than `MIN_VALID_FRAMES` of the 30 have hands, the video is skipped.

The video is skipped, with the reason recorded, when it cannot be read, when no
segment reaches `MIN_SEGMENT_FRAMES`, or when step 7 fails.

## What must be identical between Python and the browser

Bit for bit, given the same landmarks and the same timestamps:

1. The resampling rule, including the tie break.
2. Slot order and the sort by wrist `x`, from v1.
3. The 126 hand numbers, from v1's `extract_hand_features`.
4. The body reference: shoulder midpoint, shoulder width, image plane only,
   clamped width.
5. The five body numbers per slot and the movement rule.
6. Every zero padding rule above.
7. The gap, segment and validity thresholds.
8. The frame major layout and `FEATURE_LENGTH_V2 = 136`.

Detector confidence thresholds may differ between building a dataset and
running live, and the value used must be reported with the dataset, as v1 rule
2 requires. Model inference itself is compared separately, in the same way as
`ml/tests/test_tfjs_parity.py`.

## The recognition model

Not trained yet. Part 8C only produces the sequences. The model will read one
row of `30 * 136 = 4080` numbers and will live in its own directory,
`frontend/public/models/word-model/`, with its own `class_names.json`. Nothing
in this file may change the shape or behaviour of `alphabet-v1`.
