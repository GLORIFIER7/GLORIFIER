# GLORIFIER Agent Federation

GLORIFIER uses A2A for agent-to-agent collaboration and MCP/tool adapters for agent-to-tool/data access.

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

A2A is the federation protocol for agent-to-agent work. MCP remains the tool/data protocol. GLORIFIER does not require participating agents to expose their internal model, memory, or tools.

## Security rules

1. Human Authority remains highest.
2. No automatic irreversible production change.
3. No automatic financial transfer.
4. No automatic credential rotation.
5. No evidence -> UNKNOWN / NOT VERIFIED.
6. Failed component -> DEGRADED / FAILED, never fabricated success.
7. Mainnet deployment requires explicit human authorization.
