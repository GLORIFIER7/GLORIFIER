import io
import json
import unittest
from unittest.mock import patch

from glorifier_neural_client import GlorifierAPIError, GlorifierNeuralClient


class Response:
    def __init__(self, body, status=200):
        self._body = body
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def read(self, size=-1):
        return self._body if size is None or size < 0 else self._body[:size]


class ClientTests(unittest.TestCase):
    def test_rejects_non_https_or_non_origin_urls(self):
        for url in (
            "http://example.com",
            "https://user:pass@example.com",
            "https://example.com/path",
            "https://example.com/?x=1",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                GlorifierNeuralClient(url)

    def test_health_uses_fixed_route_and_json(self):
        with patch("glorifier_neural_client.urlopen", return_value=Response(b'{"status":"ok"}')) as open_url:
            result = GlorifierNeuralClient("https://api.example.com").health()
        self.assertEqual(result, {"status": "ok"})
        request = open_url.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.example.com/api/neural/health")
        self.assertEqual(request.get_method(), "GET")

    def test_health_and_readiness_never_forward_caller_bearer_token(self):
        with patch(
            "glorifier_neural_client.urlopen",
            side_effect=[
                Response(b'{"status":"ok"}'),
                Response(b'{"status":"ready"}'),
            ],
        ) as open_url:
            client = GlorifierNeuralClient("https://api.example.com", token="sample-token")
            client.health()
            client.ready()

        for call in open_url.call_args_list:
            request = call.args[0]
            self.assertIsNone(
                request.get_header("Authorization"),
                "caller bearer tokens must never be sent to public health/readiness routes",
            )

    def test_task_requires_token_and_forwards_bearer(self):
        with self.assertRaises(ValueError):
            GlorifierNeuralClient("https://api.example.com").submit_task({"action": "read"})
        with patch("glorifier_neural_client.urlopen", return_value=Response(b'{"accepted":true}')) as open_url:
            result = GlorifierNeuralClient("https://api.example.com", token="sample-token").submit_task(
                {"task": "read", "purpose": "general", "require_approval": True, "action_class": "read_only"}
            )
        request = open_url.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.example.com/api/neural/v1/tasks")
        self.assertEqual(request.get_header("Authorization"), "Bearer sample-token")
        self.assertEqual(
            json.loads(request.data.decode("utf-8")),
            {"task": "read", "purpose": "general", "require_approval": True, "action_class": "read_only"},
        )
        self.assertEqual(result, {"accepted": True})

    def test_task_rejects_legacy_action_and_unknown_properties_before_network(self):
        client = GlorifierNeuralClient("https://api.example.com", token="sample-token")
        invalid_payloads = (
            {"action": "read"},
            {"task": "read", "unexpected": "field"},
            {},
        )
        with patch("glorifier_neural_client.urlopen") as open_url:
            for payload in invalid_payloads:
                with self.subTest(payload=payload), self.assertRaises(ValueError):
                    client.submit_task(payload)
            open_url.assert_not_called()

    def test_task_validates_openapi_field_types_and_lengths(self):
        client = GlorifierNeuralClient("https://api.example.com", token="sample-token")
        invalid_payloads = (
            {"task": ""},
            {"task": 123},
            {"task": "read", "purpose": ""},
            {"task": "read", "purpose": "p" * 101},
            {"task": "read", "require_approval": "yes"},
            {"task": "read", "action_class": ""},
            {"task": "read", "action_class": "a" * 65},
            {"task": "read", "purpose": None},
            {"task": "read", "require_approval": None},
            {"task": "read", "action_class": None},
            {"task": "x" * 20_001},
            {"task": "read", 1: "not-a-json-contract-key"},
        )
        with patch("glorifier_neural_client.urlopen") as open_url:
            for payload in invalid_payloads:
                with self.subTest(payload=payload), self.assertRaises(ValueError):
                    client.submit_task(payload)
            open_url.assert_not_called()

    def test_task_enforces_utf8_body_limit_before_network(self):
        client = GlorifierNeuralClient("https://api.example.com", token="sample-token")
        payload = {"task": "😀" * 20_000}
        with patch("glorifier_neural_client.urlopen") as open_url:
            with self.assertRaises(ValueError):
                client.submit_task(payload)
            open_url.assert_not_called()

    def test_response_body_is_bounded(self):
        with patch(
            "glorifier_neural_client.urlopen",
            return_value=Response(b"x" * (1_048_576 + 1)),
        ):
            with self.assertRaisesRegex(GlorifierAPIError, "exceeds the 1 MiB"):
                GlorifierNeuralClient("https://api.example.com").health()

    def test_rejects_non_object_response(self):
        with patch("glorifier_neural_client.urlopen", return_value=Response(b'[]')):
            with self.assertRaises(GlorifierAPIError):
                GlorifierNeuralClient("https://api.example.com").health()

    def test_timeout_is_bounded(self):
        with self.assertRaises(ValueError):
            GlorifierNeuralClient("https://api.example.com", timeout=0)
        with self.assertRaises(ValueError):
            GlorifierNeuralClient("https://api.example.com", timeout=61)


if __name__ == "__main__":
    unittest.main()
