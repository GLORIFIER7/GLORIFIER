#!/usr/bin/env python3
"""GLORIFIER Linux Host Agent.

Pulls owner-approved, read-only diagnostic tasks over HTTPS. This agent has no
shell execution, sudo, package installation, file-write, or arbitrary command API.
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

AGENT_VERSION = "1.0.0"
ALLOWED_ACTIONS = frozenset({"host.info", "memory.info", "disk.info"})
MAX_RESPONSE_BYTES = 65_536
REQUEST_TIMEOUT_SECONDS = 8
DEFAULT_POLL_SECONDS = 15


class AgentError(Exception):
    """A bounded transport or protocol error safe to log."""


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
        return None


def validate_api_origin(value: str) -> str:
    parsed = urllib.parse.urlsplit(value.strip())
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
        or parsed.port not in (None, 443)
    ):
        raise ValueError("GLORIFIER_API_ORIGIN must be an HTTPS origin without credentials, path, query, or fragment")
    return "https://" + parsed.netloc


def read_os_release(path: str = "/etc/os-release") -> str:
    try:
        lines = Path(path).read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return platform.system().lower()
    values: dict[str, str] = {}
    for line in lines:
        if "=" not in line or line.startswith("#"):
            continue
        key, value = line.split("=", 1)
        if key in ("PRETTY_NAME", "ID", "VERSION_ID"):
            values[key] = value.strip().strip('"').strip("'")
    return values.get("PRETTY_NAME") or "-".join(
        part for part in (values.get("ID"), values.get("VERSION_ID")) if part
    ) or platform.system().lower()


def read_memory_info(path: str = "/proc/meminfo") -> dict[str, int]:
    wanted = {"MemTotal", "MemAvailable"}
    values: dict[str, int] = {}
    try:
        lines = Path(path).read_text(encoding="ascii", errors="replace").splitlines()
    except OSError as exc:
        raise AgentError("memory information is unavailable") from exc
    for line in lines:
        parts = line.split()
        if len(parts) >= 2 and parts[0].rstrip(":") in wanted:
            try:
                values[parts[0].rstrip(":")] = int(parts[1])
            except ValueError:
                continue
    if wanted - values.keys():
        raise AgentError("memory information is incomplete")
    return {
        "totalKb": values["MemTotal"],
        "availableKb": values["MemAvailable"],
        "usedKb": max(0, values["MemTotal"] - values["MemAvailable"]),
    }


def execute_action(action: str) -> dict[str, Any]:
    """Execute a fixed diagnostic. Never evaluates caller-supplied command text."""
    if action not in ALLOWED_ACTIONS:
        raise ValueError("unsupported Linux host-agent action")
    if action == "host.info":
        return {
            "hostname": platform.node()[:128] or "unknown",
            "distribution": read_os_release()[:80],
            "kernelRelease": platform.release()[:128],
            "architecture": platform.machine()[:32],
            "pythonVersion": platform.python_version(),
            "agentVersion": AGENT_VERSION,
        }
    if action == "memory.info":
        return read_memory_info()
    usage = shutil.disk_usage("/")
    return {
        "mount": "/",
        "totalBytes": int(usage.total),
        "usedBytes": int(usage.used),
        "freeBytes": int(usage.free),
    }


class LinuxHostAgentClient:
    def __init__(self, api_origin: str, runtime_id: str, token: str, timeout: int = REQUEST_TIMEOUT_SECONDS):
        self.api_origin = validate_api_origin(api_origin)
        if not re.fullmatch(r"linux-[0-9a-f-]{36}", runtime_id):
            raise ValueError("GLORIFIER_LINUX_RUNTIME_ID is invalid")
        if not re.fullmatch(r"[A-Za-z0-9_-]{43}", token):
            raise ValueError("GLORIFIER_LINUX_AGENT_TOKEN is invalid")
        self.runtime_id = runtime_id
        self.token = token
        self.timeout = timeout
        self.opener = urllib.request.build_opener(
            NoRedirectHandler(),
            urllib.request.HTTPSHandler(context=ssl.create_default_context()),
        )
        self.runtime_path = urllib.parse.quote(runtime_id, safe="")

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            self.api_origin + path,
            data=body,
            headers={
                "Authorization": "Bearer " + self.token,
                "Accept": "application/json",
                "Content-Type": "application/json",
                "User-Agent": "GLORIFIER-Linux-Host-Agent/" + AGENT_VERSION,
            },
            method="POST",
        )
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                content_type = response.headers.get("Content-Type", "").lower()
                if len(raw) > MAX_RESPONSE_BYTES:
                    raise AgentError("GLORIFIER response exceeded the size limit")
                if "application/json" not in content_type:
                    raise AgentError("GLORIFIER returned a non-JSON response")
        except urllib.error.HTTPError as exc:
            raise AgentError("GLORIFIER returned HTTP " + str(exc.code)) from None
        except urllib.error.URLError:
            raise AgentError("GLORIFIER endpoint is unreachable") from None
        except TimeoutError:
            raise AgentError("GLORIFIER request timed out") from None
        try:
            data = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise AgentError("GLORIFIER returned invalid JSON") from None
        if not isinstance(data, dict):
            raise AgentError("GLORIFIER returned an invalid response shape")
        return data

    def heartbeat(self) -> dict[str, Any]:
        payload = {
            "agentVersion": AGENT_VERSION,
            "hostname": (platform.node() or "unknown")[:128],
            "distribution": read_os_release()[:80],
            "kernelRelease": platform.release()[:128],
            "architecture": platform.machine()[:32],
            "pythonVersion": platform.python_version(),
        }
        return self._post("/api/linux/agent/" + self.runtime_path + "/heartbeat", payload)

    def claim_task(self) -> dict[str, Any] | None:
        response = self._post("/api/linux/agent/" + self.runtime_path + "/tasks/claim", {})
        task = response.get("task")
        if task is None:
            return None
        if not isinstance(task, dict):
            raise AgentError("GLORIFIER returned an invalid task")
        task_id = task.get("taskId")
        action = task.get("action")
        if not isinstance(task_id, str) or not re.fullmatch(r"linux-task-[0-9a-f-]{36}", task_id):
            raise AgentError("GLORIFIER task identifier is invalid")
        if action not in ALLOWED_ACTIONS:
            raise AgentError("GLORIFIER offered an unsupported action")
        return task

    def submit_result(self, task_id: str, result: dict[str, Any]) -> dict[str, Any]:
        if not re.fullmatch(r"linux-task-[0-9a-f-]{36}", task_id):
            raise ValueError("task identifier is invalid")
        return self._post(
            "/api/linux/agent/" + self.runtime_path + "/tasks/" + urllib.parse.quote(task_id, safe="") + "/result",
            result,
        )


def run_once(client: LinuxHostAgentClient) -> bool:
    client.heartbeat()
    task = client.claim_task()
    if task is None:
        return False
    action = task["action"]
    try:
        result = {"status": "succeeded", "result": execute_action(action)}
    except ValueError:
        result = {"status": "failed", "errorCode": "unsupported_action"}
    except Exception:
        result = {"status": "failed", "errorCode": "probe_failed"}
    client.submit_result(task["taskId"], result)
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the GLORIFIER read-only Linux host agent")
    parser.add_argument("--once", action="store_true", help="send one heartbeat and claim at most one task")
    parser.add_argument("--poll-seconds", type=int, default=DEFAULT_POLL_SECONDS)
    args = parser.parse_args()
    if args.poll_seconds < 5 or args.poll_seconds > 300:
        parser.error("--poll-seconds must be between 5 and 300")

    api_origin = os.environ.get("GLORIFIER_API_ORIGIN", "")
    runtime_id = os.environ.get("GLORIFIER_LINUX_RUNTIME_ID", "")
    token = os.environ.get("GLORIFIER_LINUX_AGENT_TOKEN", "")
    try:
        client = LinuxHostAgentClient(api_origin, runtime_id, token)
    except ValueError as exc:
        print("Configuration error: " + str(exc), file=sys.stderr)
        return 2

    while True:
        try:
            processed = run_once(client)
            if processed:
                print("Completed one approved read-only diagnostic task.")
        except AgentError as exc:
            print("Agent check failed: " + str(exc), file=sys.stderr)
        if args.once:
            return 0
        time.sleep(args.poll_seconds)


if __name__ == "__main__":
    raise SystemExit(main())
