# GLORIFIER Python SDK (initial Neural adapter)

This is an initial standard-library client for the explicitly mapped GLORIFIER Neural routes. It is not a universal SDK and does not imply that a Neural service is deployed or ready.

## Requirements

- Python 3.10+
- An HTTPS GLORIFIER Worker origin with the Neural adapter configured
- A caller-issued bearer token for task submission

## Example

```python
from sdk.python.glorifier_neural_client import GlorifierNeuralClient, GlorifierAPIError

client = GlorifierNeuralClient("https://api.example.com", token="YOUR_CALLER_TOKEN")
try:
    print(client.health())
    print(client.ready())  # HTTP 503 is surfaced as GlorifierAPIError
    # The task payload follows the canonical OpenAPI schema.
    # Submission is authenticated; health/readiness requests do not send the token.
    # print(client.submit_task({
    #     "task": "read_only_status",
    #     "purpose": "general",
    #     "require_approval": True,
    #     "action_class": "read_only",
    # }))
except GlorifierAPIError as exc:
    print("GLORIFIER request failed:", exc.status, exc.code, str(exc))
```

Never place a real token in source control, frontend code, issue comments, logs, or screenshots. Readiness failures are reported as errors, not silently converted to success.

## Contract tests

From this directory, run:

```sh
python -m unittest -v test_glorifier_neural_client.py
```

These tests mock HTTP responses; they do not verify a live service. Use a real staging origin only after its configuration and authorization have been reviewed.
