# Alphabet Classifier Evaluation (2026-10-06)

- Model: ml/checkpoints/alphabet_savedmodel
- Features: ml/features/asl_features.npz
- Classes: ml/features/classes.txt (n=28)
- Seed: 12345
- Split: train=3721, val=798, test=798

## Overall test accuracy
0.9799

## Caveat
This score comes from a dataset with few signers and may be higher than real-world accuracy.

## Per-class accuracy
- A: 1.000
- B: 1.000
- C: 0.933
- D: 0.967
- E: 0.967
- F: 1.000
- G: 1.000
- H: 0.966
- I: 0.967
- J: 0.929
- K: 1.000
- L: 1.000
- M: 1.000
- N: 0.929
- O: 1.000
- P: 1.000
- Q: 1.000
- R: 0.967
- S: 1.000
- T: 1.000
- U: 0.964
- V: 1.000
- W: 1.000
- X: 1.000
- Y: 0.967
- Z: 1.000
- space: 0.900
- del: 0.966

## Top 10 most confused letter pairs (true -> predicted, count)
- C -> L: 1
- C -> T: 1
- D -> J: 1
- E -> R: 1
- H -> J: 1
- I -> E: 1
- J -> I: 1
- J -> space: 1
- N -> W: 1
- R -> E: 1

## Weakest classes (lowest per-class accuracy)
- space: 0.900
- J: 0.929
- N: 0.929
- C: 0.933
- U: 0.964
