"""Trains the ASL Alphabet classifier from the Step 5 hand features.

Run from the ml/ folder with:

    .venv/Scripts/python train_alphabet.py

It loads the features and class list, makes a stratified train / validation /
test split with a fixed seed, trains a small fully connected network with
per-epoch augmentation, and writes a SavedModel to ml/checkpoints/.

The test set is split off and then never touched: nothing in this file reads
it after the split.
"""

from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split

import tensorflow as tf
from tensorflow import keras

ML_DIR = Path(__file__).resolve().parent
FEATURES_PATH = ML_DIR / "features" / "asl_features.npz"
CLASSES_PATH = ML_DIR / "features" / "classes.txt"
CHECKPOINT_DIR = ML_DIR / "checkpoints"
EXPORT_DIR = CHECKPOINT_DIR / "alphabet_savedmodel"

SEED = 12345
TEST_SIZE = 0.15
VAL_SIZE = 0.15
EPOCHS = 80
BATCH_SIZE = 64
INPUT_LENGTH = 126
LANDMARKS_PER_HAND = 21
HAND_SLOTS = 2
VALUES_PER_LANDMARK = 3

# Light feature augmentation. Nothing here flips or mirrors a hand: swapping
# the two hand slots or negating x would invent left/right handed signs that
# the class list does not contain.
NOISE_STD = 0.01
MAX_ROTATION = 0.05  # radians, about the wrist
SCALE_RANGE = (0.98, 1.02)


def load_data():
    """Return the features, integer labels and class names."""
    data = np.load(FEATURES_PATH)
    X = np.asarray(data["features"], dtype=np.float32)
    y = np.asarray(data["labels"], dtype=np.int64)
    with open(CLASSES_PATH, "r", encoding="utf-8") as f:
        classes = [line.strip() for line in f if line.strip()]
    if X.shape[1] != INPUT_LENGTH:
        raise ValueError(f"Expected {INPUT_LENGTH} features per row, got {X.shape[1]}")
    if len(classes) != len(set(classes)):
        raise ValueError("Duplicate class names in the class list")
    if y.min() < 0 or y.max() >= len(classes):
        raise ValueError(f"Labels must fall in 0..{len(classes) - 1}")
    return X, y, classes


def split(X, y):
    """Stratified 70 / 15 / 15 split on row indices. Test is never touched."""
    indices = np.arange(len(X))
    train_idx, holdout_idx = train_test_split(
        indices,
        test_size=TEST_SIZE + VAL_SIZE,
        stratify=y,
        random_state=SEED,
    )
    val_idx, test_idx = train_test_split(
        holdout_idx,
        test_size=TEST_SIZE / (TEST_SIZE + VAL_SIZE),
        stratify=y[holdout_idx],
        random_state=SEED,
    )
    return train_idx, val_idx, test_idx


class FeatureAugment(keras.utils.Sequence):
    """Hands the network fresh augmented batches on every epoch.

    Augmentation is per epoch, not per run: each pass over the data resamples
    the noise, the rotation and the scale.
    """

    def __init__(self, X, y, batch_size=BATCH_SIZE, seed=SEED):
        super().__init__()
        self.X = np.asarray(X, dtype=np.float32)
        self.y = np.asarray(y, dtype=np.int64)
        self.batch_size = batch_size
        self.rng = np.random.default_rng(seed)

    def __len__(self):
        return int(np.ceil(len(self.X) / self.batch_size))

    def __getitem__(self, index):
        start = index * self.batch_size
        batch = self.X[start : start + self.batch_size]
        return self._augment(batch), self.y[start : start + self.batch_size]

    def _augment(self, batch):
        out = batch.copy()
        n = len(out)
        if n == 0:
            return out
        # (n, 2 hand slots, 21 landmarks, x, y, z)
        hand = out.reshape(n, HAND_SLOTS, LANDMARKS_PER_HAND, VALUES_PER_LANDMARK)

        # Tiny rotation about the wrist, in the image plane. z is untouched.
        angle = self.rng.uniform(-MAX_ROTATION, MAX_ROTATION, size=n)
        cos = np.cos(angle).reshape(n, 1, 1)
        sin = np.sin(angle).reshape(n, 1, 1)
        x = hand[..., 0].copy()
        y = hand[..., 1].copy()
        hand[..., 0] = x * cos - y * sin
        hand[..., 1] = x * sin + y * cos

        # Tiny rescale of the whole hand.
        scale = self.rng.uniform(SCALE_RANGE[0], SCALE_RANGE[1], size=n)
        hand *= scale.reshape(n, 1, 1, 1)

        # Small sensor noise, but only where a hand is actually present. The
        # unused second slot is all zeros for one-handed frames and must stay
        # zeros, as ml/FEATURE_SPEC.md requires.
        present = (np.abs(hand) > 0).any(axis=3, keepdims=True)
        noise = self.rng.normal(0.0, NOISE_STD, size=hand.shape)
        hand += noise * present

        return out


def build_model(num_classes):
    model = keras.Sequential(
        [
            keras.layers.Input(shape=(INPUT_LENGTH,)),
            keras.layers.Dense(256, activation="relu"),
            keras.layers.Dropout(0.25),
            keras.layers.Dense(128, activation="relu"),
            keras.layers.Dropout(0.2),
            keras.layers.Dense(64, activation="relu"),
            keras.layers.Dropout(0.1),
            keras.layers.Dense(num_classes, activation="softmax"),
        ]
    )
    model.compile(
        optimizer=keras.optimizers.Adam(1e-3),
        loss="sparse_categorical_crossentropy",
        metrics=["accuracy"],
    )
    return model


def print_progress(history, stopped_early):
    print()
    print("Epoch  loss    acc     val_loss  val_acc")
    print("-----  ------  ------  --------  -------")
    for i, values in enumerate(zip(
        history.history["loss"],
        history.history["accuracy"],
        history.history["val_loss"],
        history.history["val_accuracy"],
    ), start=1):
        loss, acc, val_loss, val_acc = values
        print(f"{i:>5}  {loss:.4f}  {acc:.4f}  {val_loss:.4f}   {val_acc:.4f}")

    val_loss = history.history["val_loss"]
    best_epoch = int(np.argmin(val_loss)) + 1
    print()
    print(f"Epochs run:      {len(val_loss)}")
    if stopped_early:
        print(f"Stopped early:   yes, at epoch {len(val_loss)}")
    else:
        print("Stopped early:   no, ran the full epoch budget")
    print(f"Best epoch:      {best_epoch} (val_loss {min(val_loss):.4f})")
    print(
        "Best val accuracy: "
        f"{max(history.history['val_accuracy']):.4f}"
    )


def main():
    np.random.seed(SEED)
    tf.random.set_seed(SEED)

    X, y, classes = load_data()
    num_classes = len(classes)
    print(f"Loaded {len(X)} samples, {X.shape[1]} features, {num_classes} classes")

    train_idx, val_idx, test_idx = split(X, y)
    print(
        f"Split (seed {SEED}): "
        f"train={len(train_idx)} val={len(val_idx)} test={len(test_idx)}"
    )
    print("Test set is held out and will not be read again.")

    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    np.savez(
        CHECKPOINT_DIR / "split_indices.npz",
        train=train_idx,
        val=val_idx,
        test=test_idx,
    )

    model = build_model(num_classes)
    model.summary()

    early_stop = keras.callbacks.EarlyStopping(
        monitor="val_loss",
        patience=12,
        restore_best_weights=True,
    )
    history = model.fit(
        FeatureAugment(X[train_idx], y[train_idx]),
        validation_data=(X[val_idx], y[val_idx]),
        epochs=EPOCHS,
        callbacks=[early_stop],
        verbose=1,
    )
    stopped_early = len(history.history["val_loss"]) < EPOCHS

    if EXPORT_DIR.exists():
        shutil.rmtree(EXPORT_DIR)
    model.export(str(EXPORT_DIR))
    print(f"SavedModel written to {EXPORT_DIR}")

    print_progress(history, stopped_early)


if __name__ == "__main__":
    main()
