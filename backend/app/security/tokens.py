import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.config import ACCESS_TOKEN_MINUTES, REFRESH_TOKEN_DAYS, SECRET_KEY

ALGORITHM = "HS256"


def create_access_token(
    user_id: uuid.UUID, expires_delta: timedelta | None = None
) -> tuple[str, int]:
    now = datetime.now(timezone.utc)
    expires = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_MINUTES))
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int(expires.timestamp()),
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return token, max(int((expires - now).total_seconds()), 0)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def refresh_expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS)
