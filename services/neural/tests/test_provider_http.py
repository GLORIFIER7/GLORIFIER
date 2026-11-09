import asyncio
import time

import pytest

from types import SimpleNamespace

from app.providers.http import (
    ResponseBodyTooLargeError,
    await_with_deadline,
    read_bounded_response_text,
    read_bounded_response_bytes,
)


class FakeReadResult:
    def __init__(self, *, done: bool, value: bytes | None = None):
        self.done = done
        self.value = value


class FakeReader:
    def __init__(self, chunks):
        self._chunks = list(chunks)
        self.read_calls = 0
        self.cancel_calls = 0
        self.release_calls = 0

    async def read(self):
        self.read_calls += 1
        if not self._chunks:
            return FakeReadResult(done=True)
        return FakeReadResult(done=False, value=self._chunks.pop(0))

    async def cancel(self):
        self.cancel_calls += 1

    def releaseLock(self):
        self.release_calls += 1


class FakeStream:
    def __init__(self, reader):
        self.reader = reader
        self.get_reader_calls = 0
        self.cancel_calls = 0

    def getReader(self):
        self.get_reader_calls += 1
        return self.reader

    async def cancel(self):
        self.cancel_calls += 1


class FakeResponse:
    def __init__(self, chunks, headers=None):
        self.body_reader = FakeReader(chunks)
        self.body = FakeStream(self.body_reader)
        self.headers = headers or {}


def test_reads_chunked_provider_response_with_a_bounded_stream():
    response = FakeResponse([b'{"message":', b'"GLORIFIER"}'])

    result = asyncio.run(
        read_bounded_response_text(response, max_bytes=64, timeout_seconds=1.0)
    )

    assert result == '{"message":"GLORIFIER"}'
    assert response.body_reader.read_calls == 3
    assert response.body_reader.cancel_calls == 0
    assert response.body_reader.release_calls == 1


def test_rejects_oversized_chunked_response_before_reading_more_chunks():
    response = FakeResponse([b"1234", b"5678", b"should-not-read"])

    with pytest.raises(ResponseBodyTooLargeError):
        asyncio.run(
            read_bounded_response_text(response, max_bytes=6, timeout_seconds=1.0)
        )

    assert response.body_reader.read_calls == 2
    assert response.body_reader.cancel_calls == 1
    assert response.body_reader.release_calls == 1


def test_accepts_response_exactly_at_the_configured_byte_limit():
    response = FakeResponse([b"1234", b"5678"])

    result = asyncio.run(
        read_bounded_response_text(response, max_bytes=8, timeout_seconds=1.0)
    )

    assert result == "12345678"
    assert response.body_reader.cancel_calls == 0


def test_rejects_declared_oversize_and_cancels_without_opening_stream():
    response = FakeResponse([b"{}"], headers={"content-length": "1024"})

    with pytest.raises(ResponseBodyTooLargeError):
        asyncio.run(
            read_bounded_response_text(response, max_bytes=16, timeout_seconds=1.0)
        )

    assert response.body.get_reader_calls == 0
    assert response.body.cancel_calls == 1


def test_rejects_malformed_content_length_and_cancels_body():
    response = FakeResponse([b"{}"], headers={"content-length": "unknown"})

    with pytest.raises(ValueError, match="invalid content length"):
        asyncio.run(
            read_bounded_response_text(response, max_bytes=16, timeout_seconds=1.0)
        )

    assert response.body.get_reader_calls == 0
    assert response.body.cancel_calls == 1


def test_decodes_utf8_only_after_all_chunks_are_read():
    encoded = "GLORIFIER — 你好 — 🌐".encode()
    response = FakeResponse([encoded[:8], encoded[8:14], encoded[14:]])

    result = asyncio.run(
        read_bounded_response_text(response, max_bytes=128, timeout_seconds=1.0)
    )

    assert result == "GLORIFIER — 你好 — 🌐"


def test_cancels_and_releases_stream_when_read_times_out():
    class SlowReader(FakeReader):
        async def read(self):
            self.read_calls += 1
            await asyncio.sleep(0.1)
            return FakeReadResult(done=True)

    response = FakeResponse([])
    response.body_reader = SlowReader([])
    response.body = FakeStream(response.body_reader)

    with pytest.raises(TimeoutError):
        asyncio.run(
            read_bounded_response_text(response, max_bytes=16, timeout_seconds=0.02)
        )

    assert response.body_reader.cancel_calls == 1
    assert response.body_reader.release_calls == 1


def test_stalled_cancellation_cannot_extend_absolute_deadline():
    class StalledCancelReader(FakeReader):
        async def read(self):
            self.read_calls += 1
            await asyncio.sleep(1)
            return FakeReadResult(done=True)

        async def cancel(self):
            self.cancel_calls += 1
            await asyncio.sleep(1)

    response = FakeResponse([])
    response.body_reader = StalledCancelReader([])
    response.body = FakeStream(response.body_reader)
    started = time.monotonic()

    with pytest.raises(TimeoutError):
        asyncio.run(
            read_bounded_response_text(response, max_bytes=16, timeout_seconds=0.06)
        )

    assert time.monotonic() - started < 0.15
    assert response.body_reader.cancel_calls == 1
    assert response.body_reader.release_calls == 1



def test_reader_lock_is_released_only_after_cancelled_read_finishes():
    class ResistantReader(FakeReader):
        def __init__(self):
            super().__init__([])
            self.started = asyncio.Event()
            self.finish = asyncio.Event()
            self.released = asyncio.Event()

        def releaseLock(self):
            super().releaseLock()
            self.released.set()

        async def read(self):
            self.read_calls += 1
            self.started.set()
            try:
                await self.finish.wait()
            except asyncio.CancelledError:
                # Simulate a Web Streams read whose Promise settles after cancellation.
                await self.finish.wait()
            return FakeReadResult(done=True)

    response = FakeResponse([])
    response.body_reader = ResistantReader()
    response.body = FakeStream(response.body_reader)

    async def exercise():
        task = asyncio.create_task(
            read_bounded_response_text(
                response, max_bytes=16, timeout_seconds=0.05
            )
        )
        await response.body_reader.started.wait()
        with pytest.raises(TimeoutError):
            await task

        # A real ReadableStream reader cannot release while a read request remains pending.
        assert response.body_reader.release_calls == 0
        response.body_reader.finish.set()
        await asyncio.wait_for(response.body_reader.released.wait(), timeout=0.05)
        assert response.body_reader.release_calls == 1

    asyncio.run(exercise())

def test_rejects_oversized_typed_array_before_materializing_bytes():
    class OversizedUint8Array:
        byteLength = 1_000_000

        def __init__(self):
            self.converted = False

        def __bytes__(self):
            self.converted = True
            raise AssertionError("oversized typed-array chunks must not be copied")

    chunk = OversizedUint8Array()
    response = FakeResponse([chunk])

    with pytest.raises(ResponseBodyTooLargeError):
        asyncio.run(
            read_bounded_response_text(response, max_bytes=16, timeout_seconds=1.0)
        )

    assert not chunk.converted
    assert response.body_reader.cancel_calls == 1
    assert response.body_reader.release_calls == 1


def test_stalled_read_cancellation_does_not_extend_absolute_deadline():
    class CancellationResistantReader(FakeReader):
        async def read(self):
            self.read_calls += 1
            try:
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                await asyncio.sleep(0.1)
            return FakeReadResult(done=True)

    response = FakeResponse([])
    response.body_reader = CancellationResistantReader([])
    response.body = FakeStream(response.body_reader)

    async def exercise():
        started = time.monotonic()
        with pytest.raises(TimeoutError):
            await read_bounded_response_text(
                response, max_bytes=16, timeout_seconds=0.06
            )
        return time.monotonic() - started

    elapsed = asyncio.run(exercise())

    assert elapsed < 0.10
    assert response.body_reader.cancel_calls == 1
    assert response.body_reader.release_calls == 1


def test_stalled_cancel_promise_does_not_extend_absolute_deadline():
    class CancellationResistantCancelReader(FakeReader):
        async def read(self):
            self.read_calls += 1
            await asyncio.sleep(1)
            return FakeReadResult(done=True)

        async def cancel(self):
            self.cancel_calls += 1
            try:
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                await asyncio.sleep(0.1)

    response = FakeResponse([])
    response.body_reader = CancellationResistantCancelReader([])
    response.body = FakeStream(response.body_reader)

    async def exercise():
        started = time.monotonic()
        with pytest.raises(TimeoutError):
            await read_bounded_response_text(
                response, max_bytes=16, timeout_seconds=0.06
            )
        return time.monotonic() - started

    elapsed = asyncio.run(exercise())

    assert elapsed < 0.10
    assert response.body_reader.cancel_calls == 1
    assert response.body_reader.release_calls == 1


def test_caller_cancellation_cancels_reader_and_releases_lock():
    class WaitingReader(FakeReader):
        def __init__(self):
            super().__init__([])
            self.started = asyncio.Event()

        async def read(self):
            self.read_calls += 1
            self.started.set()
            await asyncio.Event().wait()
            return FakeReadResult(done=True)

        async def cancel(self):
            self.cancel_calls += 1
            try:
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                await asyncio.sleep(0.1)

    async def exercise():
        response = FakeResponse([])
        response.body_reader = WaitingReader()
        response.body = FakeStream(response.body_reader)
        task = asyncio.create_task(
            read_bounded_response_text(response, max_bytes=16, timeout_seconds=1.0)
        )
        await response.body_reader.started.wait()
        started = time.monotonic()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        return response, time.monotonic() - started

    response, elapsed = asyncio.run(exercise())
    assert elapsed < 0.15

    assert response.body_reader.cancel_calls == 1
    assert response.body_reader.release_calls == 1


def test_stalled_fetch_coroutine_cannot_extend_absolute_deadline():
    async def cancellation_resistant_fetch():
        try:
            await asyncio.sleep(1)
        except asyncio.CancelledError:
            await asyncio.sleep(0.1)
        return "late response"

    async def exercise():
        started = time.monotonic()
        with pytest.raises(TimeoutError):
            await await_with_deadline(
                cancellation_resistant_fetch(), deadline=time.monotonic() + 0.06
            )
        return time.monotonic() - started

    elapsed = asyncio.run(exercise())

    assert elapsed < 0.10


def test_caller_cancellation_is_propagated_without_waiting_for_fetch_cleanup():
    async def exercise():
        started_event = asyncio.Event()

        async def cancellation_resistant_fetch():
            started_event.set()
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                await asyncio.sleep(0.1)
                return "late response"

        task = asyncio.create_task(
            await_with_deadline(
                cancellation_resistant_fetch(), deadline=time.monotonic() + 1.0
            )
        )
        await started_event.wait()
        started = time.monotonic()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        return time.monotonic() - started

    elapsed = asyncio.run(exercise())

    assert elapsed < 0.10


def test_reader_lock_release_is_deferred_until_cancelled_read_settles():
    class PendingReleaseReader(FakeReader):
        def __init__(self):
            super().__init__([])
            self.pending_read = False

        async def read(self):
            self.read_calls += 1
            self.pending_read = True
            try:
                await asyncio.sleep(1)
            except asyncio.CancelledError:
                await asyncio.sleep(0.1)
            self.pending_read = False
            return FakeReadResult(done=True)

        def releaseLock(self):
            if self.pending_read:
                raise RuntimeError("cannot release while a read request is pending")
            self.release_calls += 1

    response = FakeResponse([])
    response.body_reader = PendingReleaseReader()
    response.body = FakeStream(response.body_reader)

    async def exercise():
        started = time.monotonic()
        with pytest.raises(TimeoutError):
            await read_bounded_response_text(
                response, max_bytes=16, timeout_seconds=0.06
            )
        elapsed = time.monotonic() - started
        released_before_read_settled = response.body_reader.release_calls
        await asyncio.sleep(0.12)
        return elapsed, released_before_read_settled

    elapsed, released_before_read_settled = asyncio.run(exercise())

    assert elapsed < 0.10
    assert released_before_read_settled == 0
    assert response.body_reader.release_calls == 1



def test_sync_response_reader_uses_a_decreasing_absolute_socket_deadline(monkeypatch):
    import app.providers.http as provider_http

    readings = iter((0.0, 0.0, 0.6, 1.2))

    class FakeSocket:
        def __init__(self):
            self.timeouts = []

        def settimeout(self, timeout):
            self.timeouts.append(timeout)

    class FakeResponse:
        def __init__(self):
            self.socket = FakeSocket()
            self.fp = SimpleNamespace(
                raw=SimpleNamespace(_sock=self.socket)
            )
            self.chunks = [b"first", b"second", b"third"]

        def read1(self, limit):
            return self.chunks.pop(0)[:limit]

    monkeypatch.setattr(provider_http.time, "monotonic", lambda: next(readings))
    response = FakeResponse()

    with pytest.raises(TimeoutError, match="deadline"):
        read_bounded_response_bytes(response, max_bytes=64, timeout_seconds=1.0)

    assert response.socket.timeouts == [1.0, 0.4]
    assert response.chunks == [b"third"]


def test_sync_response_reader_respects_deadline_started_before_connection(monkeypatch):
    import app.providers.http as provider_http

    readings = iter((0.75, 0.9, 1.1))

    class FakeSocket:
        def __init__(self):
            self.timeouts = []

        def settimeout(self, timeout):
            self.timeouts.append(timeout)

    class FakeResponse:
        def __init__(self):
            self.socket = FakeSocket()
            self.fp = SimpleNamespace(raw=SimpleNamespace(_sock=self.socket))
            self.chunks = [b"first", b"second", b"third"]

        def read1(self, limit):
            return self.chunks.pop(0)[:limit]

    monkeypatch.setattr(provider_http.time, "monotonic", lambda: next(readings))
    response = FakeResponse()

    with pytest.raises(TimeoutError, match="deadline"):
        read_bounded_response_bytes(
            response,
            max_bytes=64,
            timeout_seconds=1.0,
            deadline=1.0,
        )

    assert response.socket.timeouts == [0.25, pytest.approx(0.1)]
    assert response.chunks == [b"third"]


def test_sync_response_reader_stops_after_maximum_plus_one_byte():
    class FakeSocket:
        def __init__(self):
            self.timeouts = []

        def settimeout(self, timeout):
            self.timeouts.append(timeout)

    class FakeResponse:
        def __init__(self):
            self.socket = FakeSocket()
            self.fp = SimpleNamespace(raw=SimpleNamespace(_sock=self.socket))
            self.calls = 0

        def read1(self, limit):
            self.calls += 1
            return b"x" * limit

    response = FakeResponse()
    result = read_bounded_response_bytes(
        response, max_bytes=4, timeout_seconds=1.0
    )

    assert result == b"xxxxx"
    assert response.calls == 1
