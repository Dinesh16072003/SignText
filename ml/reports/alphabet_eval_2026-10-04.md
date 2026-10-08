# Alphabet Classifier Evaluation (2026-10-04)

- Features: ml/features/asl_features.npz
- Classes: ml/features/classes.txt (n=28)
- Seed: 12345
- Split: train=3721, val=1064, test=532

## Overall test accuracy
0.9868

## Caveat
This score comes from a dataset with few signers and may be higher than real-world accuracy.

## Per-class accuracy
- A: 1.000
- B: 1.000
- C: 0.950
- D: 1.000
- E: 1.000
- F: 1.000
- G: 1.000
- H: 1.000
- I: 1.000
- J: 0.944
- K: 1.000
- L: 0.950
- M: 1.000
- N: 1.000
- O: 1.000
- P: 1.000
- Q: 1.000
- R: 1.000
- S: 1.000
- T: 1.000
- U: 1.000
- V: 0.950
- W: 1.000
- X: 1.000
- Y: 1.000
- Z: 1.000
- space: 0.900
- del: 0.947

## Top 10 most confused letter pairs (true -> predicted, count)
- C -> L: 1
- J -> I: 1
- L -> N: 1
- V -> space: 1
- space -> E: 1
- space -> W: 1
- del -> W: 1

## Weakest classes (lowest per-class accuracy)
- space: 0.900
- J: 0.944
- del: 0.947
- C: 0.950
- L: 0.950
