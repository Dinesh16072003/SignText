import threading
import time
from collections import deque

from app.config import (
    LOGIN_RATE_LIMIT,
    LOGIN_RATE_WINDOW_SECONDS,
    REFRESH_RATE_LIMIT,
    REFRESH_RATE_WINDOW_SECONDS,
)


class LoginRateLimiter:
    def __init__(self, max_attempts: int, window_seconds: int) -> None:
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._failures: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _prune(self, key: str) -> None:
        attempts = self._failures.get(key)
        if not attempts:
            return
        cutoff = time.monotonic() - self.window_seconds
        while attempts and attempts[0] < cutoff:
            attempts.popleft()
        if not attempts:
            self._failures.pop(key, None)

    def is_blocked(self, key: str) -> bool:
        with self._lock:
            self._prune(key)
            return len(self._failures.get(key, ())) >= self.max_attempts

    def register_failure(self, key: str) -> None:
        with self._lock:
            self._prune(key)
            self._failures.setdefault(key, deque()).append(time.monotonic())

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()


login_rate_limiter = LoginRateLimiter(LOGIN_RATE_LIMIT, LOGIN_RATE_WINDOW_SECONDS)
refresh_rate_limiter = LoginRateLimiter(
    REFRESH_RATE_LIMIT, REFRESH_RATE_WINDOW_SECONDS
)


def clear_all_ratelimiters() -> None:
    login_rate_limiter.clear()
    refresh_rate_limiter.clear()
