# Signtext training (`ml/`)

## Converting the model to TensorFlow.js

The TensorFlow.js converter is never installed on this computer. It runs in Google Colab instead. You upload the SavedModel, Colab converts it, and you download a zip.

### How this model was converted

Three things ruled out the easy routes, which is why the notebook below looks the way it does.

1. **The Windows path has a space.** The repository lives in `E:\projects\sign language web`, and the first conversion attempt ran on this machine. The path was handed to the converter with the space in `sign language web` still in it, so it was taken for two arguments, the folder was never found and the run stopped there. Paths built with `pathlib` inside a script survive this; a command line that is not quoted does not.
2. **`tensorflow_decision_forests` blocks a local install.** `tensorflowjs` imports `tensorflow_decision_forests` and `tensorflow_hub` at startup even though a plain Keras graph never uses either. `tensorflow-decision-forests` cannot even load against TensorFlow 2.21, and both packages drag in older pinned dependencies that would move the TensorFlow the training code uses. They are deliberately not installed anywhere; the notebook's converter launcher stubs them out and raises a loud error if a conversion ever really touches one.
3. **The plain Colab route failed on Colab's newer package versions.** The first notebook just ran `pip install tensorflowjs` in Colab's own interpreter and converted. Colab ships newer package versions than that converter supports, and NumPy 2.x has dropped some of the aliases it reads while loading, so the run failed there too. The notebook that ships in `ml/notebooks/convert_to_tfjs.ipynb` instead builds an isolated Python 3.11 environment with `uv`, pinned to the versions below, and leaves Colab's interpreter alone.

Pinned versions: TensorFlow 2.21.0, NumPy 2.4.6, tf-keras 2.21.0, TensorFlow.js 4.22.0, jax/jaxlib 0.4.35, ml-dtypes 0.6.0.

### Before you start

You need a SavedModel at `ml/checkpoints/alphabet_savedmodel`. If it is missing, train first with `.venv/Scripts/python train_alphabet.py`.

### Steps

1. **Zip the SavedModel folder.** In `ml/checkpoints/`, right-click `alphabet_savedmodel` and choose *Send to > Compressed (zipped) folder*. You get `alphabet_savedmodel.zip`.

   The zip must contain the folder itself, so `saved_model.pb` sits one level down at `alphabet_savedmodel/saved_model.pb`. Zipping the *contents* of the folder will not work.

2. **Open the notebook.** Go to [colab.research.google.com](https://colab.research.google.com), choose *File > Upload notebook*, and pick `ml/notebooks/convert_to_tfjs.ipynb`.

3. **Run Step 1.** Press *Shift+Enter* on the install cell. It installs `tensorflowjs` inside Colab. This is the only install, and it happens on Google's machine.

4. **Run Step 2 and upload the zip** from step 1. Wait for the cell to print `Uploaded <name> (<size> bytes).` followed by `Using <name> (<size> bytes).`. The cell clears any leftover zip from an earlier run first, so the file it reports is always the one you just picked.

5. **Run Steps 3 and 4.** The notebook unpacks the zip, finds the folder holding `saved_model.pb`, and converts it to TensorFlow.js. It prints the Python, NumPy and tensorflowjs versions first, then the output files when it finishes.

   Colab ships NumPy 2.x, which no longer has the `np.object` alias some tensorflowjs builds read while loading. Step 4 restores that alias in a small startup file before tensorflowjs is imported. No NumPy version is pinned.

6. **Run Step 5.** Your browser downloads `tfjs_model.zip`. If nothing appears, allow downloads for the site.

7. **Unzip the download** into `frontend/public/models/sign-model/`, beside `class_names.json`. You should end up with `model.json` and the weight shard files in that folder.

### If a step fails

Each cell stops and prints the exact error instead of continuing. Read the message, fix that one thing, and rerun that single cell. Do not rerun the whole notebook from the top.

Common messages:

| Message | What to do |
| --- | --- |
| `Expected a .zip file` | You uploaded something other than the zip from step 1. |
| `No file was selected` | The upload dialog was closed with nothing chosen. Run Step 2 again. |
| `No matching .zip was written to` | Colab did not keep the upload. Run Step 2 again; it clears old files first. |
| `zip_path is missing` | Step 3 ran before Step 2. Run Step 2, then run Step 3 again. |
| `No saved_model.pb found in the zip` | The zip has the folder's contents at the top level. Rezip the `alphabet_savedmodel` folder itself. |
| `The zip holds more than one SavedModel` | The zip covers more than one model. Zip only `alphabet_savedmodel`. |
| `tensorflowjs_converter failed` | Copy the stdout and stderr it prints and check the SavedModel exists. |
