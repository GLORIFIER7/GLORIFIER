# GLORIFIER interoperability hardening

Implemented on this branch:

- Provider-neutral durable task envelope.
- Explicit task lifecycle and legal state transitions.
- Idempotency key and authorization-reference requirements.
- Evidence references and task-envelope hashing.
- MCP 2026-07-28 recorded as the preferred protocol boundary.
- A2A represented as a durable, governed collaboration boundary.
- Skills explicitly separated from authority grants.
- NVIDIA Dynamo and other inference engines remain replaceable implementations.

Verification still required before claiming interoperability: TypeScript compilation, unit tests, MCP conformance, A2A interoperability, replay/idempotency tests, restart recovery, authorization tests, provider-equivalence tests, and observability checks.

No credentials, financial actions, autonomous deployment, or authorization bypasses are introduced by these changes.
