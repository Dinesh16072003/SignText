import importlib.util
from datetime import datetime, timezone
from pathlib import Path

import sqlalchemy as sa

VERSIONS_DIR = Path(__file__).resolve().parent / "versions"


def _load_version_module(module_path: Path):
    spec = importlib.util.spec_from_file_location(module_path.stem, module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not hasattr(module, "VERSION") or not callable(getattr(module, "upgrade", None)):
        raise RuntimeError(
            f"Migration {module_path.name} must define VERSION and upgrade(connection)"
        )
    return module


def get_versions() -> dict[int, callable]:
    versions: dict[int, callable] = {}
    for module_path in sorted(VERSIONS_DIR.glob("*.py")):
        if module_path.name.startswith("_"):
            continue
        module = _load_version_module(module_path)
        version = int(module.VERSION)
        if version in versions:
            raise RuntimeError(f"Duplicate migration version {version}")
        versions[version] = module.upgrade
    return dict(sorted(versions.items()))


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_migrations(engine) -> list[int]:
    """Applies every pending migration inside one transaction.

    Returns the list of versions that were newly applied. Safe to run any
    number of times: applied versions are recorded in schema_migrations and
    each migration also checks its own state before making changes.
    """
    versions = get_versions()
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE IF NOT EXISTS schema_migrations ("
                "version INTEGER PRIMARY KEY, "
                "applied_at TEXT NOT NULL)"
            )
        )
        applied = {
            row[0]
            for row in connection.execute(sa.text("SELECT version FROM schema_migrations"))
        }
        pending = {version: fn for version, fn in versions.items() if version not in applied}

        for version in sorted(pending):
            pending[version](connection)
            connection.execute(
                sa.text(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (:v, :at)"
                ),
                {"v": version, "at": _utcnow_iso()},
            )

        return sorted(pending)