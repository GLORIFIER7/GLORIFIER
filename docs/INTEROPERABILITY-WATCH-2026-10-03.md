# GLORIFIER Interoperability Watch — 2026-10-03

## Purpose
Track externally verified protocol/runtime changes that affect GLORIFIER's provider-neutral orchestration architecture. This separates implemented repository changes from work requiring live evidence.

## Verified ecosystem signals

### A2A v1.0
A2A v1.0 is a production-ready open agent-to-agent standard with version negotiation, multiple protocol bindings, multi-tenancy, signed Agent Cards, and task delivery through polling, streaming, or webhooks.

Source: https://a2a-protocol.org/dev/blog/2026/03/12/a2a-protocol-ships-v10-production-ready-standard-for-agent-to-agent-communication/

GLORIFIER response:
- Advertise A2A v1.0 as the target external interoperability profile.
- Keep GLORIFIER governance and authority semantics above the wire protocol.
- Do not claim A2A conformance until the actual endpoint passes an interoperability test.

### MCP 2026-07-28
The current MCP specification documents a stateless request model and an optional Tasks extension for durable long-running operations.

Source: https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2026-07-28/index.mdx

GLORIFIER response:
- MCP is the agent-to-tool/context boundary.
- A2A is the agent-to-agent boundary.
- Authorization, evidence, and authority attenuation remain GLORIFIER responsibilities.

### OpenAI agent runtime
OpenAI documents Agents SDK support for multi-agent work, tools, MCP, orchestration/handoffs, guardrails, human review, state, and observability. OpenAI also documents controlled sandbox execution for long-horizon tasks.

Sources:
- https://developers.openai.com/api/docs/guides/agents/sdk
- https://openai.com/index/the-next-evolution-of-the-agents-sdk/

GLORIFIER response:
- Model execution runtime is replaceable infrastructure.
- Sandbox identity and permissions stay below the governance layer.
- Provider-specific runtime concepts must not become governance-kernel dependencies.

### NVIDIA Dynamo
NVIDIA Dynamo v1.5.0 is a distributed inference framework supporting vLLM, SGLang, and TensorRT-LLM, with Kubernetes, Slurm, and local deployment.

Sources:
- https://docs.nvidia.com/dynamo/
- https://docs.nvidia.com/dynamo/v1.5.0/reference/releases/v1-5-0

GLORIFIER response:
- Represent inference backend, accelerator, placement, routing and runtime capabilities separately.
- Do not hard-code NVIDIA-specific concepts into provider-neutral orchestration.
- Treat Dynamo as an optional execution substrate, not a governance dependency.

## GLORIFIER implementation contract
1. Provider identity MUST NOT imply authority.
2. Model identity MUST NOT imply authority.
3. A skill/capability MUST NOT grant permission by itself.
4. Every externally delegated task MUST carry an authorization reference.
5. Idempotency MUST be explicit for retryable task submission.
6. Evidence status MUST remain distinct from task completion.
7. Missing evidence MUST resolve to UNKNOWN/NOT VERIFIED rather than success.
8. External protocol conformance MUST be reported separately from internal compatibility.
9. Financial movement and irreversible production actions remain human-authorized.
10. Secrets MUST never be embedded in Agent Cards, task envelopes, schemas, tests, or documentation.

## Verification backlog
| Area | Repository state | Required evidence |
|---|---|---|
| A2A v1.0 Agent Card semantics | Implemented metadata | External A2A Inspector/TCK or equivalent |
| MCP 2026-07-28 profile | Documented | Real MCP client/server interoperability test |
| Long-running task model | Internal schema support | Durable execution test |
| Sandbox execution | Boundary documented | Runtime isolation/security test |
| NVIDIA Dynamo | Capability documented | Real Kubernetes/GPU deployment |
| Cross-provider execution | Provider registry exists | Same task through 2+ providers with identical governance result |
| Production deployment | Existing workflows | Live deployment evidence |
| Crypto/financial execution | Human-approval boundary retained | Human authorization plus independent receipt |

## Status vocabulary
Use only:
- FULLY VERIFIED
- VERIFIED
- PARTIALLY VERIFIED
- NOT VERIFIED
- DEGRADED
- NOT OBSERVABLE

Never convert architectural intention into runtime verification.
