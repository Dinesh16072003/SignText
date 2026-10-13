import threading
import time

from app.security.tokens import decode_access_token

_denied: dict[str, float] = {}
_lock = threading.Lock()


def _prune() -> None:
    now = time.time()
    expired = [jti for jti, expires in _denied.items() if expires <= now]
    for jti in expired:
        _denied.pop(jti, None)


def deny(jti: str, expires_at: float) -> None:
    if expires_at <= time.time():
        return
    with _lock:
        _prune()
        _denied[jti] = expires_at


def is_denied(jti: str) -> bool:
    with _lock:
        _prune()
        return jti in _denied


def deny_access_token(token: str) -> None:
    payload = decode_access_token(token)
    if payload and payload.get("jti") and payload.get("exp"):
        deny(str(payload["jti"]), float(payload["exp"]))


def clear() -> None:
    with _lock:
        _denied.clear()