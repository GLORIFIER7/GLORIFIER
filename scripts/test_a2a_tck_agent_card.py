"""Exercise the staging workflow's Python preflight with an in-memory HTTP response."""

import io
import json
import os
from pathlib import Path
import tempfile
import textwrap
import unittest
from unittest.mock import patch


WORKFLOW = Path(__file__).resolve().parents[1] / ".github/workflows/a2a-tck-conformance.yml"
HOST = "staging.unit-fixture.org"
ORIGIN = f"https://{HOST}"


def preflight_script():
    step = WORKFLOW.read_text().split("- name: Validate staging origin,", 1)[1]
    source = step.split("python - <<'PY'\n", 1)[1].split("\n          PY\n", 1)[0]
    return compile(textwrap.dedent(source), str(WORKFLOW), "exec")


class AgentCardTests(unittest.TestCase):
    def setUp(self):
        self.card = {
            "supportedInterfaces": [
                {"protocolBinding": "JSONRPC", "protocolVersion": "1.0", "url": ORIGIN + "/rpc"}
            ],
            "securitySchemes": {"bearer": {"httpAuthSecurityScheme": {"scheme": "Bearer"}}},
        }

    def run_preflight(self, redirect=False):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "workflow-outputs"
            env = {"SUT_HOST": ORIGIN, "ALLOWED_HOST": HOST, "A2A_TCK_TOKEN": "fixture", "GITHUB_OUTPUT": str(output)}
            with patch.dict(os.environ, env, clear=True), patch("urllib.request.build_opener") as opener:
                def respond(request, timeout):
                    self.assertEqual(request.full_url, ORIGIN + "/.well-known/agent-card.json")
                    self.assertFalse(request.has_header("Authorization"))
                    if redirect:
                        handler, = opener.call_args.args
                        return handler.redirect_request(request, None, 302, "Found", {}, ORIGIN + "/moved")
                    response = io.BytesIO(json.dumps(self.card).encode())
                    response.status = 200
                    return response

                opener.return_value.open.side_effect = respond
                try:
                    exec(preflight_script(), {})
                except SystemExit:
                    self.assertFalse(output.exists())
                    raise
                self.assertEqual(output.read_text(), f"sut_host={ORIGIN}\n")

    def test_accepts_http_bearer_case_insensitively(self):
        for spelling in ("Bearer", "bearer", "BEARER"):
            with self.subTest(spelling=spelling):
                self.card["securitySchemes"]["bearer"]["httpAuthSecurityScheme"]["scheme"] = spelling
                self.run_preflight()

    def test_rejects_missing_or_malformed_bearer_scheme(self):
        for schemes in (
            None, {}, {"bearer": None}, {"bearer": "Bearer"}, {"bearer": {}},
            {"bearer": {"apiKeySecurityScheme": {}}},
            {"bearer": {"httpAuthSecurityScheme": None}},
            {"bearer": {"httpAuthSecurityScheme": {}}},
            {"bearer": {"httpAuthSecurityScheme": {"scheme": 1}}},
            {"bearer": {"httpAuthSecurityScheme": {"scheme": "Basic"}}},
        ):
            with self.subTest(schemes=schemes):
                self.card["securitySchemes"] = schemes
                with self.assertRaisesRegex(SystemExit, "expected bearer security scheme"):
                    self.run_preflight()

    def test_rejects_redirect_with_a_bounded_error(self):
        with self.assertRaisesRegex(SystemExit, r"preflight failed: HTTPError\.$"):
            self.run_preflight(redirect=True)

    def test_validates_every_advertised_jsonrpc_interface(self):
        self.card["supportedInterfaces"].append({
            **self.card["supportedInterfaces"][0],
            "url": "https://other.example.org/rpc",
        })
        with self.assertRaisesRegex(SystemExit, "allowlisted HTTPS staging host"):
            self.run_preflight()
