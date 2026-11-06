"""Bounded HTTP response-body readers shared by provider adapters."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from contextlib import suppress
import math
import time
from typing import Any, NoReturn


CANCELLATION_CLEANUP_BUDGET_SECONDS = 0.05


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


def _consume_task_result(task: asyncio.Task[Any]) -> None:
    """Retrieve detached task failures so timeout cleanup stays quiet."""
    if task.done() and not task.cancelled():
        with suppress(BaseException):
            task.exception()


async def _await_task_until(task: asyncio.Task[Any], *, deadline: float) -> Any:
    """Wait until a deadline without waiting for cancellation-resistant work."""
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        task.cancel()
        task.add_done_callback(_consume_task_result)
        raise TimeoutError("provider operation exceeded its deadline")

    try:
        completed, _ = await asyncio.wait({task}, timeout=remaining)
    except asyncio.CancelledError:
        task.cancel()
        task.add_done_callback(_consume_task_result)
        raise

    if not completed:
        task.cancel()
        task.add_done_callback(_consume_task_result)
        raise TimeoutError("provider operation exceeded its deadline")
    return task.result()


def create_abort_controller() -> Any | None:
    """Create a Workers AbortController when the JavaScript runtime exposes it."""
    try:
        import js
    except ImportError:
        return None
    controller_type = getattr(js, "AbortController", None)
    if controller_type is None:
        return None
    with suppress(Exception):  # optional runtime capability; Python tests may lack JS globals
        return controller_type.new()
    return None


def _abort_controller(controller: Any | None) -> None:
    if controller is None:
        return
    abort = getattr(controller, "abort", None)
    if callable(abort):
        with suppress(Exception):  # cancellation must not mask the transport outcome
            abort()


async def await_with_deadline(
    awaitable: Any,
    *,
    deadline: float,
    abort_controller: Any | None = None,
) -> Any:
    """Await a provider fetch under a deadline and abort its underlying request."""
    task = asyncio.create_task(_await_js(awaitable))
    try:
        return await _await_task_until(task, deadline=deadline)
    except (TimeoutError, asyncio.CancelledError):
        _abort_controller(abort_controller)
        raise


async def _cancel_target(target: Any, *, deadline: float) -> None:
    """Request cancellation with a small, bounded cleanup budget."""
    cancel = getattr(target, "cancel", None)
    cleanup_deadline = min(deadline, time.monotonic() + CANCELLATION_CLEANUP_BUDGET_SECONDS)
    if not callable(cancel) or cleanup_deadline <= time.monotonic():
        return
    with suppress(Exception):  # best-effort cleanup must not mask the primary failure
        task = asyncio.create_task(_await_js(cancel()))
        await _await_task_until(task, deadline=cleanup_deadline)


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
                body,
                deadline=deadline,
                error=ValueError("provider returned an invalid content length"),
            )
        if parsed_length < 0:
            await _cancel_and_raise(
                body,
                deadline=deadline,
                error=ValueError("provider returned an invalid content length"),
            )
        if parsed_length > max_bytes:
            await _cancel_and_raise(
                body,
                deadline=deadline,
                error=ResponseBodyTooLargeError("provider response exceeded response size limit"),
            )

    get_reader = getattr(body, "getReader", None)
    if not callable(get_reader):
        get_reader = getattr(body, "get_reader", None)
    if not callable(get_reader):
        await _cancel_and_raise(
            body,
            deadline=deadline,
            error=TypeError("provider response does not expose a readable stream"),
        )
    return get_reader()


def _read_result_field(result: Any, name: str) -> Any:
    if isinstance(result, Mapping):
        return result.get(name)
    return getattr(result, name, None)


async def _read_chunks(
    reader: Any,
    *,
    max_bytes: int,
    deadline: float,
    pending_read: list[asyncio.Task[Any] | None],
) -> bytearray:
    collected = bytearray()
    while True:
        read_task = asyncio.create_task(_await_js(reader.read()))
        pending_read[0] = read_task
        result = await _await_task_until(read_task, deadline=deadline)
        pending_read[0] = None
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


def _defer_reader_release(reader: Any, pending_read: asyncio.Task[Any] | None) -> bool:
    if pending_read is None or pending_read.done():
        return False

    def release_after_read(_task: asyncio.Task[Any]) -> None:
        _release_reader(reader)

    pending_read.add_done_callback(release_after_read)
    return True


async def read_bounded_response_text(
    response: Any,
    *,
    max_bytes: int,
    timeout_seconds: float,
) -> str:
    """Read a Fetch Response incrementally under a byte and absolute-time ceiling.

    The body stream is cancelled on malformed or oversized declared lengths,
    streamed overflow, timeout, caller cancellation, and read failure. A reader
    lock is released only after any pending read has settled.
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
    pending_read: list[asyncio.Task[Any] | None] = [None]
    release_deferred = False
    try:
        collected = await _read_chunks(
            reader,
            max_bytes=max_bytes,
            deadline=read_deadline,
            pending_read=pending_read,
        )
        try:
            return collected.decode("utf-8")
        except UnicodeDecodeError:
            raise ValueError("provider response was not valid UTF-8") from None
    except asyncio.CancelledError:
        try:
            await _cancel_target(reader, deadline=deadline)
        finally:
            release_deferred = _defer_reader_release(reader, pending_read[0])
        raise
    except Exception:
        try:
            await _cancel_target(reader, deadline=deadline)
        finally:
            release_deferred = _defer_reader_release(reader, pending_read[0])
        raise
    finally:
        if not release_deferred:
            _release_reader(reader)
