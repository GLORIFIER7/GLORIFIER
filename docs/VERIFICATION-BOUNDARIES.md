# GLORIFIER Verification Boundaries

## Purpose

GLORIFIER must not turn an architectural declaration into a verified operational fact. Verification is a separate evidence-producing process.

## Authority boundary

GEAS remains the authority boundary. A verification record can describe evidence; it cannot grant authority, credentials, spending permission, deployment permission, or mainnet approval.

## Protocol boundary

A2A and MCP compatibility are protocol-specific claims. A2A Agent Card discovery does not prove A2A v1.0 conformance or cryptographic identity. MCP version labels do not prove live interoperability.

## Runtime boundary

A runtime compatibility record identifies an exact tuple. It does not prove that the runtime is deployed, healthy, isolated, or safe. Kubernetes/GPU and NVIDIA Dynamo claims require live environment evidence.

## Semantic boundary

Provider portability means preserving task intent and explicit semantics across adapters. It does not mean two providers produce identical output. Semantic equivalence must be evaluated against a declared corpus and acceptance criteria.

## Economic boundary

Metering, billing, settlement, and economic outcomes are separate claims. Provider usage records must be reconciled before billing is considered verified. External authoritative evidence is required before an economic outcome is considered independently verified.

## Security boundary

No verification workflow may:
- add or expose credentials;
- weaken authentication or authorization;
- bypass GEAS;
- automatically rotate credentials;
- perform autonomous financial transfers;
- make irreversible production changes.

## Status discipline

If evidence is missing, stale, contradictory, or outside scope, status remains NOT_VERIFIED, PARTIALLY_VERIFIED, DEGRADED, or NOT_OBSERVABLE as appropriate. It must never be promoted to VERIFIED merely because a configuration file exists.
