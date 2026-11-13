# MCP endpoint implementation and conformance status

**Status:** a fixed-scope, read-only GitHub MCP Worker endpoint implements a modern stateless `2026-07-28` request path plus legacy `2025` compatibility. Local Worker contract tests cover the declared surface. Full MCP conformance and external-client interoperability remain **NOT VERIFIED**.  
**Repository:** `GLORIFIER7/GLORIFIER`  
**Reviewed:** 2026-11-05  
**Production route:** `POST /mcp` on the `glorifier` Cloudflare Worker  
**Implementation:** `src/lib/github-mcp.ts`, mounted in `src/worker.ts`  
**Worker tests:** `src/worker.test.ts`; command: `npm run test:cloudflare-worker`  
**Target protocol revision:** `2026-07-28` (modern stateless subset; full conformance is not claimed); **legacy compatibility:** `2025-11-25`, `2025-06-18`, and `2025-03-26`.

## Implemented endpoint: fixed-scope GitHub MCP

The Worker contains a stateless, POST-only JSON-RPC endpoint for a narrowly scoped, read-only GitHub MCP server. The route is mounted before the static-asset fallback; it is not a static SPA response.

The endpoint exposes exactly four tools, all pinned to the public `GLORIFIER7/GLORIFIER` repository:

| Tool | Capability |
|---|---|
| `github_get_repository` | Read repository metadata |
| `github_list_open_pull_requests` | List pull requests with a bounded state and page-size input |
| `github_list_workflow_runs` | Read recent Actions workflow runs with a bounded page size |
| `github_read_file` | Read a bounded text file from a validated repository-relative path and Git ref |

The server does not expose GitHub write, merge, deployment, secret, or credential operations. Upstream requests use HTTPS `api.github.com` only, with the owner and repository fixed in code. The endpoint uses anonymous public API access by default. It also supports an optional `GITHUB_MCP_READ_TOKEN` Cloudflare Worker secret for authenticated read-only GitHub API requests; the token is never sent to MCP clients or included in responses.

### Transport and request controls

- Route: `POST /mcp`; non-POST methods return `405` with `Allow: POST`.
- Request content type: `application/json`; other media types return `415`.
- Request body is bounded at 65,536 bytes and must decode as valid UTF-8.
- Upstream GitHub responses are bounded at 1,000,000 bytes; requests use an eight-second timeout and manual redirect handling.
- A supplied `Origin` must match the request origin. Requests without an `Origin` header are accepted.
- Tool calls pass through the Cloudflare `MCP_RATE_LIMITER` binding. The checked-in Wrangler configuration specifies 10 calls per 60 seconds. A rate-limiter service error fails closed with `503`.
- Legacy JSON-RPC methods include `initialize`, `ping`, `tools/list`, and `tools/call`. Modern methods include `server/discover`, `tools/list`, and `tools/call`. Modern unknown methods return HTTP `404` with JSON-RPC `-32601`; version/header failures return HTTP `400` with protocol-specific errors. Notifications return `202`.
- The endpoint returns JSON responses. It does not implement a server-sent-events GET stream or session state; GET is intentionally rejected.

### Protocol-version qualification

The main-branch endpoint includes the modern, stateless `2026-07-28` request path introduced by merged PR [#629](https://github.com/GLORIFIER7/GLORIFIER/pull/629). This PR (#661) hardens it against requirements missed by the initial local tests:
- `server/discover` returns supported protocol versions, the implemented tools capability, server identity metadata, public cache scope, and a one-hour TTL.
- Every modern request requires `io.modelcontextprotocol/protocolVersion` and an object-valued `io.modelcontextprotocol/clientCapabilities` in `_meta`, plus a matching `MCP-Protocol-Version` HTTP header.
- Modern requests require the `Mcp-Method` header to match the JSON-RPC method; `tools/call`, `resources/read`, and `prompts/get` also require matching `Mcp-Name` values. Base64 sentinel names are decoded before comparison.
- Modern method results include `resultType: complete` and `io.modelcontextprotocol/serverInfo` metadata.
- Unsupported versions return HTTP `400` with `-32022` and the supported versions for that protocol era; protocol/header mismatches return HTTP `400` with `-32020`; missing required client capabilities return HTTP `400` with `-32602`.
- Legacy `initialize`, `ping`, `tools/list`, and `tools/call` remain available for the 2025 protocol versions. The modern stateless path does not require the legacy initialize handshake.

The modern endpoint remains intentionally limited to the fixed four read-only GitHub tools for the public `GLORIFIER7/GLORIFIER` repository. It does not advertise resources or prompts, because those operations are not implemented. It returns JSON responses but does not implement per-request SSE streams, subscriptions/listen, or stream cancellation. Local source tests and CI do not replace independent external MCP client/server tests or the official conformance suite. Do not mark the broader MCP capability VERIFIED from local fixtures or CI alone.

## Relationship to the broader A2A/MCP capability

The repository capability `protocol.a2a-mcp-adapters` covers general standards-backed A2A and MCP adapters, not only this repository-specific GitHub bridge. It therefore remains **NOT VERIFIED**.

The fixed-scope GitHub MCP route and new A2A discovery surface do not establish:

- a general-purpose MCP adapter for arbitrary configured providers or repositories;
- MCP resources or prompts; only the four read-only GitHub tools are advertised;
- a live, authenticated A2A 1.0.1 message/task backend; `/api/a2a/v1` remains an authenticated proxy to the owner-configured backend;
- external-client interoperability with Claude, ChatGPT, or another MCP client;
- authenticated private-repository access.

## Evidence currently available

### Local test coverage in the repository

`src/worker.test.ts` exercises the Worker-mounted `/mcp` route, including:

- initialization with `2025-03-26`, initialization notification, and tool discovery;
- the exact four-tool read-only surface and read-only/destructive annotations;
- mocked repository metadata reads and tool-call behavior;
- unsupported methods and GET rejection;
- content-type, malformed JSON, invalid content-length, invalid UTF-8, and oversized request handling;
- bounded upstream response handling and invalid upstream payloads;
- rejection of an untrusted `Origin`;
- rate-limit denial and rate-limiter failure behavior.

The tests use controlled upstream responses. They do **not** prove that an external MCP client can reach the public production route or that a live GitHub operation succeeds from every client/network.

### GitHub and Cloudflare deployment evidence

- PR [#595](https://github.com/GLORIFIER7/GLORIFIER/pull/595), which introduced the route, was merged on 2026-11-01. Its PR-head commit was [`b09a38510936e628aba1a8de44fcb6c67985bf12`](https://github.com/GLORIFIER7/GLORIFIER/commit/b09a38510936e628aba1a8de44fcb6c67985bf12); merge commit: [`7181aa094610b05457deb5c9608beef5403754f7`](https://github.com/GLORIFIER7/GLORIFIER/commit/7181aa094610b05457deb5c9608beef5403754f7).
- Immutable PR-head GitHub Actions evidence: [Cloudflare Worker validation/build, run 1726](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41309745932), [Build and Test, run 947](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41309745855), [repository CI, run 4213](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41309745872), [CodeQL, run 3457](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41309745885), [npm security, run 4187](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41309746002), and [Linux interoperability validation, run 865](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41309745853). These are PR-head checks, not universal provider or platform certification.
- Combined external statuses on that PR head: Snyk, DeepScan, and CircleCI passed. DeepSource Docker, Secrets, Shell, and SQL passed; **DeepSource JavaScript failed** and is not represented as a passing result.
- Cloudflare production deployment record: [deployment `3491c215-6105-464d-a94b-9019f14b648d`](https://api.cloudflare.com/client/v4/accounts/8d18ea5dc25319e78fc2124cafff56b0/workers/scripts/glorifier/deployments/3491c215-6105-464d-a94b-9019f14b648d), created at `2026-11-01T13:21:14.927806Z`. It assigns 100% of traffic to version [`4b77f5d8-d82b-4204-abba-f3923d728204`](https://api.cloudflare.com/client/v4/accounts/8d18ea5dc25319e78fc2124cafff56b0/workers/scripts/glorifier/versions/4b77f5d8-d82b-4204-abba-f3923d728204) (version number 871).
- The deployed Worker settings expose a `MCP_RATE_LIMITER` binding. Binding metadata was inspected; secret values were not read.
- The Workers.dev subdomain is enabled. Cloudflare returned no custom Worker domains for this service.

A deployment record proves that Cloudflare has a deployment assigned 100% of traffic. It does not prove that a public HTTP request, a particular MCP client, or an upstream GitHub operation succeeds.

## Broader protocol conformance target: MCP 2026-07-28

The selected normative target is revision `2026-07-28`. In that revision, `server/discover` reports modern supported protocol versions, its supported capabilities, and server identity; every modern request carries protocol version and client capabilities; and Streamable HTTP requires request-routing headers. The fixed-scope GitHub MCP route implements only a subset of this surface.

The target reference is pinned. Merged PR #629 added modern discovery and the initial version contract; PR #661 adds mandatory client-capability and routing-header validation plus correct HTTP error statuses. Resource/prompt operations, SSE, subscriptions, and full transport/client conformance remain NOT VERIFIED until independent external client/server tests pass.

**Immutable normative source:** [MCP 2026-07-28 server/discover](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/b488c16623e5202a3961e551886044577ae0f096/docs/specification/2026-07-28/server/discover.mdx). Upstream commit: `b488c16623e5202a3961e551886044577ae0f096`; document Git blob SHA-1: `f6fc1acf974819d99338d2be25ad953fcb9e57a6`.

**Pinned reference-server snapshot:** [`modelcontextprotocol/servers` at commit `cabf72d388c0b9a82d4ac77aee1843c215a23e8b`](https://github.com/modelcontextprotocol/servers/tree/cabf72d388c0b9a82d4ac77aee1843c215a23e8b/) (2026-10-28). The examples are reference material only; they are not runtime dependencies.

## Remaining verification gates

| Gate | Current status | Evidence needed |
|---|---|---|
| Fixed GitHub MCP route and read-only tool contract | **VERIFIED LOCALLY** | Existing Worker route tests and exact source |
| GitHub-side read-only scope | **VERIFIED BY CODE REVIEW** | Fixed repository/API origin and no write tool definitions |
| Cloudflare production deployment metadata | **VERIFIED** | Deployment/version record and 100% traffic assignment |
| Public `/mcp` live HTTP response | **NOT OBSERVABLE** | External GET/POST probe from a network able to resolve and reach the Workers.dev host |
| Claude/ChatGPT/other external MCP client connection | **NOT VERIFIED** | Real client handshake, discovery, tool-list, and tool-call evidence per client |
| Full conformance for MCP `2026-07-28` | **NOT VERIFIED** | Official conformance-suite report plus independent external-client discovery, list, and call; complete all required transport behavior for claimed features |
| Full conformance for the handler's later advertised version strings | **NOT VERIFIED** | Revision-specific tests; an initialization response alone is insufficient |
| A2A 1.0.1 interoperability | **NOT VERIFIED** | Standard Agent Card, message/task binding, authorization, and controlled two-agent test |
| Authenticated access to private repositories | **NOT IMPLEMENTED** | Separate reviewed authorization design; do not infer private-repository access from this public read-only server |
| Neural, AI-provider, and A2A runtime readiness | **OUT OF SCOPE / NOT VERIFIED HERE** | Separate configured origins, credentials, and live integration probes |

## Optional GitHub API egress credential

The Worker can use `GITHUB_MCP_READ_TOKEN` as an optional server-side secret when anonymous GitHub API requests from the Worker egress are rejected. This setting is **not configured by this source change** and remains disabled when the secret is absent. The credential is sent only to the fixed HTTPS `api.github.com` origin for the four existing public-repository read tools; it is not forwarded to callers, returned in tool output, or used for write operations.

When configured, use a fine-grained GitHub token restricted to the single `GLORIFIER7/GLORIFIER` repository and grant only:
- Metadata: read-only
- Contents: read-only
- Pull requests: read-only
- Actions: read-only

Do not use a classic broad-scope token or a token with write permissions. Store it only as the Cloudflare Worker secret named `GITHUB_MCP_READ_TOKEN`; never commit the value or place it in frontend configuration. Rotate it through the owner's normal credential process. A configured token must still be validated by a live production read-only tool call; adding the secret binding is not itself proof that the 403 is resolved.
## Security and change policy

Treat repository content and GitHub API responses as untrusted data. Keep the repository allowlist, HTTPS origin restriction, request/response limits, timeout, origin validation, rate limiting, and read-only tool surface in place. Do not add filesystem access, arbitrary URL fetches, Git mutations, private-repository access, credential handling, or write tools to this endpoint without a separately reviewed security design and explicit owner approval.

Do not mark the overall GLORIFIER system fully verified based on this endpoint's unit tests or deployment metadata. Record each boundary separately and retain **NOT OBSERVABLE** where a live probe could not be completed.


## Implementation update — 2026-11-05

Merged PR [#629](https://github.com/GLORIFIER7/GLORIFIER/pull/629) added the initial modern path. PR [#661](https://github.com/GLORIFIER7/GLORIFIER/pull/661) adds source-level conformance corrections for:
- MCP 2026-07-28 stateless discovery at `POST /mcp` using `server/discover`.
- Required per-request protocol-version and client-capability metadata, matching HTTP `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` header/body validation.
- Modern `tools/list` and `tools/call` result envelopes with `resultType: complete` and server identity metadata.
- HTTP `400` with `-32022` for unsupported versions, HTTP `400` with `-32020` for header mismatches, HTTP `400` with `-32602` for missing required client capabilities, and HTTP `404` with `-32601` for unknown modern methods.
- Backward compatibility for the existing 2025 initialize/tool-call flow.
- The standard A2A Agent Card at `GET /.well-known/agent-card.json`, served natively by the Worker with GET/HEAD-only semantics.
- The A2A HTTP binding, Worker proxy, and Express backend parser/route guard accept the A2A 1.0.1 preferred `application/a2a+json` content type and retain `application/json` compatibility. The Worker forwards the validated content type unchanged; the backend parser is configured for both media types and its HTTP integration test exercises `application/a2a+json`.

The GitHub MCP tools remain limited to four read-only operations on one public repository, with origin validation, request-size and response-size bounds, timeout, and per-IP tool-call rate limit. PR #661's evidence remains branch CI until merged; no production rollout is implied. The Agent Card does not declare a JWT token format because that exact token format has not been independently established.

The A2A JSON-RPC `/api/a2a/v1` endpoint still uses the existing Bearer-authenticated proxy to the configured backend. No external A2A client/server integration, authenticated production A2A task exchange, modern MCP external-client handshake, or full MCP target-revision conformance result is claimed. The overall `protocol.a2a-mcp-adapters` capability therefore remains **NOT VERIFIED**.


## Production release checkpoint — 2026-11-11

The guarded production workflow [#42969134766](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/42969134766) deployed GLORIFIER main commit `038fe738e9fdc5fbbb0472343198c19d75cd7643` as Cloudflare Worker v1002 at 100% traffic. The deployment's GET-only smoke verified Worker health, the business-model endpoint, unauthenticated app-state denial, runtime verification, reports summary, Worker-to-NEURAL liveness, and public read models. NEURAL readiness remained intentionally unavailable with external egress disabled.

**This deployment does not establish MCP protocol conformance.** The workflow explicitly did not probe `POST /mcp`, because protocol transport requires POST and the production smoke is GET-only. No external MCP client handshake, discovery, `tools/list`, or `tools/call` was performed. The capability `protocol.a2a-mcp-adapters` remains **NOT VERIFIED** until the official MCP 2026-07-28 frozen-revision conformance suite and an independent external-client test pass against an authorized endpoint. A2A 1.0.1 external TCK and controlled two-agent tests remain separately required.

## Opt-in external MCP verification automation — 2026-11-11

The repository includes `.github/workflows/external-mcp-conformance.yml`, a **manual-only** GitHub Actions workflow. Its `workflow_dispatch` input defaults to `false`; the external checks run only when an authorized operator explicitly dispatches the workflow with `run_external_mcp_checks=true`.

The workflow defaults to GLORIFIER's existing public Pages ingress, so repository Actions variables are optional. To make the configuration explicit, set these non-secret repository Actions variables:

- `GLORIFIER_MCP_CONFORMANCE_URL`: `https://glorifier.pages.dev/mcp`.
- `GLORIFIER_MCP_CONFORMANCE_ALLOWED_HOSTS`: `glorifier.pages.dev`.

Do **not** use `https://glorifier.glorifier.workers.dev/mcp` for the public conformance target. That direct Worker hostname is protected by a Cloudflare Access policy restricted to GLORIFIER account members. The Pages hostname has a separate public-access policy and forwards `/mcp` through the private `GLORIFIER_WORKER` service binding. The public Pages Function route manifest includes `/mcp`, and the proxy preserves the incoming MCP request when it forwards to the Worker. The direct Worker Access policy remains enabled; this repair does not weaken it.

The target validator rejects non-HTTPS URLs, URL credentials, non-default ports, paths other than exactly `/mcp`, query strings, fragments, IP literals, reserved/local hostnames, and hosts absent from the explicit allowlist. It does not add or change Worker routes, secrets, bindings, egress policy, or deployment settings.

### Revision-pinned conformance checks

1. The workflow checks out the official `modelcontextprotocol/conformance` runner at immutable commit `96a6f9478b7f2e125cf0360a213383cf57533893`. That pinned snapshot contains the frozen requirement set for MCP revision `2026-07-28`.
2. It runs the official **server-side required scenarios** for the frozen `2026-07-28` revision using `server --requirements 2026-07-28`. This is the scored server requirement set for that specification revision, not merely a single tools-list smoke. The runner executes server scenarios sequentially, records scenario/check outcomes, and returns a failing exit code when any scored requirement fails. The 30-minute job ceiling accommodates the complete sequential suite while keeping the run bounded.
3. It separately runs the official legacy `tools-list` server scenario at `2025-11-25`, exercising the supported initialize/list compatibility path.
4. It then runs a separate scoped `2026-07-28` stateless smoke: `server/discover`, two `tools/list` calls to check deterministic order, and one `tools/call` for the fixed read-only `github_get_repository` tool. This smoke is four bounded POST requests, with a 15-second per-request timeout, redirects disabled, and no caller-supplied arbitrary tool name.
5. Conformance reports and smoke evidence are retained as workflow artifacts for 14 days.

The complete official server requirement set intentionally tests protocol surfaces beyond the current four-tool GitHub bridge, including resources, prompts, content variants, and streaming-related requirements. Those failures are findings, not reasons to widen the endpoint's scope or weaken the test. The TCK server leg does not test independent MCP clients. **Full MCP 2026-07-28 conformance and independent external-client interoperability remain NOT VERIFIED** until the scored server requirements pass and separate independent-client tests have their own evidence. The workflow still does not run A2A tests, provider inference, paid operations, or write operations.

The PR and push CI paths run only the local validator/smoke regression tests; they do not contact an external endpoint. No production POST, inference, paid provider request, secret use, deployment, or configuration mutation is triggered by normal CI.


## Public MCP ingress correction — 2026-11-13

The public conformance entry point is **`https://glorifier.pages.dev/mcp`**, with exact allowed hostname **`glorifier.pages.dev`**. This corrects the previous target assumption that the protected `workers.dev` hostname was externally reachable.

Cloudflare account configuration observed on 2026-11-13:
- Pages project `glorifier` has the production `GLORIFIER_WORKER` service binding to Worker `glorifier`.
- The Pages public frontend Access application has a `bypass` policy for everyone.
- The direct Worker Access application has an `allow` policy restricted to Cloudflare account members.
- The latest production Pages deployment observed at `2026-11-13T16:25:18Z` completed successfully for main commit `33291355bfbd6ed32cca176ab4d7773c84de4d56`.
- The Pages route manifest includes `/mcp`; the Pages Function forwards this exact path to the Worker service binding without rewriting the request.

The external conformance workflow now falls back to the canonical Pages URL and hostname when repository variables are absent. The target validator explicitly rejects the account-protected direct Worker hostname even when it is accidentally added to the allowlist. The regression suite now checks this rejection and verifies that a public Pages `POST /mcp` request preserves its MCP method, body, origin, and protocol headers through the service-binding proxy.

**Verification boundary:** Cloudflare control-plane configuration and the latest Pages deployment were inspected. A live external `POST /mcp` request and the official MCP TCK have not yet been run from this environment. Therefore public transport success and MCP conformance remain **NOT VERIFIED** until the workflow is dispatched and its reports are inspected. The configured public target fixes the known Access-host mismatch; it does not upgrade the protocol capability status by itself.
