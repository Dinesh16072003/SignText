import logging
import os
import secrets
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

load_dotenv(BASE_DIR / ".env")


def _split_origins(value: str) -> list[str]:
    return [origin.strip() for origin in value.split(",") if origin.strip()]


DATABASE_URL = os.getenv(
    "SIGNTEXT_DATABASE_URL",
    f"sqlite:///{(BASE_DIR / 'signtext.sqlite').as_posix()}",
)
CORS_ORIGINS = _split_origins(
    os.getenv("SIGNTEXT_CORS_ORIGINS", "http://localhost:5173")
)

RUN_MIGRATIONS = os.getenv("SIGNTEXT_RUN_MIGRATIONS", "1").strip().lower() not in (
    "0",
    "false",
    "no",
    "off",
)

SECRET_KEY = os.getenv("SIGNTEXT_SECRET_KEY", "").strip()
if not SECRET_KEY:
    SECRET_KEY = secrets.token_urlsafe(48)
    logging.getLogger("app.config").warning(
        "SIGNTEXT_SECRET_KEY is not set. A temporary secret was generated for "
        "this process, so access tokens will stop working after a restart. Set "
        "SIGNTEXT_SECRET_KEY in backend/.env for real use."
    )
elif len(SECRET_KEY) < 32:
    raise ValueError(
        "SIGNTEXT_SECRET_KEY is too short to be safe. Use at least 32 "
        "characters and choose it with a random generator (e.g. "
        "'python -c \"import secrets; print(secrets.token_urlsafe(48))\"')."
    )

ACCESS_TOKEN_MINUTES = int(os.getenv("SIGNTEXT_ACCESS_TOKEN_MINUTES", "30"))
REFRESH_TOKEN_DAYS = int(os.getenv("SIGNTEXT_REFRESH_TOKEN_DAYS", "30"))
REFRESH_COOKIE = "signtext_refresh"
REFRESH_COOKIE_MAX_AGE = REFRESH_TOKEN_DAYS * 86400
# "auto" sends Secure only over HTTPS; "1" or "0" forces it either way.
COOKIE_SECURE = os.getenv("SIGNTEXT_COOKIE_SECURE", "auto").strip().lower()
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = int(os.getenv("SIGNTEXT_PASSWORD_MAX_LENGTH", "128"))
MAX_BODY_BYTES = int(os.getenv("SIGNTEXT_MAX_BODY_BYTES", "500000"))
LOGIN_RATE_LIMIT = int(os.getenv("SIGNTEXT_LOGIN_RATE_LIMIT", "10"))
LOGIN_RATE_WINDOW_SECONDS = int(
    os.getenv("SIGNTEXT_LOGIN_RATE_WINDOW_SECONDS", "60")
)
REFRESH_RATE_LIMIT = int(os.getenv("SIGNTEXT_REFRESH_RATE_LIMIT", "20"))
REFRESH_RATE_WINDOW_SECONDS = int(
    os.getenv("SIGNTEXT_REFRESH_RATE_WINDOW_SECONDS", "60")
)
SIGNUP_RATE_LIMIT = int(os.getenv("SIGNTEXT_SIGNUP_RATE_LIMIT", "10"))
SIGNUP_RATE_WINDOW_SECONDS = int(
    os.getenv("SIGNTEXT_SIGNUP_RATE_WINDOW_SECONDS", "3600")
)
