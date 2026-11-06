"""Bounded HTTP response-body readers shared by provider adapters."""

from __future__ import annotations

import asyncio
import time
from collections.abc import Mapping
from typing import Any


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


async def _cancel_reader(reader: Any) -> None:
    cancel = getattr(reader, "cancel", None)
    if callable(cancel):
        try:
            await _await_js(cancel())
        except Exception:  # noqa: BLE001, S110 - cancellation is best effort
            pass


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


async def read_bounded_response_text(
    response: Any,
    *,
    max_bytes: int,
    timeout_seconds: float,
) -> str:
    """Read a Fetch Response incrementally, with a hard byte and time ceiling.

    Cloudflare Fetch responses expose the standard ReadableStream body API.
    The reader is cancelled immediately on overflow or timeout; the full body
    is never materialized by Response.text().
    """
    if not isinstance(max_bytes, int) or isinstance(max_bytes, bool) or max_bytes < 1:
        raise ValueError("max_bytes must be a positive integer")
    if not isinstance(timeout_seconds, (int, float)) or timeout_seconds <= 0:
        raise ValueError("timeout_seconds must be positive")

    declared_length = _header(getattr(response, "headers", None), "content-length")
    if declared_length:
        try:
            parsed_length = int(declared_length)
        except (TypeError, ValueError):
            raise ValueError("provider returned an invalid content length") from None
        if parsed_length < 0:
            raise ValueError("provider returned an invalid content length")
        if parsed_length > max_bytes:
            raise ResponseBodyTooLargeError("provider response exceeded response size limit")

    body = getattr(response, "body", None)
    get_reader = getattr(body, "getReader", None)
    if not callable(get_reader):
        get_reader = getattr(body, "get_reader", None)
    if not callable(get_reader):
        raise TypeError("provider response does not expose a readable stream")

    reader = get_reader()
    deadline = time.monotonic() + float(timeout_seconds)
    collected = bytearray()
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError("provider response body exceeded its deadline")
            result = await asyncio.wait_for(_await_js(reader.read()), timeout=remaining)
            done = getattr(result, "done", None)
            if done is None and isinstance(result, Mapping):
                done = result.get("done")
            if done is True:
                break
            value = getattr(result, "value", None)
            if value is None and isinstance(result, Mapping):
                value = result.get("value")
            if value is None:
                continue
            chunk = _chunk_bytes(value)
            if len(chunk) > max_bytes - len(collected):
                raise ResponseBodyTooLargeError("provider response exceeded response size limit")
            collected.extend(chunk)

        try:
            return collected.decode("utf-8")
        except UnicodeDecodeError:
            raise ValueError("provider response was not valid UTF-8") from None
    except (TimeoutError, ResponseBodyTooLargeError):
        await _cancel_reader(reader)
        raise
    except Exception:
        await _cancel_reader(reader)
        raise
    finally:
        release = getattr(reader, "releaseLock", None)
        if not callable(release):
            release = getattr(reader, "release_lock", None)
        if callable(release):
            try:
                release()
            except Exception:  # noqa: BLE001, S110 - do not mask the read result
                pass
