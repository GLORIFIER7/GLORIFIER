"""Bounded HTTP response-body readers shared by provider adapters."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from contextlib import suppress
import math
import time
from typing import Any, NoReturn


class ResponseBodyTooLargeError(ValueError):
    """Raised when a streamed provider response exceeds its configured byte limit."""


def _header(headers: Any, name: str) -> str | None:
    if headers is None:
        return None
    getter = getattr(headers, "get", None)
    if callable(getter):
        value = getter(name)
        if value is not None:
            return str(value)
    if isinstance(headers, Mapping):
        for key, value in headers.items():
            if str(key).casefold() == name.casefold():
                return str(value)
    return None


async def _await_js(value: Any) -> Any:
    """Make JavaScript Promise values awaitable through Pyodide's Python FFI."""
    return await value


async def _cancel_target(target: Any, *, deadline: float) -> None:
    """Request cancellation, but never spend more than the remaining deadline."""
    cancel = getattr(target, "cancel", None)
    if not callable(cancel):
        return
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        return
    with suppress(Exception):  # best-effort cleanup must not mask the primary failure
        await asyncio.wait_for(_await_js(cancel()), timeout=remaining)


async def _cancel_and_raise(target: Any, *, deadline: float, error: Exception) -> NoReturn:
    await _cancel_target(target, deadline=deadline)
    raise error


def _typed_array_byte_length(value: Any) -> int | None:
    for attribute in ("byteLength", "byte_length"):
        try:
            size = getattr(value, attribute)
        except (AttributeError, TypeError):
            continue
        if isinstance(size, bool):
            raise TypeError("provider response chunk has an invalid byte length")
        try:
            length = int(size)
        except (TypeError, ValueError, OverflowError):
            continue
        if length < 0:
            raise ValueError("provider response chunk has a negative byte length")
        return length
    return None


def _chunk_length(value: Any) -> int:
    """Read a byte length without materializing a JavaScript typed-array chunk."""
    if isinstance(value, (bytes, bytearray)):
        return len(value)
    if isinstance(value, memoryview):
        return value.nbytes
    typed_array_length = _typed_array_byte_length(value)
    if typed_array_length is not None:
        return typed_array_length
    try:
        length = len(value)
    except (TypeError, ValueError, OverflowError):
        raise TypeError("provider response chunk does not expose a byte length") from None
    if length < 0:
        raise ValueError("provider response chunk has a negative byte length")
    return length


def _chunk_bytes(value: Any) -> bytes:
    if isinstance(value, bytes):
        return value
    if isinstance(value, (bytearray, memoryview)):
        return bytes(value)
    try:
        return bytes(value)
    except (TypeError, ValueError):
        converter = getattr(value, "to_py", None)
        if callable(converter):
            return bytes(converter())
        raise


async def _response_reader(response: Any, *, max_bytes: int, deadline: float) -> Any:
    body = getattr(response, "body", None)
    declared_length = _header(getattr(response, "headers", None), "content-length")
    if declared_length is not None:
        try:
            parsed_length = int(declared_length)
        except (TypeError, ValueError):
            await _cancel_and_raise(
                body, deadline=deadline,
                error=ValueError("provider returned an invalid content length"),
            )
        if parsed_length < 0:
            await _cancel_and_raise(
                body, deadline=deadline,
                error=ValueError("provider returned an invalid content length"),
            )
        if parsed_length > max_bytes:
            await _cancel_and_raise(
                body, deadline=deadline,
                error=ResponseBodyTooLargeError("provider response exceeded response size limit"),
            )

    get_reader = getattr(body, "getReader", None)
    if not callable(get_reader):
        get_reader = getattr(body, "get_reader", None)
    if not callable(get_reader):
        await _cancel_and_raise(
            body, deadline=deadline,
            error=TypeError("provider response does not expose a readable stream"),
        )
    return get_reader()


def _read_result_field(result: Any, name: str) -> Any:
    if isinstance(result, Mapping):
        return result.get(name)
    return getattr(result, name, None)


async def _read_chunks(reader: Any, *, max_bytes: int, deadline: float) -> bytearray:
    collected = bytearray()
    while True:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("provider response body exceeded its deadline")
        result = await asyncio.wait_for(_await_js(reader.read()), timeout=remaining)
        if _read_result_field(result, "done") is True:
            return collected
        value = _read_result_field(result, "value")
        if value is None:
            continue
        chunk_length = _chunk_length(value)
        if chunk_length > max_bytes - len(collected):
            raise ResponseBodyTooLargeError("provider response exceeded response size limit")
        chunk = _chunk_bytes(value)
        if len(chunk) != chunk_length:
            raise ValueError("provider response chunk byte length changed during conversion")
        collected.extend(chunk)


def _release_reader(reader: Any) -> None:
    release = getattr(reader, "releaseLock", None)
    if not callable(release):
        release = getattr(reader, "release_lock", None)
    if callable(release):
        with suppress(Exception):  # do not mask the read result during cleanup
            release()


async def read_bounded_response_text(
    response: Any,
    *,
    max_bytes: int,
    timeout_seconds: float,
) -> str:
    """Read a Fetch Response incrementally under a byte and absolute-time ceiling.

    The body stream is cancelled on malformed or oversized declared lengths,
    streamed overflow, timeout, and read failure. A small part of the absolute
    deadline is reserved for bounded cancellation cleanup.
    """
    if not isinstance(max_bytes, int) or isinstance(max_bytes, bool) or max_bytes < 1:
        raise ValueError("max_bytes must be a positive integer")
    if not isinstance(timeout_seconds, (int, float)) or isinstance(timeout_seconds, bool):
        raise TypeError("timeout_seconds must be a finite positive number")
    timeout_value = float(timeout_seconds)
    if not math.isfinite(timeout_value) or timeout_value <= 0:
        raise ValueError("timeout_seconds must be a finite positive number")

    deadline = time.monotonic() + timeout_value
    reader = await _response_reader(response, max_bytes=max_bytes, deadline=deadline)
    read_deadline = deadline - min(0.05, timeout_value * 0.1)
    try:
        collected = await _read_chunks(reader, max_bytes=max_bytes, deadline=read_deadline)
        try:
            return collected.decode("utf-8")
        except UnicodeDecodeError:
            raise ValueError("provider response was not valid UTF-8") from None
    except Exception:
        await _cancel_target(reader, deadline=deadline)
        raise
    finally:
        _release_reader(reader)
