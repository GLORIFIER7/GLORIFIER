# GLORIFIER Interoperability Profile

## Protocol roles
GLORIFIER separates protocol layers:
- A2A — agent-to-agent discovery, delegation and task collaboration.
- MCP — agent-to-tool/context integration.
- Provider APIs — model/inference execution.
- GEAS/Governance Kernel — authority, policy, identity attenuation and human approval.
- Evidence Layer — provenance, receipts and externally verifiable outcomes.

A2A and MCP are complementary rather than interchangeable.

## A2A v1.0 target profile
GLORIFIER's public Agent Card targets A2A v1.0 semantics while retaining explicit GLORIFIER governance extensions.

Required governed-delegation fields:
- stable task ID
- requester identity
- assignee identity
- authorization reference
- idempotency key
- evidence policy
- lifecycle state
- verification status

A2A protocol support is not proof of authorization.

## MCP 2026-07-28 target profile
GLORIFIER adapters SHOULD treat MCP requests as untrusted capability requests until GEAS authorization is evaluated.

MCP Tasks may represent long-running work, but a task handle does not grant additional authority.

## Provider-neutral inference profile
The orchestration layer addresses logical capabilities such as text-generation rather than vendor-specific model names.

Recommended runtime metadata:
- runtime_id
- provider_id
- model_id
- backend
- accelerator
- deployment_target
- region
- supported_protocols
- context_limit
- latency_class
- cost_class
- health_status
- last_verified_at

None of these fields is an authority grant.

## Failure semantics
- provider unavailable -> DEGRADED
- evidence missing -> NOT VERIFIED
- authorization missing -> BLOCKED
- external verification unavailable -> NOT OBSERVABLE
- execution succeeded but evidence is incomplete -> PARTIALLY VERIFIED

## Security boundary
Never place secrets, private keys, bearer tokens, wallet credentials, database URLs, or sensitive approval artifacts into protocol discovery documents.

External protocol messages are inputs to the governance system, not trusted governance decisions.
