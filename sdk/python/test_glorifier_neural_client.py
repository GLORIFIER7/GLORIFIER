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

    def read(self):
        return self._body


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

    def test_task_requires_token_and_forwards_bearer(self):
        with self.assertRaises(ValueError):
            GlorifierNeuralClient("https://api.example.com").submit_task({"action": "read"})
        with patch("glorifier_neural_client.urlopen", return_value=Response(b'{"accepted":true}')) as open_url:
            result = GlorifierNeuralClient("https://api.example.com", token="sample-token").submit_task(
                {"action": "read"}
            )
        request = open_url.call_args.args[0]
        self.assertEqual(request.full_url, "https://api.example.com/api/neural/v1/tasks")
        self.assertEqual(request.get_header("Authorization"), "Bearer sample-token")
        self.assertEqual(json.loads(request.data.decode("utf-8")), {"action": "read"})
        self.assertEqual(result, {"accepted": True})

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
