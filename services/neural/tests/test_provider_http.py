import asyncio
import time

import pytest

from app.providers.http import ResponseBodyTooLargeError, read_bounded_response_text


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
