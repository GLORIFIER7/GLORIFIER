# EDDI external agent-workforce adoption boundary

**Decision: adopt selected EDDI patterns and evaluate it as an optional external agent-workforce service. Do not fork, vendor, or merge the EDDI application into GLORIFIER.**

**Evidence status: NOT VERIFIED.** This is a source-documentation assessment pinned to upstream `labsai/EDDI` commit `4255562f6aa0f773851ff1689ddbafb1eec6922b`. No EDDI instance, endpoint, credentials, tenant, database, or production connection has been configured or contacted.

## What EDDI is

[EDDI](https://github.com/labsai/EDDI) (Enhanced Dialog Driven Interface) is a separately deployable, config-driven multi-agent orchestration middleware. Its upstream documentation describes a Java 25 / Quarkus application with a built-in Manager and Chat UI, conversation state, agent/workflow configuration, MCP and A2A interfaces, RAG, memory, group conversations, schedules, OAuth/OIDC, spend controls, and Docker/Kubernetes deployment.

The upstream repository declares Apache License 2.0. Its published feature descriptions and tests are upstream project evidence, not independent verification of GLORIFIER interoperability, production security, or suitability for a particular deployment.

## Extraction decision

| EDDI capability/pattern | GLORIFIER adoption decision | Boundary |
|---|---|---|
| Declarative agents and reusable workflows | Adopt the pattern: versioned, schema-validated agent/workflow definitions with explicit capability declarations | GLORIFIER owns identity, policy, authority and execution approval; an EDDI JSON definition is not an authorization grant |
| Multi-agent group conversations | Reuse selected discussion patterns: peer review, devil's advocate, Delphi, debate, task force and negotiation | Every phase needs an objective, bounded rounds, participant scope, timeout and evidence contract; LLM consensus is not proof |
| Votes and structured artifacts | Adopt the design pattern of blind, explicit ballots and versioned shared artifacts with compare-and-set updates | Retain raw ballots, quorum, weights, dissent and artifact versions; never use an LLM merge to resolve concurrent writes |
| Persistent memory and RAG | Adopt policy-scoped memory and pluggable retrieval as design patterns | Keep user/tenant ownership, data classification, retention, deletion and provenance explicit; do not silently merge EDDI memory into GLORIFIER's evidence store |
| Tenant quotas and spend controls | Adopt strict per-tenant cost ceilings, model price coverage, usage attribution and fail-closed behavior as design requirements | GLORIFIER's own economic ledger remains authoritative; remote EDDI reports are observations requiring reconciliation, not settled economic truth |
| Human-in-the-loop and audit | Adopt approval categories, four-eyes review, reason codes and reviewable audit trails | GEAS remains the authority. EDDI roles and approvals do not automatically satisfy GLORIFIER approval policy |
| Operational dashboard and telemetry | Reuse dashboard/observability concepts where useful | The GLORIFIER evidence layer must distinguish configured, reachable, authenticated, authorized, healthy and verified states |
| MCP and A2A | Evaluate EDDI as an external MCP server and A2A agent/workforce | A standards label or local test does not prove external conformance; verify each exact protocol revision, transport, auth scheme and operation |

## Proposed integration topology

```text
Human Owner
    |
GLORIFIER AI CEO + GEAS
(identity, policy, risk, data scope, budget, approval)
    |
Future general-purpose MCP/A2A integration gateway
(exact origin allowlist, protocol/version checks, per-call authorization)
    |
Optional independently operated EDDI deployment
(configured agent workforce, group workflows, memory/RAG and business tools)
    |
Remote task result + provenance + usage observation
    |
GLORIFIER validation, evidence ledger and owner review
```

GLORIFIER remains the system of authority; EDDI is an optional execution peer, not a second system of authority. GLORIFIER must authorize each exposed capability and remote invocation. EDDI must not be able to grant itself GEAS privileges, alter GLORIFIER policy, approve GLORIFIER actions, or publish unreviewed results as verified evidence.

## What is already present in GLORIFIER

The inspected GLORIFIER main source already contains:
- GEAS governance and human-approval controls;
- a Specialist Council / provider orchestration model;
- a standard A2A Agent Card and authenticated task-handler/proxy source;
- a fixed-scope, read-only GitHub MCP Worker endpoint;
- a canonical interoperability capability registry and evidence vocabulary.

These are existing source capabilities, not proof of external EDDI interoperability. The fixed-scope GitHub MCP endpoint is not a general-purpose MCP client or arbitrary external MCP connector. The broader external A2A/MCP conformance status remains NOT VERIFIED.

## Security and operational constraints

1. **Authentication must be enabled before exposure.** In the inspected EDDI documentation, OIDC is off until `quarkus.oidc.tenant-enabled=true`. Configure OIDC with a reachable issuer/token endpoint, enforce TLS, and test role-to-operation mapping. Do not rely on an EDDI default installation being authenticated.
2. **Treat Agent Cards as discovery metadata, not trust.** EDDI documents anonymous Agent Card discovery by design. Validate the exact endpoint, advertised identity, protocol version, authentication requirements and trusted key/signature behavior before delegation.
3. **Treat MCP tool descriptions and outputs as untrusted data.** The inspected EDDI MCP documentation enumerates 120 tools; the set and permission contract can change by release. Pin a release, perform `tools/list`, review schemas, and allowlist only the minimum required operations. Start with read-only tools.
4. **Do not automatically retry non-idempotent calls.** EDDI's documentation warns that operations such as agent/group/schedule creation may complete even when a client experiences a transport error. Read back the state before any retry; add idempotency only where the remote contract demonstrably supports it.
5. **No credential forwarding.** Use a dedicated, least-privilege identity for each integration. Keep credentials in the relevant secret manager; never place tokens in Agent Cards, prompts, tool descriptions, traces or the capability registry. Pin the exact HTTPS origin and block redirects to other hosts.
6. **Keep memory stores separate by default.** Transfer only task-scoped, user-authorized context. Define data residency, retention, deletion, tenant isolation and source provenance before any memory synchronization.
7. **Reconcile spend independently.** EDDI's cost and quota telemetry may help estimate workload usage, but GLORIFIER must preserve its own request-level ledger and reconcile upstream provider usage/charges before making economic claims.
8. **Budget the deployment.** EDDI adds a Java/Quarkus container, a database and potentially Keycloak, NATS, vector storage, monitoring and model endpoints. Do not provision this stack until an owner-approved, no-cost or funded environment is identified.
9. **License discipline.** The upstream repository declares Apache 2.0. If code is copied in a future, separately reviewed change, retain the license and applicable notices and mark modified files as required. Third-party dependencies retain their own licenses.

## Staged acceptance gates

### Phase 0 — Documentation and threat-model review
Completed only as a source-documentation assessment in this change. No endpoint or service connection is created.

### Phase 1 — Exact-release interoperability contract
Before implementation, pin an EDDI release/digest and verify:
- EDDI OIDC is enabled and the intended issuer/token endpoint works from the GLORIFIER runtime;
- the EDDI A2A Agent Card and advertised protocol version are valid;
- MCP Streamable HTTP discovery/list behavior matches the pinned MCP revision;
- tool schemas, tool names, role tiers and write side effects are inventoried;
- request/response sizes, timeouts, redirects, rate limits and cancellation are bounded.

### Phase 2 — Read-only canary
Against an explicitly owner-authorized staging endpoint only, test authenticated Agent Card discovery, MCP tool listing, and a tiny allowlist of read-only operations. Record exact EDDI version, endpoint origin, protocol revisions, principal/scope, timestamps, correlation IDs and sanitized results. No chat messages containing customer data, memory writes, agent creation, scheduling or business-system writes.

### Phase 3 — Governed task delegation
Only after Phase 2 passes, add a general-purpose A2A/MCP client adapter with per-capability GEAS authorization, tenant/data boundaries, output validation, idempotency handling, bounded retries, audit receipts and a human approval path for consequential operations.

### Phase 4 — Optional workflow and memory adoption
Evaluate structured group workflows, versioned shared artifacts, RAG and scoped memory as separate features. Do not import the entire EDDI database or copy its orchestration engine into GLORIFIER.

## Explicit non-actions

- No EDDI source code or Docker image is copied into GLORIFIER.
- No Java/Quarkus runtime, database, NATS cluster, Keycloak, vector store or EDDI dashboard is provisioned.
- No EDDI endpoint, API token, OIDC client, user, tenant or secret is created.
- No external MCP/A2A request is made and no agent is created or invoked.
- No provider inference, data synchronization, production deployment, paid service or automatic action is enabled.

## Pinned upstream references

- [EDDI repository README](https://github.com/labsai/EDDI/blob/4255562f6aa0f773851ff1689ddbafb1eec6922b/README.md)
- [EDDI architecture](https://github.com/labsai/EDDI/blob/4255562f6aa0f773851ff1689ddbafb1eec6922b/docs/architecture.md)
- [EDDI A2A protocol](https://github.com/labsai/EDDI/blob/4255562f6aa0f773851ff1689ddbafb1eec6922b/docs/a2a-protocol.md)
- [EDDI MCP server and role mapping](https://github.com/labsai/EDDI/blob/4255562f6aa0f773851ff1689ddbafb1eec6922b/docs/mcp-server.md)
- [EDDI group conversations](https://github.com/labsai/EDDI/blob/4255562f6aa0f773851ff1689ddbafb1eec6922b/docs/group-conversations.md)
- [EDDI tenant quotas](https://github.com/labsai/EDDI/blob/4255562f6aa0f773851ff1689ddbafb1eec6922b/docs/tenant-quotas.md)
- [EDDI secrets vault](https://github.com/labsai/EDDI/blob/4255562f6aa0f773851ff1689ddbafb1eec6922b/docs/secrets-vault.md)
- [EDDI Apache 2.0 license](https://github.com/labsai/EDDI/blob/4255562f6aa0f773851ff1689ddbafb1eec6922b/LICENSE)
