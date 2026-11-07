# Interoperability gap register

Status: **PARTIALLY VERIFIED — audit baseline only; no universal interoperability claim.**

Audit date: 2026-11-05  
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
| INT-006 | MCP | Fixed-scope read-only GitHub MCP Worker implements legacy 2025 compatibility and a bounded MCP 2026-07-28 stateless subset: `server/discover`, `tools/list`, `tools/call`, per-request version/client-capability metadata, `Mcp-Method`/`Mcp-Name` validation, and revision-correct HTTP error statuses. Local Worker tests cover these paths on PR #661. | Complete required transport behavior for every advertised capability; add SSE request streams, `subscriptions/listen`, cancellation, then external reference-client integration and the official frozen-revision conformance suite. Resource/prompt surfaces must not be advertised until implemented. | Exact-head CI, official MCP 2026-07-28 and 2025-11-25 conformance reports, plus successful external client discovery/list/call against an authorized staging endpoint. |
| INT-007 | A2A | A2A 1.0 JSON-RPC now implements authenticated SendMessage task creation/continuation, GetTask, and requester-scoped ListTasks with durable cursor pagination. Cancellation, streaming/subscription, history, raw/URL file parts, duplicate-message idempotency, full artifact/history semantics, retry behavior, and external TCK evidence remain unverified. | Complete remaining core lifecycle operations safely (especially cancellation), version-pin data-model/error fixtures, test all supported parts and pagination against the official A2A TCK, and add a controlled two-agent staging exchange. | Official A2A TCK report for the exact 1.0.0 binding, authenticated external-client tests, a cancellation/race test, and a controlled two-agent integration report. |
| INT-008 | ASAP | Adapter seam and policy tests exist; documentation says no live transport is enabled. | Keep feature default-off until a concrete transport includes signature validation, replay protection, idempotency, endpoint allowlists, bounded retries, and audit persistence. | Security tests, upstream schema validation, staging handoff evidence, owner approval. |
| INT-009 | Language adapters | All eleven first-party HTTP/JSON SDKs are present: Python, Go, Java, Kotlin, C#/.NET, Rust, PHP, Ruby, Swift, Dart, and JavaScript/TypeScript. Each package has shared wire-fixture tests and a named CI target documented in `sdk/README.md`. | Keep every SDK claim limited to its exact tested runtime, OS, and architecture. These mocked/local HTTP contract suites do not prove a live Neural origin, external A2A/MCP conformance, or universal platform coverage. An inventory validator now requires the eleven package paths, documentation rows, capability records and language-specific CI jobs to stay aligned. | Exact-head SDK CI on every documented target, with shared fixture parity; separate live-origin and external-protocol evidence for broader claims. |
| INT-010 | OpenAPI and schema distribution | A canonical OpenAPI 3.1 contract exists at `docs/architecture/openapi/glorifier-neural-adapter.openapi.json` for the Neural HTTP task adapter. It does not describe the full Worker, A2A, MCP, or provider API surface; no root-level unified `openapi.yaml` or `mcp.json` was found. | Extend or generate a unified API inventory from the canonical source contracts without creating duplicate schemas. Pin protocol revisions and make schema/source drift fail CI. | Every advertised endpoint and protocol operation maps to a canonical versioned schema; generated schemas validate and a drift test passes. |
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
- Fixed-scope GitHub MCP endpoint != general-purpose MCP provider interoperability or full protocol conformance.
- A2A task lifecycle unit test != cross-agent interoperability.
- Worker health != application/provider/database readiness.
- No observed failure != verified success.

Use `NOT VERIFIED` until acceptance evidence exists; use `DEGRADED` only when an actual failed observation supports that state. This register does not authorize deployment, credential changes, external calls, merges, or paid operations.

## Mintlify MCP discovery — 2026-10-26

| ID | Area | Observed evidence | Gap / required remediation | Acceptance evidence |
|---|---|---|---|---|
| INT-015 | Cross-platform SDK coverage | Native SDK CI on PR #728 head `319897d4316862f8c73726c6825c1b6ff7270aad` passed all eleven SDK jobs. Python 3.12, Go 1.26.x, and Node.js 24.12.0 passed on Windows Server 2022 x86_64 and macOS 15 ARM64; Swift also passed on macOS 15 ARM64. Evidence is retained in capability records and [run #42402454620](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/42402454620). | The exact combinations passed are now recorded. Windows for the other seven SDKs, Linux ARM64, other OS/architecture/runtime tuples, and every untested language binding remain NOT VERIFIED. | Add each new platform only with its own exact runtime/OS/architecture CI evidence; never extrapolate one SDK's result to another. |
| INT-014 | JavaScript/TypeScript Node SDK | `sdk/javascript` adds a dependency-free Node.js HTTP client, TypeScript declarations, shared fixture tests, and origin/auth/redirect/timeout/size guards. The exact Node.js 24.12.0 / Ubuntu 24.04 x86_64 CI job passed 9/9 tests in run #42016850741. | Retain the exact Node.js 24.12.0 CI evidence and extend the runtime matrix only with deliberate supported-version policy. | Successful exact-head CI on Node.js 24.12.0 / Ubuntu 24.04 x86_64, plus regression checks for shared fixtures, auth scope, origin allowlists, timeouts, and bounded bodies. |
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
- Current GLORIFIER source includes a fixed-scope `POST /mcp` GitHub bridge. It implements JSON-RPC `initialize`, `ping`, `tools/list`, and `tools/call` for four read-only tools pinned to the public `GLORIFIER7/GLORIFIER` repository. The route is POST-only, returns JSON, and does not implement a GET SSE stream or session state. Its Worker tests cover initialization at `2025-03-26`, tool discovery/calls with mocked upstream responses, request bounds, origin checks, and rate limiting.
- This bridge does not implement the selected `2026-07-28` `server/discover` operation or establish resources, prompts, general-purpose provider adapters, A2A 1.0.1, or external client interoperability. The handler's later protocol version strings are not conformance evidence by themselves; the checked-in Worker test explicitly verifies `2025-03-26` only.
- The `server/discover` operation in the selected specification reports supported protocol versions, its supported capabilities, and server identity. This describes the target specification, not current GLORIFIER implementation. The agent harness's tool authorization is not MCP conformance.

Normative source: [MCP 2026-07-28 server/discover](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/b488c16623e5202a3961e551886044577ae0f096/docs/specification/2026-07-28/server/discover.mdx).

Reproducible upstream snapshot: repository commit `b488c16623e5202a3961e551886044577ae0f096`; `docs/specification/2026-07-28/server/discover.mdx` Git blob SHA-1 `f6fc1acf974819d99338d2be25ad953fcb9e57a6`. The selected MCP reference-server examples are pinned to repository commit `cabf72d388c0b9a82d4ac77aee1843c215a23e8b` (2026-10-28). Acceptance requires a revision-pinned protocol fixture suite, implemented transport and discovery, tools/list and tools/call behavior where tools are advertised, authorization/error/cancellation/timeout/body-size tests, and a real client/server integration test using local fixtures.

### Explicit non-claims

Neither A2A nor the broader MCP adapter capability is currently marked VERIFIED. PR #595 added the fixed-scope GitHub MCP route and was merged on 2026-11-01; Cloudflare deployment metadata for the Worker was observed separately. Public endpoint reachability and an external MCP client handshake remain NOT OBSERVABLE / NOT VERIFIED from this audit environment. The next code changes must be test-first and separately reviewable.

## Source implementation checkpoint — 2026-11-03

This section updates the 2026-10-30 source-only gap review above. It records draft PR #629 implementation and CI evidence; it does **not** promote the A2A/MCP capability to VERIFIED or claim a production rollout.

### A2A 1.0.1 discovery

Draft [PR #629](https://github.com/GLORIFIER7/GLORIFIER/pull/629) adds the standard `GET /.well-known/agent-card.json` endpoint to the Cloudflare Worker. The Worker constructs the Agent Card locally, serves GET and HEAD only, rejects other methods, and does not require the legacy backend to be reachable for discovery. The card advertises the existing `/api/a2a/v1` JSON-RPC interface, A2A protocol version 1.0, its current supported capabilities, and the Bearer authentication requirement.

The inaccurate `bearerFormat: JWT` claim was removed because the exact production token format has not been established. The A2A HTTP boundary now accepts the A2A 1.0.1 preferred `application/a2a+json` media type while retaining `application/json` for backwards compatibility.

**Important boundary:** The card is discovery metadata only. The Worker `/api/a2a/v1` endpoint remains a Bearer-authenticated proxy to the configured backend. This change does not create a new native A2A message/task runtime, prove that the backend is configured, or establish authenticated cross-agent task exchange.

### MCP 2026-07-28 discovery and stateless request versioning

The same draft PR adds MCP 2026-07-28 `server/discover` to the existing fixed-scope, stateless GitHub MCP route. Modern requests must include matching `io.modelcontextprotocol/protocolVersion` metadata in the JSON-RPC request and `MCP-Protocol-Version: 2026-07-28` in the HTTP header. The server reports its supported versions, the implemented tools capability, server identity metadata, and a public cache scope. Modern `tools/list` and `tools/call` return the modern completion envelope; unsupported or mismatched versions return the protocol-version error `-32022`.

The older 2025 `initialize`, `ping`, `tools/list`, and `tools/call` path remains available for backward compatibility. The modern stateless path does not require the legacy initialize handshake.

The endpoint continues to expose exactly four read-only GitHub tools, pinned to the single public `GLORIFIER7/GLORIFIER` repository. It does not advertise resources or prompts because those operations are not implemented. It retains the existing HTTPS GitHub API origin restriction, repository/path validation, bounded request and response sizes, timeout, origin policy, per-client tool-call rate limiting, and no credential forwarding.

### Source and CI evidence

- [PR #629](https://github.com/GLORIFIER7/GLORIFIER/pull/629) is open as a draft and unmerged.
- The PR's dedicated [Cloudflare Worker validate-and-build run #41595118378](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41595118378) passed TypeScript, Worker tests, integration registry/data-truth tests, Neon adapter tests, production smoke contract tests, OpenSea read-only tests, frontend build/static-output checks, and Wrangler dry-run. Its production deployment job was correctly skipped.
- [Interoperability Linux run #41595118106](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41595118106) passed the Ubuntu 22.04 and Ubuntu 24.04 source checks. Each source job passed evidence-freshness and MCP-registry policy tests, A2A 1.0 JSON-RPC and Express contract tests, A2A runtime formatting, pinned A2A/MCP protocol-boundary tests, capability-registry validation, Worker/interoperability tests, chain-specific read-only verifier fixtures, TypeScript, frontend build, and static output verification. The Ubuntu 24.04 container-build job was still running at the time these records were added.
- These are draft-branch source/test and CI observations. Test fixtures use controlled upstream responses; they do not prove live public MCP client connectivity, a production A2A task exchange, or live EVM/BNB/Solana RPC reachability.

### Remaining acceptance gates

The overall `protocol.a2a-mcp-adapters` capability remains **NOT VERIFIED**. It must not be upgraded based solely on local tests or CI. Remaining evidence includes:
- review and merge of PR #629 after exact-head checks and independent review;
- external MCP clients successfully discover the deployed server, list tools, and execute a read-only call using the selected 2026-07-28 request contract;
- an A2A 1.0.1 client discovers the deployed Agent Card and completes an authenticated message/task exchange against an owner-configured, reachable backend;
- production deployment and endpoint-specific health evidence after the protected release gate is run.

No production route, traffic percentage, secret, domain, Neural origin, database, provider, or blockchain state was changed in this source update.


### Exact-head verification refresh — 2026-11-03

The following checks completed successfully on PR #629 head `156674a5442173ac0ea8d5355aa7d3eeacfc7c28`:
- [Cloudflare Worker validate-and-build run](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41596260158): type-check, Worker regression tests, integration registry/data-truth, Neon Hyperdrive adapter, production smoke contracts, OpenSea read-only integration, frontend build/static output, and Wrangler dry-run passed. The production deploy job was skipped.
- [Interoperability Linux run](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41596260044): Ubuntu 22.04 and 24.04 source checks passed, including protocol-boundary, MCP registry, A2A 1.0 contract/Express, and chain-verifier fixture tests. Distroless and Ubuntu 24.04 images passed build, health and graceful-shutdown checks.
- [GLORIFIER CI](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41596260037): build, Supabase default-privilege integration, and agent-state/Postgres integration passed.
- [GLORIFIER Build and Test](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41596260022): passed.
- [SDK conformance](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41596260117): Python 3.10/3.11/3.12 and Go 1.26.x/1.27.x passed.
- [CodeQL](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41596260054): passed.
- Snyk, DeepScan, CircleCI Worker validation, and Netlify deploy preview checks: passed for the same exact PR head.
- The npm workflow validated package metadata, dependencies, lint, frontend build and publish contents; its actual npm publish job was skipped.

The Docker image PR workflow was still running at the time of this checkpoint. No package was published. The overall A2A/MCP capability remains **NOT VERIFIED**: all evidence above is source, test, static-analysis, or CI evidence. It does not demonstrate external MCP client discovery/tool calls, a live authenticated A2A task exchange, or production availability. The protected production deployment remains skipped and the two draft PRs remain unmerged.


## JavaScript / TypeScript SDK implementation checkpoint — 2026-11-05

A server-side Node.js package now exists on branch `feat/javascript-typescript-sdk-interoperability` at `sdk/javascript`. It implements the existing language-neutral HTTPS/JSON task contract and reuses the canonical shared fixture set. The native SDK workflow now includes a Node.js job using the repository's pinned `.node-version` (24.12.0).

Exact target-runtime evidence: the JavaScript / TypeScript job passed 9/9 tests on Node.js 24.12.0 / Ubuntu 24.04 x86_64 at PR #663 head `23d43cd19e0333e57d813759f2efb9a199610c69` in [run #42016850741](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/42016850741). The capability is VERIFIED only for this named target; other runtimes/platforms and live Neural/provider behavior are not covered.

This does not change the status of live Neural origin configuration, provider inference, MCP/A2A external conformance, operating-system/architecture breadth, blockchain RPC reachability, or production deployment. No external credentials, production secrets, or deployments were changed; the CI workflow source was extended on this branch only. The exact Node.js 24.12.0 target is now verified by run #42016850741.


## Live production evidence checkpoint — 2026-11-05T15:00:25Z

Repository: `GLORIFIER7/GLORIFIER`; public Worker: `https://glorifier.glorifier.workers.dev`.

The GitHub Actions full-stack smoke run #42050507342 produced the following sequential read-only observations:

- `GET /api/health`: HTTP 200 in 166 ms. This proves Worker/assets health only.
- `GET /api/identity`: HTTP 503 with the explicit `not-ready` contract. The canonical domain and primary organization email are not configured; no domain identity is claimed.
- `GET /api/reports/summary`: HTTP 502 after 5,068 ms with `NEON_REPORTS_QUERY_FAILED`. Cloudflare's retained issue occurrence contains a `hyperdrive_connect` span of approximately 5,008 ms.
- `GET /api/runtime-verification`, immediately afterward: HTTP 200 in 816 ms; the response reports a successful Neon Hyperdrive exact-count query in 701 ms and 30 registered connection rows. Neural origin is not configured; authentication and AI execution were not probed.

The Neon control-plane inspection showed that main compute uses `suspend_timeout_seconds: 0`. The failed report request's timestamp coincided with the compute wake-up timestamp; once awake, the existing `glorifier_worker_ro` role could read the aggregate-only operational-count view. The six observed counts were: connection approvals 9; connection events 251,212; connection registry 30; intelligence analyses 266; intelligence evidence 1,099; intelligence reports 133. These are operational counts, not revenue or independently verified business outcomes.

### Remediation under review

[PR #669](https://github.com/GLORIFIER7/GLORIFIER/pull/669) proposes a bounded 15-second Hyperdrive connection timeout, preserves the existing 5-second per-statement SQL timeout, and gives only the reports smoke probe a 35-second deadline (connect + up to three read-only statements + transport margin); all unrelated smoke probes retain 10 seconds. The branch includes regression tests for the connection budget and route-specific smoke deadline. Its current final-head CI is being rerun after this refinement. Production deployment remains skipped. Until the PR passes final-head CI, is merged through the repository's required review process, deployed, and a new live smoke passes, the operational report capability remains **DEGRADED**.

### Remaining universal-interoperability gates

- The eleven first-party SDKs have bounded language-specific CI evidence; this does not establish all operating systems, architectures, runtime versions, or live Neural connectivity.
- A2A and MCP remain **NOT VERIFIED** for external interoperability. Official conformance/TCK results and authorized external-client tests are still required.
- `GLORIFIER_NEURAL_ORIGIN` is not configured; live Neural readiness and end-to-end task execution remain unavailable.
- Authentication and AI-provider execution were not included in the public infrastructure probe.
- The canonical OpenAPI document covers the Neural adapter only; a complete versioned API/protocol schema inventory and drift gate remain outstanding.

No production deployment, database setting change, privilege change, credential change, wallet signing, or financial action was performed in this checkpoint.
