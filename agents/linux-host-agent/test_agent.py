import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("glorifier_linux_host_agent", Path(__file__).with_name("agent.py"))
AGENT = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(AGENT)


class LinuxHostAgentTests(unittest.TestCase):
    def test_api_origin_requires_exact_https_origin(self):
        self.assertEqual(AGENT.validate_api_origin("https://example.org/"), "https://example.org")
        for invalid in (
            "http://example.org",
            "https://user:pass@example.org",
            "https://example.org/path",
            "https://example.org?token=secret",
            "https://example.org:8443",
        ):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    AGENT.validate_api_origin(invalid)

    def test_agent_refuses_invalid_runtime_ids_and_tokens(self):
        with self.assertRaises(ValueError):
            AGENT.LinuxHostAgentClient("https://example.org", "../../etc/passwd", "a" * 43)
        with self.assertRaises(ValueError):
            AGENT.LinuxHostAgentClient("https://example.org", "linux-123e4567-e89b-12d3-a456-426614174000", "short")

    def test_only_fixed_read_only_diagnostics_are_executable(self):
        self.assertEqual(
            set(AGENT.execute_action("disk.info")),
            {"mount", "totalBytes", "usedBytes", "freeBytes"},
        )
        self.assertEqual(
            set(AGENT.execute_action("memory.info")),
            {"totalKb", "availableKb", "usedKb"},
        )
        self.assertEqual(
            set(AGENT.execute_action("host.info")),
            {"hostname", "distribution", "kernelRelease", "architecture", "pythonVersion", "agentVersion"},
        )
        for unsafe in ("shell.exec", "sudo", "python -c", "systemctl restart ssh", "*", ""):
            with self.subTest(unsafe=unsafe):
                with self.assertRaises(ValueError):
                    AGENT.execute_action(unsafe)

    def test_run_once_reports_diagnostic_failure_after_persisting_receipt(self):
        task_id = "linux-task-123e4567-e89b-12d3-a456-426614174000"

        class FakeClient:
            submitted = None

            def heartbeat(self):
                return {"ok": True}

            def claim_task(self):
                return {"taskId": task_id, "action": "memory.info"}

            def submit_result(self, submitted_task_id, result):
                self.submitted = (submitted_task_id, result)
                return {"ok": True}

        client = FakeClient()
        original_execute_action = AGENT.execute_action
        try:
            def fail_probe(_action):
                raise AGENT.AgentError("controlled test failure")
            AGENT.execute_action = fail_probe
            processed, succeeded = AGENT.run_once(client)
        finally:
            AGENT.execute_action = original_execute_action

        self.assertTrue(processed)
        self.assertFalse(succeeded)
        self.assertEqual(client.submitted[0], task_id)
        self.assertEqual(client.submitted[1], {"status": "failed", "errorCode": "probe_failed"})

    def test_memory_parser_reads_only_expected_numeric_fields(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "meminfo"
            path.write_text("MemTotal: 1000 kB\nMemFree: 400 kB\nMemAvailable: 600 kB\n", encoding="ascii")
            self.assertEqual(
                AGENT.read_memory_info(str(path)),
                {"totalKb": 1000, "availableKb": 600, "usedKb": 400},
            )

    def test_memory_parser_fails_closed_when_fields_are_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "meminfo"
            path.write_text("MemTotal: 1000 kB\n", encoding="ascii")
            with self.assertRaises(AGENT.AgentError):
                AGENT.read_memory_info(str(path))


if __name__ == "__main__":
    unittest.main()
