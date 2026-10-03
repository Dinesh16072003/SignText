# Signtext Feature Specification

This file is the contract between the browser and the Python training code.
The browser implementation is `frontend/src/services/handFeatures.js` and its
tests are `frontend/src/services/handFeatures.test.js`. Any change here must be
made in both places, in the same commit.

## Input

One MediaPipe Tasks Vision `HandLandmarker` result for a single video frame,
running in `VIDEO` mode with `numHands: 2`. The only field used is
`landmarks`, an array of hands. Each hand is an array of 21 landmarks, each
landmark an object with `x`, `y` and `z`:

- `x` horizontal position, `0` at the left edge of the image, `1` at the right edge.
- `y` vertical position, `0` at the top edge of the image, `1` at the bottom edge.
- `z` depth relative to the wrist of that same hand. It is smaller when the
  landmark is closer to the camera and its scale is roughly the same as `x`
  and `y`. It is noisier than `x` and `y`.

`landmarks` may be empty. It may also be shorter than two hands. Other fields
of the result, including the `handedness` label, are ignored.

## Output

A plain list of exactly `FEATURE_LENGTH = 126` numbers, or `null` when
`landmarks` is empty.

| Constant | Value | Meaning |
| --- | --- | --- |
| `LANDMARK_COUNT` | 21 | Landmarks per hand |
| `VALUES_PER_LANDMARK` | 3 | `x`, `y`, `z` |
| `FEATURES_PER_HAND` | 63 | `21 * 3` |
| `HAND_SLOT_COUNT` | 2 | Hand slots in every frame |
| `FEATURE_LENGTH` | 126 | `63 * 2`, the output length |
| `WINDOW_LENGTH` | 1 | Frames per model input, 30 for word level signs |
| `MIN_SCALE` | `0.000001` | Smallest allowed scale |

The layout is always the same. Slot 0 occupies numbers 0 to 62, slot 1
occupies numbers 63 to 125.

## Landmark order

Landmarks keep the order MediaPipe returns, which is the standard hand
landmark order. Index 0 is the wrist and index 9 is the base joint of the
middle finger.

| Index | Landmark | Index | Landmark |
| --- | --- | --- | --- |
| 0 | Wrist | 11 | Middle finger tip |
| 1 | Thumb base (CMC) | 12 | Index finger MCP |
| 2 | Thumb MCP | 13 | Index finger PIP |
| 3 | Thumb IP | 14 | Index finger DIP |
| 4 | Thumb tip | 15 | Index finger tip |
| 5 | Index finger MCP | 16 | Pinky MCP |
| 6 | Index finger PIP | 17 | Pinky PIP |
| 7 | Index finger DIP | 18 | Pinky DIP |
| 8 | Index finger tip | 19 | Pinky tip |
| 9 | Middle finger MCP | 20 | Wrist, same point as index 0 |
| 10 | Middle finger PIP | | |

Within one slot, the numbers are written as `x, y, z` for index 0, then `x, y,
z` for index 1, and so on through index 20. Number `3 * i` is the `x` of
landmark `i`, number `3 * i + 1` is its `y`, and number `3 * i + 2` is its
`z`.

## Slot order

1. If there is no hand, return `null`.
2. Sort the hands by the `x` of their wrist, landmark 0, from smallest to
   largest. The hand closest to the left edge of the image comes first.
3. Sorting uses `x` only. The `handedness` label MediaPipe reports is never
   used, because it describes the signer's hand and not its position in the
   frame.
4. Slot 0 holds the left-most hand. Slot 1 holds the next hand to the right.
5. With one hand, slot 0 holds that hand and all 63 numbers of slot 1 are `0`.
6. With no hands, there is no output at all rather than 126 zeros. Training
   code must skip those frames.
7. If more than two hands ever appear, keep the two left-most.

Sorting must not change the order of the caller's array.

## Normalization

Applied to each hand on its own, before the numbers are written into the slot.

1. Take the wrist, landmark 0, as the origin.
2. Subtract the wrist from every landmark, so `x' = x - wrist_x`,
   `y' = y - wrist_y` and `z' = z - wrist_z`. Landmark 0 becomes `0, 0, 0`.
3. Compute one scale for the hand as the straight line distance in three
   dimensions from the wrist to the base joint of the middle finger,
   landmark 9:

   ```
   scale = sqrt((x9 - x0)^2 + (y9 - y0)^2 + (z9 - z0)^2)
   ```

   The `z` axis is included, so the scale is a 3D distance.
4. Clamp the scale: `scale = max(scale, 0.000001)`.
5. Divide every value of that hand by the scale: `value' = value / scale`.

Because the scale is the distance the hand was just measured in, the three
numbers written for landmark 9 always form a vector of length `1`, except in
the clamped case where the hand is collapsed to a point.

Normalization removes the position of the hand in the frame and its distance
from the camera, so the model sees hand shape and pose rather than framing.
It does not remove finger thickness, rotation around the camera axis, or
mirroring. A mirrored camera view still produces usable values because the
shape is mirrored, not distorted.

## Windows

One model input is `WINDOW_LENGTH` consecutive frames:

```
values_per_frame = FEATURE_LENGTH = 126
model_input_length = WINDOW_LENGTH * 126
```

With `WINDOW_LENGTH = 1`, one frame is one input of 126 numbers, which suits
letter level signs. Change the single constant to 30 for word level signs,
then one input is 30 frames of 126 numbers, laid out frame by frame:

```
[frame 0: 126 numbers][frame 1: 126 numbers]...[frame 29: 126 numbers]
```

Frames are not averaged, padded or resampled. The training code drops any
window that contains a frame with no hands, because those frames have no
output at all.

## Rules for the training code

1. Read the video with the same `HandLandmarker` settings as the browser:
   `numHands: 2`, `runningMode: VIDEO`, and the same confidence thresholds
   the app uses, which are `0.6` for detection, presence and tracking.
2. Run extraction in the same order the browser does. Identical frames must
   produce identical numbers in both places.
3. Sort hands by wrist `x` the same way, and never by the handedness label.
4. Label frames where `extractHandFeatures` returns `null` as no hands and
   exclude them from the dataset.
5. Pad the missing hand slot with zeros, never with the other hand and never
   by repeating a frame.
6. Train on windows of `WINDOW_LENGTH` frames and store the class label per
   window.