# GLORIFIER Agent Federation

GLORIFIER uses A2A as its agent-to-agent interoperability target and MCP/tool adapters for agent-to-tool/data access.

## Roles
- Agent Registry — canonical discovery records for participating agents.
- Collaboration Broker — routes governed tasks between agents.
- Governance Kernel — authorization, policy and human-approval gates.
- Evidence Layer — records task/result evidence references.
- Crypto Agent — audits and prepares GLR deployment tasks.
- Release Agent — prepares npm publication and release evidence.
- Verification Agent — independently verifies blockchain/package evidence.

## Lifecycle
DISCOVERED -> AUTHORIZED -> ASSIGNED -> RUNNING -> EVIDENCE -> VERIFIED -> SETTLED / FAILED

SETTLED means the governed task completed; it does not authorize automatic financial transfer.

## Protocol boundary
A2A v1.0 is the target federation protocol. MCP 2026-07-28 is the target tool/context protocol.

A2A and MCP are complementary:
- A2A coordinates agents.
- MCP connects agents to tools and context.
- Provider APIs execute model/inference work.
- GEAS decides authority.
- Evidence determines verification.

Current A2A v1.0 conformance is NOT VERIFIED until an external interoperability/conformance test succeeds.

## Security rules
1. Human Authority remains highest.
2. No automatic irreversible production change.
3. No automatic financial transfer.
4. No automatic credential rotation.
5. Skills/capabilities do not grant authority.
6. Provider/model identity does not grant authority.
7. Every governed task requires an authorization reference.
8. Retryable tasks require an idempotency key.
9. No evidence -> UNKNOWN / NOT VERIFIED.
10. Failed component -> DEGRADED / FAILED, never fabricated success.
11. Mainnet deployment requires explicit human authorization.
12. Secrets never belong in Agent Cards or task envelopes.