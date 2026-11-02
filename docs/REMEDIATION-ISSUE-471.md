# Issue #471 remediation plan

## Objective
Establish evidence-based interoperability across HTTP/JSON, OpenAPI, Linux, AI providers, and supported blockchains while keeping GLORIFIER as the control plane.

## Delivery sequence
1. Inventory endpoints, providers, Linux entrypoints, blockchain verifiers, secrets, data stores, and CI checks.
2. Publish versioned OpenAPI, health/readiness, error, capability-registry, and threat-model contracts.
3. Implement one adapter at a time, beginning with HTTP/JSON and OpenAPI; use mocks by default and staging endpoints only when approved.
4. Validate named Linux targets through clean container builds and CI; do not claim unsupported distributions.
5. Validate blockchain adapters with read-only test vectors and RPC checks; keep signing, minting, transfers, contract writes, and paid RPCs disabled.
6. Run staging interoperability tests for auth failures, invalid origins, timeouts, upstream 5xx, malformed responses, replay/idempotency, rate limits, and secret redaction.
7. Require green checks, review, staged smoke tests, and a documented rollback plan before release.

## Evidence rules
Every VERIFIED capability must link to an automated test or timestamped live probe and identify its target environment. Use PARTIALLY VERIFIED, NOT VERIFIED, DEGRADED, or NOT OBSERVABLE where evidence is incomplete.

## Safety boundary
No unrestricted egress, credential forwarding, SSRF-prone origin validation, frontend secret exposure, unapproved provider calls, database migration, signing, transaction, mint, deployment, or paid action is permitted.