# Interoperability gap register

Status: **PARTIALLY VERIFIED — audit baseline only; no universal interoperability claim.**

Audit date: 2026-10-26  
Repository: `GLORIFIER7/GLORIFIER`

This register records gaps from a targeted read-only inspection of the default-branch source. It is not a claim that every source file, workflow, adapter, or remote endpoint was tested. Update each item only with linked source, test, CI, and (where applicable) live-probe evidence.

## Evidence reviewed

- `package.json`: provider and protocol test scripts; TypeScript/Node.js application dependencies.
- `src/lib/ai/registry.ts`: provider registry, governed fallback policy, bounded retry/cooldown logic, capability-based eligibility, and trace summarization.
- `src/lib/ai/provider-discovery.ts`: provider inventory, endpoint probes, provider status classification, and discovery metadata.
- `src/lib/ai/providers/nvidia-provider.test.ts`: mocked NVIDIA chat-completions response; explicitly not live inference evidence.
- `src/lib/ai/providers/anthropic.test.ts`: mocked Anthropic response and rate-limit behavior.
- `src/lib/ai/agent-harness.test.ts`: tool authorization and human approval behavior.
- `src/lib/federated-a2a-v3.test.ts`: lifecycle and governance invariants.
- `src/lib/asap-bridge.test.ts` and `docs/architecture/asap-protocol-integration.md`: handoff policy tests and explicit absence of live ASAP transport.
- `docs/architecture/cloudflare-workers-only-migration.md`: documents that the application still has unported backend routes and that Worker health does not prove provider, database, or authentication readiness.

## Gap register

| ID | Area | Observed evidence | Gap / required remediation | Acceptance evidence |
|---|---|---|---|---|
| INT-001 | AI provider contract | Registry unifies message generation and provider identity. | Define and test a versioned canonical request/response/error contract, including usage, finish reason, tool calls, structured output, streaming, and multimodal payload limits. | Contract tests for every adapter; schema compatibility tests; deterministic fixtures. |
| INT-002 | Capability-aware routing | Registry filters on discovery capabilities; discovery declares capability arrays. | Verify each advertised capability against actual model/provider support. Do not infer tool-calling, JSON mode, streaming, or multimodal support from provider identity alone. | Per-model capability evidence with tests; routing rejects unsupported features. |
| INT-003 | Provider discovery and authorization | Discovery distinguishes configured, authenticated, availability, and authorization states. | Test every status mapping, stale observations, timeouts, malformed JSON, non-JSON errors, and provider-specific model-list formats. Ensure discovery never equates an HTTP success with usable inference unless that is the probe contract. | Unit tests for each status class plus bounded live probes with redacted evidence. |
| INT-004 | Credential handling | Provider probes use server-side environment variables. | Review every adapter for credentials in URLs, telemetry, exceptions, logs, and persisted metadata. Prefer authorization headers where supported. | Secret-canary tests; log/trace redaction tests; no credentials in URLs or evidence records. |
| INT-005 | Retry and failover | Registry implements cooldowns and bounded retry/fallback policy. | Classify retryable errors structurally; ensure retries/failover cannot duplicate tool side effects or billable non-idempotent operations. Respect Retry-After and total deadlines. | Deterministic retry matrix, fake clock, attempt ceiling, idempotency tests. |
| INT-006 | MCP | Agent harness tests tool authorization; no MCP handshake/conformance proof was established in this audit. | Inventory MCP client/server transports, protocol versions, initialization, capability negotiation, tool/resource/prompt schemas, cancellation, timeouts, and error semantics. | Official protocol conformance tests and local end-to-end client/server tests for every supported transport. |
| INT-007 | A2A | A2A and federated task lifecycle code/tests exist. | Verify agent-card discovery, version negotiation, authenticated identity, task-state mapping, artifact handling, cancellation, retries, duplicate delivery, and remote error mapping against the selected upstream specification version. | Version-pinned conformance fixtures and a controlled two-agent integration test. |
| INT-008 | ASAP | Adapter seam and policy tests exist; documentation says no live transport is enabled. | Keep feature default-off until a concrete transport includes signature validation, replay protection, idempotency, endpoint allowlists, bounded retries, and audit persistence. | Security tests, upstream schema validation, staging handoff evidence, owner approval. |
| INT-009 | Language adapters | The inspected root manifests did not include `pyproject.toml`, `Cargo.toml`, or `go.mod`; adapters may exist in subdirectories. | Recursively inventory Python, Rust, Go, JavaScript/TypeScript, and other adapter directories before claiming support. Define one cross-language conformance suite. | Repository-wide path inventory; per-language build/test results; shared golden fixtures. |
| INT-010 | OpenAPI and schema distribution | No root-level `openapi.yaml` or `mcp.json` was found at the inspected paths. | Search nested directories and generate canonical API/protocol schemas from existing source rather than creating competing contracts. | Schema location documented; drift check in CI; generated schemas validate. |
| INT-011 | Observability and evidence | Registry tracing summarizes provider attempts/statuses and filters provider IDs. | Verify secret/PII redaction, correlation IDs, stable error codes, latency/usage fields, and evidence links across all providers and protocols. | Redaction tests, trace contract tests, correlation propagation tests. |
| INT-012 | Runtime proof | Worker migration document records some live endpoint checks but explicitly leaves provider/authentication and other dependencies unprobed. | Keep source tests, mocked tests, CI, live provider inference, and production readiness as distinct evidence levels. | Timestamped endpoint-specific probe records; no inference from Worker liveness to provider readiness. |

## Required implementation order

1. **Inventory and contract:** locate all adapters and existing schemas; avoid creating a parallel contract if one already exists.
2. **Deterministic tests:** add shared provider/protocol fixtures and failure matrices before modifying adapter behavior.
3. **Security fixes:** eliminate credential leakage; enforce endpoint allowlists, payload bounds, authorization, and idempotency where applicable.
4. **Conformance:** validate MCP and A2A implementations against explicit protocol versions and upstream schemas; keep ASAP disabled until its gates pass.
5. **Language parity:** apply the same contract fixtures to each language adapter that actually exists.
6. **CI enforcement:** add drift detection and required test commands only after confirming the repository's current workflow conventions.
7. **Staging verification:** run controlled integration probes with approved credentials; record status, timestamp, model/version, latency, and redacted evidence.
8. **Release decision:** require human review for secrets, production configuration, merges, deployment, and financial actions.

## Truthful status rules

- Dependency present != adapter conformant.
- Credential configured != authenticated.
- Authenticated != inference available.
- Mocked test pass != live provider pass.
- Agent card discovered != remote agent trusted.
- MCP tool-shaped interface != MCP protocol conformance.
- A2A task lifecycle unit test != cross-agent interoperability.
- Worker health != application/provider/database readiness.
- No observed failure != verified success.

Use `NOT VERIFIED` until acceptance evidence exists; use `DEGRADED` only when an actual failed observation supports that state. This register does not authorize deployment, credential changes, external calls, merges, or paid operations.

## Mintlify MCP discovery — 2026-10-26

| ID | Area | Observed evidence | Gap / required remediation | Acceptance evidence |
|---|---|---|---|---|
| INT-013 | Mintlify documentation discovery | Mintlify Admin MCP can list the `glorifier` deployment, enumerate its navigation, and read `index.mdx` and `quickstart.mdx`. A PARTIALLY VERIFIED capability record was added to `docs/architecture/interoperability-capabilities.json`. | This proves read-only connector access only. The inspector has not been shown to call Mintlify programmatically at runtime, validate MCP protocol behavior, or synchronize documentation evidence automatically. Both inspected pages still contain starter-template text. | Add a least-privilege Mintlify connector adapter behind the existing inspector contract; redact credentials and page-sensitive metadata; test unavailable/unauthorized responses, pagination, timeouts, stale evidence, and schema validation; retain redacted test/CI evidence. Do not elevate status without those results. |

## Fresh evidence checkpoint — 2026-10-30T03:48:17Z

Default-branch baseline at audit start: `cab3ba28faf4b6cb66552dc09fe36655569ffdd2`.

The exact-main-commit Interoperability Linux validation run [#40998469483](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/40998469483) completed successfully:
- Ubuntu 22.04 x86_64 source job passed evidence freshness policy, MCP interoperability registry policy, registry and capability validation, TypeScript, Worker/interoperability boundary tests, chain-specific read-only verifier test vectors, frontend build, and static output verification.
- Ubuntu 24.04 x86_64 source job passed the same checks.
- Ubuntu 24.04 x86_64 container job built both distroless and Ubuntu images and passed health and graceful-shutdown smoke tests.

This establishes repository CI behavior for the named Ubuntu x86_64 targets only. It does not establish live provider inference, a deployed Neural origin, external MCP or A2A conformance, production egress configuration, or live EVM/BNB/Solana RPC reachability.

### Live evidence freshness correction

The registry's previous live observations for Neural health/readiness, Worker runtime verification, operational reports, and identity were last recorded on 2026-10-29T03:45:21Z. At this checkpoint they are more than 24 hours old. Their live status is therefore now `NOT OBSERVABLE`; historical HTTP results remain recorded as historical evidence and have not been rewritten as current success or current failure.

A new approved read-only production probe is required before any of those live capability rows can be promoted. No production configuration, secrets, provider egress, database writes, deployment, or blockchain transactions were performed for this refresh.



## Protocol conformance boundary review — 2026-10-30

This source review pins the standards targets for the next implementation work. It does **not** promote either adapter to VERIFIED.

### A2A target: specification 1.0.1

- Normative discovery URI: `/.well-known/agent-card.json`.
- An A2A server MUST publish an Agent Card describing identity, capabilities, skills, authentication requirements, and its supported interfaces.
- Each advertised interface must accurately declare the endpoint URL, protocol binding, and protocol version. Do not advertise an interface until its wire endpoint actually implements it.
- Current GLORIFIER source exposes `/.well-known/a2a-agent-card.json` with a GLORIFIER-specific manifest and capability list. This is a proprietary discovery document, not an A2A 1.0.1 Agent Card: it does not establish the standard URI, required Agent Card shape, or an A2A 1.0 message/task binding.
- Existing `/api/a2a/tasks` and federated task lifecycle code remain GLORIFIER-specific APIs. Their presence and unit tests do not establish A2A 1.0.1 interoperability.
- The Cloudflare Worker does not currently serve the standard Agent Card or an A2A 1.0 message/task endpoint natively. Do not route an unverified A2A path through an arbitrary backend or claim production availability.

Normative source: [A2A 1.0.1 specification — Agent Card discovery and supported interfaces](https://github.com/a2aproject/A2A/blob/3303592588e388e62e0f69f701af531d2f4e3991/docs/specification.md#8-agent-discovery-the-agent-card).

Reproducible upstream snapshot: repository commit `3303592588e388e62e0f69f701af531d2f4e3991` (release tag `v1.0.1`); `docs/specification.md` Git blob SHA-1 `382185a53b312cd6a60f5ac536ec5a356437ce77`. The full commit and blob identifiers, not the moving default branch, define this audit reference. Acceptance requires a pinned schema/fixture set, standard discovery route, at least one genuinely implemented binding, version negotiation, authenticated/authorized task handling, task state/error mapping, cancellation semantics where advertised, and a controlled two-agent test.

### MCP target: specification revision 2026-07-28

- The selected target revision is `2026-07-28`; future or earlier revisions must be treated as separate compatibility targets.
- For this revision, the server discovery operation is `server/discover`; it reports supported protocol versions, capabilities, and server identity. It is not itself proof that tool/resource/prompt operations or transports are implemented.
- The conformance plan must not assume the older initialize/notifications/initialized sequence is mandatory for the selected stateless Streamable HTTP design. Legacy stdio compatibility is a separate transport concern.
- Current GLORIFIER evidence establishes no MCP server transport, discovery operation, capability negotiation, tool/resource/prompt RPC, or official conformance result. The agent harness's tool authorization is not MCP conformance.

Normative source: [MCP 2026-07-28 server/discover](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/b488c16623e5202a3961e551886044577ae0f096/docs/specification/2026-07-28/server/discover.mdx).

Reproducible upstream snapshot: repository commit `b488c16623e5202a3961e551886044577ae0f096`; `docs/specification/2026-07-28/server/discover.mdx` Git blob SHA-1 `f6fc1acf974819d99338d2be25ad953fcb9e57a6`. The selected MCP reference-server examples are pinned to repository commit `cabf72d388c0b9a82d4ac77aee1843c215a23e8b` (2026-10-28). Acceptance requires a revision-pinned protocol fixture suite, implemented transport and discovery, tools/list and tools/call behavior where tools are advertised, authorization/error/cancellation/timeout/body-size tests, and a real client/server integration test using local fixtures.

### Explicit non-claims

Neither A2A nor MCP is currently marked VERIFIED. No live provider, external agent, MCP server, production Worker route, or production backend was probed or changed during this source review. The next code changes must be test-first and separately reviewable.