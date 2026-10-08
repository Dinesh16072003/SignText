# TensorFlow.js Model Parity Check (2026-10-08)

- Converted model: frontend/public/models/sign-model/model.json
- Original model: ml/checkpoints/alphabet_savedmodel
- Samples: 56 held-out test rows, up to 2 per class, picked in class order

## Environment
- Python 3.11.9 (E:\projects\sign language web\ml\.venv\Scripts\python.exe)
- TensorFlow 2.21.0
- NumPy 2.4.6
- OS Windows-10-10.0.26300-SP0
- TensorFlow.js model converted by TensorFlow.js Converter v4.22.0

## Result
- Predictions that match: 56/56
- Largest probability difference: 2.384e-07
- Tolerance: 1e-05
- Outcome: PASS

## Class order checked
- class_names.json has 28 entries and matches ml/features/classes.txt
- A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z, space, del

## Samples that disagreed
- none
