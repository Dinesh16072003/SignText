"""Downloads the ASL Alphabet dataset from Kaggle and extracts the images the
training pipeline needs.

Usage from the ml/ folder:

    .venv/Scripts/python download_dataset.py --limit-per-class 200

The whole archive is about 1 GB, so it is downloaded once into
ml/datasets/raw/ and reused. Only the 28 classes used for training are
extracted, the nothing class is left out.
"""

from __future__ import annotations

import argparse
import shutil
import sys
import zipfile
from pathlib import Path

from kaggle import KaggleApi

DATASET = "grassknoted/asl-alphabet"
RAW_DIR = Path(__file__).resolve().parent / "datasets" / "raw"

# A to Z, then space and del. The nothing class is deliberately not here.
CLASS_NAMES = [chr(code) for code in range(ord("A"), ord("Z") + 1)] + ["space", "del"]

SPLIT_PREFIX = {
    "train": "asl_alphabet_train",
    "test": "asl_alphabet_test",
}

HELP_TEXT = """Kaggle could not give us this dataset. Here is what to do:

1. Sign in at https://www.kaggle.com and open
   https://www.kaggle.com/datasets/grassknoted/asl-alphabet
2. Scroll to the dataset rules and accept them. The download is refused until
   you do, even with working API credentials.
3. Set up the command line credentials if the message mentions authentication:
     .venv/Scripts/kaggle auth login
   That opens a browser and stores a token for you. If you would rather use an
   API key, create a legacy key at
   https://www.kaggle.com/settings and save it as kaggle.json in your home
   .kaggle folder.
4. Run this script again.
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--limit-per-class",
        type=int,
        default=None,
        help="Extract at most this many images per class. Use a small number to test quickly.",
    )
    parser.add_argument(
        "--split",
        choices=sorted(SPLIT_PREFIX),
        default="train",
        help="Which part of the dataset to extract. Default: train.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parent / "datasets" / "asl_alphabet",
        help="Folder that receives the class folders.",
    )
    parser.add_argument(
        "--force-download",
        action="store_true",
        help="Download the archive again even if it is already in datasets/raw.",
    )
    return parser.parse_args()


def download_archive(force: bool) -> Path:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    existing = sorted(RAW_DIR.glob("*.zip"))
    if existing and not force:
        print(f"Using the archive already in {RAW_DIR}: {existing[0].name}")
        return existing[0]

    print(f"Downloading {DATASET} from Kaggle, this is about 1 GB and takes a while.")
    try:
        KaggleApi().dataset_download_files(DATASET, path=str(RAW_DIR), quiet=False)
    except Exception as error:  # noqa: BLE001 - the message is what matters here
        print(f"\nDownload failed: {error}\n", file=sys.stderr)
        print(HELP_TEXT, file=sys.stderr)
        raise SystemExit(1) from error

    archives = sorted(RAW_DIR.glob("*.zip"))
    if not archives:
        print("\nKaggle reported success but no archive arrived.\n", file=sys.stderr)
        print(HELP_TEXT, file=sys.stderr)
        raise SystemExit(1)
    return archives[0]


def class_members(
    archive: zipfile.ZipFile, split_prefix: str
) -> dict[str, list[str]]:
    """Group the archive entries by class, sorted so runs are repeatable."""
    grouped: dict[str, list[str]] = {name: [] for name in CLASS_NAMES}
    for entry in archive.namelist():
        if not entry.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        if not entry.startswith(f"{split_prefix}/"):
            continue
        # Layout is <split>/<split>/<Class>/<file> for train and
        # <split>/<split>/<Class>_test.jpg for test.
        class_name = entry.split("/")[-2]
        if class_name in grouped:
            grouped[class_name].append(entry)
    for members in grouped.values():
        members.sort()
    return grouped


def extract(
    archive: zipfile.ZipFile, grouped: dict[str, list[str]], output: Path, limit: int | None
) -> None:
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    for class_name, members in grouped.items():
        selected = members if limit is None else members[:limit]
        class_dir = output / class_name
        class_dir.mkdir(parents=True, exist_ok=True)
        for entry in selected:
            target = class_dir / Path(entry).name
            with archive.open(entry) as source, target.open("wb") as destination:
                shutil.copyfileobj(source, destination)
        note = "" if len(selected) == len(members) else f" of {len(members)} available"
        print(f"  {class_name}: {len(selected)} images{note}")


def main() -> None:
    args = parse_args()
    archive_path = download_archive(args.force_download)

    print(f"Opening {archive_path.name}")
    with zipfile.ZipFile(archive_path) as archive:
        grouped = class_members(archive, SPLIT_PREFIX[args.split])

        missing = [name for name, members in grouped.items() if not members]
        if missing:
            print(f"\nThese classes are not in the dataset: {', '.join(missing)}", file=sys.stderr)
            print("Check the dataset page for the current class list.", file=sys.stderr)
            raise SystemExit(1)

        print(f"\nExtracting the {args.split} split into {args.output}")
        extract(archive, grouped, args.output, args.limit_per_class)

    total = sum(
        len(members) if args.limit_per_class is None else min(len(members), args.limit_per_class)
        for members in grouped.values()
    )
    print(f"\nDone. {total} images across {len(CLASS_NAMES)} classes.")
    print("The nothing class is not extracted because the app never predicts it.")


if __name__ == "__main__":
    main()