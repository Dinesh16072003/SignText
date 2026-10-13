import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _import_config_with_secret(secret: str | None) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env["SIGNTEXT_RUN_MIGRATIONS"] = "0"
    if secret is None:
        env.pop("SIGNTEXT_SECRET_KEY", None)
    else:
        env["SIGNTEXT_SECRET_KEY"] = secret
    return subprocess.run(
        [sys.executable, "-c", "import app.config"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
    )


def test_short_secret_key_is_rejected():
    result = _import_config_with_secret("too-short")
    assert result.returncode != 0
    assert "SIGNTEXT_SECRET_KEY" in result.stderr


def test_long_enough_secret_key_is_accepted():
    result = _import_config_with_secret("0123456789abcdef0123456789abcdef")
    assert result.returncode == 0
    assert "SIGNTEXT_SECRET_KEY" not in result.stderr