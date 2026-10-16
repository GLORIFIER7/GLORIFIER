# ASAP Protocol integration boundary

Status: **PARTIALLY VERIFIED — adapter contract only; no live ASAP transport is enabled.**

## Decision

Integrate [ASAP Protocol](https://github.com/asap-protocol/asap-protocol) as an optional interoperability adapter beside GLORIFIER's existing A2A/MCP boundaries. Do not replace GEAS, the GLORIFIER task lifecycle, the agent registry, identity, policy, audit, or evidence systems.

ASAP's public repository describes a stateful agent-to-agent protocol with Python and TypeScript SDKs, task envelopes, resumability, capability controls, and MCP integration. Those project claims are a reason to evaluate compatibility, not proof that GLORIFIER conforms to ASAP.

## Phase 1 delivered here

- A dependency-free TypeScript boundary contract that validates a candidate handoff before transport.
- Explicit checks for feature enablement, authenticated caller identity, GEAS authorization, and human approval for high-risk or irreversible capabilities.
- A narrow outgoing intent containing only task/correlation identifiers, capability, objective, and payload supplied by the caller.
- Regression tests for default-off, missing identity/authorization, sensitive-action approval, and allowed low-risk intent.
- This document records the integration boundary and acceptance gates.

## Runtime safety defaults

- `GLORIFIER_ASAP_ENABLED` must be explicitly set to `true`; absent or other values mean disabled.
- The adapter does not perform network requests, discover remote endpoints, trust marketplace registrations, or execute tools.
- A discovered ASAP agent is not automatically authenticated, authorized, trusted, or conformant.
- Never forward credentials, signing secrets, internal policy details, or unrestricted GLR/payment capabilities in a task payload.
- Authorization is evaluated by GLORIFIER before handoff. Remote capability claims do not grant authority.
- Idempotency, replay protection, audience/scope validation, signature verification, timeout/retry limits, SSRF/egress policy, task-state reconciliation, and audit persistence must be implemented and tested in a concrete transport adapter before any endpoint is enabled.
- Financial actions, repository merges, production mutations, credential changes, and other irreversible actions remain blocked without explicit human approval.

## Acceptance gates before enabling a live transport

1. Pin and review the exact ASAP SDK version and license; audit transitive dependencies.
2. Implement a concrete client adapter behind this contract; validate against the upstream schema and version negotiation.
3. Add contract tests for malformed envelopes, expiry, signature/key rotation, replay, duplicate delivery, idempotency, cancellation, retries, and failure recovery.
4. Bind authenticated remote identity and audience to a GEAS principal and attenuated capability grant on every request.
5. Enforce outbound host allowlists and DNS/IP checks to prevent SSRF; deny redirects to unapproved destinations.
6. Persist request/task correlation, authorization decision, remote response hash, evidence references, and status transitions in GLORIFIER's existing audit/evidence path.
7. Run CI, security scanning, and staging integration tests. Keep the status **NOT VERIFIED** until evidence passes.
8. Require owner review before enabling the feature flag in any deployed environment.

## Truthful status

This change is an adapter seam and policy gate, not a claim of ASAP protocol conformance, marketplace registration, successful remote handoff, or production deployment. Existing GLORIFIER A2A/MCP and GEAS behavior remains authoritative.
