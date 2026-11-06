from app.rate_limit import FixedWindowRateLimiter


def test_fixed_window_allows_limit_then_returns_retry_after():
    now = [10.0]
    limiter = FixedWindowRateLimiter(max_requests=2, window_seconds=10, clock=lambda: now[0])

    assert limiter.allow("127.0.0.1") == (True, 10)
    assert limiter.allow("127.0.0.1") == (True, 10)
    allowed, retry_after = limiter.allow("127.0.0.1")
    assert allowed is False
    assert retry_after == 10


def test_fixed_window_resets_at_next_window():
    now = [9.0]
    limiter = FixedWindowRateLimiter(max_requests=1, window_seconds=10, clock=lambda: now[0])

    assert limiter.allow("127.0.0.1")[0] is True
    assert limiter.allow("127.0.0.1")[0] is False
    now[0] = 10.0
    assert limiter.allow("127.0.0.1")[0] is True


def test_key_capacity_fails_closed_without_growing_state():
    now = [1.0]
    limiter = FixedWindowRateLimiter(max_requests=1, window_seconds=10, max_keys=1, clock=lambda: now[0])

    assert limiter.allow("127.0.0.1")[0] is True
    assert limiter.allow("127.0.0.2")[0] is False
    assert len(limiter._windows) == 1


def test_expired_key_is_reclaimed_when_capacity_is_full():
    now = [1.0]
    limiter = FixedWindowRateLimiter(max_requests=1, window_seconds=10, max_keys=1, clock=lambda: now[0])

    assert limiter.allow("127.0.0.1")[0] is True
    now[0] = 10.0
    assert limiter.allow("127.0.0.2")[0] is True
    assert len(limiter._windows) == 1


def test_rate_limiter_rejects_nonpositive_configuration():
    for kwargs in (
        {"max_requests": 0},
        {"window_seconds": 0},
        {"max_keys": 0},
    ):
        try:
            FixedWindowRateLimiter(**kwargs)
        except ValueError:
            pass
        else:
            raise AssertionError("invalid configuration must be rejected")

def test_client_address_fingerprint_is_keyed_per_limiter_instance():
    client_host = "127.0.0.1"
    first = FixedWindowRateLimiter(clock=lambda: 0.0)
    second = FixedWindowRateLimiter(clock=lambda: 0.0)

    assert first.allow(client_host)[0] is True
    assert second.allow(client_host)[0] is True

    first_fingerprint = next(iter(first._windows))
    second_fingerprint = next(iter(second._windows))
    assert client_host not in first_fingerprint
    assert first_fingerprint != second_fingerprint


def test_rate_limiter_generates_fingerprint_key_after_first_request(monkeypatch):
    generated_sizes = []

    def runtime_entropy(size):
        generated_sizes.append(size)
        return b"r" * size

    monkeypatch.setattr("app.rate_limit.secrets.token_bytes", runtime_entropy)

    limiter = FixedWindowRateLimiter(clock=lambda: 0.0)
    assert generated_sizes == []

    assert limiter.allow("203.0.113.10") == (True, 60)
    assert generated_sizes == [32]

    assert limiter.allow("203.0.113.10") == (True, 60)
    assert generated_sizes == [32]
