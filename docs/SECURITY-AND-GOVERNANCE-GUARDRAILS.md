# GLORIFIER Security and Governance Guardrails

## Non-negotiable controls

1. Human authority remains the highest authority.
2. Capability is not authorization.
3. Model/provider identity is not authorization.
4. A2A discovery does not grant execution rights.
5. MCP tool availability does not grant permission to invoke a tool.
6. Evidence absence means UNKNOWN or NOT_VERIFIED.
7. Failed components produce degraded/failed states, never fabricated success.
8. Retries of state-changing tasks require idempotency.
9. Mainnet, financial, credential, and irreversible production actions require explicit authorization and applicable human approval.
10. Secrets must never be stored in Agent Cards, task schemas, documentation, logs, or commits.

## Runtime containment

Future execution environments SHOULD support isolated workloads, explicit network egress policy, short-lived credentials, per-task resource limits, tool allowlists, audit logs, kill/quarantine controls, policy enforcement before tool execution, and evidence capture after execution.

Runtime containment is an implementation requirement, not evidence that containment is currently deployed.

## Observability

Every governed task should be traceable through request -> authorization -> assignment -> execution -> tool calls -> evidence -> outcome.

Telemetry must distinguish requested, attempted, succeeded, externally verified, and financially settled. These are not synonyms.

## Security failure handling

Security or policy uncertainty must fail closed for privileged operations. The system may degrade to read-only or non-privileged behavior when safe, but must not silently broaden authority.
