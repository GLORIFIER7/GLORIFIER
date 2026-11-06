from __future__ import annotations

import hmac
import secrets
import threading
import time


class FixedWindowRateLimiter:
    """Bounded, process-local limiter keyed by client address, not credentials."""

    def __init__(
        self,
        max_requests: int = 60,
        window_seconds: int = 60,
        max_keys: int = 10_000,
        clock=time.monotonic,
    ) -> None:
        if max_requests < 1 or window_seconds < 1 or max_keys < 1:
            raise ValueError("rate-limit settings must be positive")
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.max_keys = max_keys
        self._clock = clock
        # Cloudflare Workers forbid entropy during module startup. Generate the
        # per-isolate fingerprint key lazily on the first request instead.
        self._fingerprint_key: bytes | None = None
        self._lock = threading.Lock()
        self._windows: dict[str, tuple[int, int]] = {}

    def allow(self, client_host: str) -> tuple[bool, int]:
        """Apply one quota per client address without retaining credentials or raw IPs."""
        now = self._clock()
        window = int(now // self.window_seconds)
        retry_after = max(1, int((window + 1) * self.window_seconds - now))
        with self._lock:
            if self._fingerprint_key is None:
                self._fingerprint_key = secrets.token_bytes(32)
            key = hmac.digest(
                self._fingerprint_key,
                client_host.encode("utf-8"),
                "sha256",
            ).hex()
            current = self._windows.get(key)
            if current is None or current[0] != window:
                if len(self._windows) >= self.max_keys:
                    expired = [k for k, value in self._windows.items() if value[0] != window]
                    for old_key in expired:
                        self._windows.pop(old_key, None)
                if len(self._windows) >= self.max_keys:
                    # Fail closed rather than grow attacker-controlled state without bound.
                    return False, retry_after
                self._windows[key] = (window, 1)
                return True, retry_after
            if current[1] >= self.max_requests:
                return False, retry_after
            self._windows[key] = (window, current[1] + 1)
            return True, retry_after
