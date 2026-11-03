# MCP endpoint implementation and conformance status

**Status:** a fixed-scope, read-only GitHub MCP Worker endpoint is implemented and covered by local contract tests. Broader MCP adapter conformance and external-client interoperability remain **NOT VERIFIED**.  
**Repository:** `GLORIFIER7/GLORIFIER`  
**Reviewed:** 2026-11-03  
**Production route:** `POST /mcp` on the `glorifier` Cloudflare Worker  
**Implementation:** `src/lib/github-mcp.ts`, mounted in `src/worker.ts`  
**Worker tests:** `src/worker.test.ts`; command: `npm run test:cloudflare-worker`  
**Target protocol revision:** `2026-07-28` (broader interoperability target; not an implementation or conformance claim for the current GitHub MCP endpoint).

## Implemented endpoint: fixed-scope GitHub MCP

The Worker contains a stateless, POST-only JSON-RPC endpoint for a narrowly scoped, read-only GitHub MCP server. The route is mounted before the static-asset fallback; it is not a static SPA response.

The endpoint exposes exactly four tools, all pinned to the public `GLORIFIER7/GLORIFIER` repository:

| Tool | Capability |
|---|---|
| `github_get_repository` | Read repository metadata |
| `github_list_open_pull_requests` | List pull requests with a bounded state and page-size input |
| `github_list_workflow_runs` | Read recent Actions workflow runs with a bounded page size |
| `github_read_file` | Read a bounded text file from a validated repository-relative path and Git ref |

The server does not expose GitHub write, merge, deployment, secret, or credential operations. Upstream requests use HTTPS `api.github.com` only, with the owner and repository fixed in code. The endpoint does not carry a GitHub credential.

### Transport and request controls

- Route: `POST /mcp`; non-POST methods return `405` with `Allow: POST`.
- Request content type: `application/json`; other media types return `415`.
- Request body is bounded at 65,536 bytes and must decode as valid UTF-8.
- Upstream GitHub responses are bounded at 1,000,000 bytes; requests use an eight-second timeout and manual redirect handling.
- A supplied `Origin` must match the request origin. Requests without an `Origin` header are accepted.
- Tool calls pass through the Cloudflare `MCP_RATE_LIMITER` binding. The checked-in Wrangler configuration specifies 10 calls per 60 seconds. A rate-limiter service error fails closed with `503`.
- JSON-RPC methods implemented include `initialize`, `ping`, `tools/list`, and `tools/call`. Notifications return `202`; unsupported methods return a JSON-RPC method-not-found error.
- The endpoint returns JSON responses. It does not implement a server-sent-events GET stream or session state; GET is intentionally rejected.

### Protocol-version qualification

The main-branch baseline remains the legacy `2025-03-26` initialization path. Draft PR [#629](https://github.com/GLORIFIER7/GLORIFIER/pull/629) adds a separate modern, stateless `2026-07-28` request path:
- `server/discover` returns supported protocol versions, the implemented tools capability, server identity metadata, public cache scope, and a one-hour TTL.
- Modern `tools/list` and `tools/call` require the `io.modelcontextprotocol/protocolVersion` request metadata and a matching `MCP-Protocol-Version` HTTP header.
- Modern method results include `resultType: complete` and `io.modelcontextprotocol/serverInfo` metadata.
- Unsupported or mismatched versions return the `-32022` protocol-version error with the supported version list.
- Legacy `initialize`, `ping`, `tools/list`, and `tools/call` remain available for the 2025 protocol versions. The modern stateless path does not require the legacy initialize handshake.

The modern endpoint remains intentionally limited to the fixed four read-only GitHub tools for the public `GLORIFIER7/GLORIFIER` repository. It does not advertise resources or prompts, because those operations are not implemented. The source tests and CI checks exercise the modern and legacy request paths; they do not replace independent tests with external MCP clients or a production client/server handshake. Do not mark the broader MCP capability VERIFIED from local fixtures or CI alone.

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

The selected normative target is revision `2026-07-28`. In that revision, the `server/discover` operation reports supported protocol versions, its supported capabilities, and server identity. This target definition is separate from the older fixed-scope GitHub MCP route above.

The target reference is pinned. PR #629 implements the selected `server/discover` operation and the modern per-request version contract in the fixed-scope Worker endpoint. Resource/prompt operations are not implemented, and full transport/client conformance remains NOT VERIFIED until independent external client/server tests pass.

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
| Full conformance for MCP `2026-07-28` | **NOT VERIFIED** | Implement `server/discover`, version-specific normative tests, transport/capability validation, and independent client interoperability |
| Full conformance for the handler's later advertised version strings | **NOT VERIFIED** | Revision-specific tests; an initialization response alone is insufficient |
| A2A 1.0.1 interoperability | **NOT VERIFIED** | Standard Agent Card, message/task binding, authorization, and controlled two-agent test |
| Authenticated access to private repositories | **NOT IMPLEMENTED** | Separate reviewed authorization design; do not infer private-repository access from this public read-only server |
| Neural, AI-provider, and A2A runtime readiness | **OUT OF SCOPE / NOT VERIFIED HERE** | Separate configured origins, credentials, and live integration probes |

## Security and change policy

Treat repository content and GitHub API responses as untrusted data. Keep the repository allowlist, HTTPS origin restriction, request/response limits, timeout, origin validation, rate limiting, and read-only tool surface in place. Do not add filesystem access, arbitrary URL fetches, Git mutations, private-repository access, credential handling, or write tools to this endpoint without a separately reviewed security design and explicit owner approval.

Do not mark the overall GLORIFIER system fully verified based on this endpoint's unit tests or deployment metadata. Record each boundary separately and retain **NOT OBSERVABLE** where a live probe could not be completed.


## Implementation update — 2026-11-03

Draft PR [#629](https://github.com/GLORIFIER7/GLORIFIER/pull/629) adds the following source-level protocol behavior on branch `fix/issue-471-a2a-mcp-discovery`:
- MCP 2026-07-28 stateless discovery at `POST /mcp` using `server/discover`.
- Matching per-request protocol-version metadata and HTTP `MCP-Protocol-Version` header validation.
- Modern `tools/list` and `tools/call` result envelopes with `resultType: complete` and server identity metadata.
- A supported-version error for unknown or mismatched versions.
- Backward compatibility for the existing 2025 initialize/tool-call flow.
- The standard A2A Agent Card at `GET /.well-known/agent-card.json`, served natively by the Worker with GET/HEAD-only semantics.
- The A2A HTTP binding, Worker proxy, and Express backend parser/route guard accept the A2A 1.0.1 preferred `application/a2a+json` content type and retain `application/json` compatibility. The Worker forwards the validated content type unchanged; the backend parser is configured for both media types and its HTTP integration test exercises `application/a2a+json`.

The GitHub MCP tools remain limited to four read-only operations on one public repository, with the existing origin check, request-size and response-size bounds, timeout, and per-IP tool-call rate limit. The Agent Card does not declare a JWT token format because that exact token format has not been independently established.

The A2A JSON-RPC `/api/a2a/v1` endpoint still uses the existing Bearer-authenticated proxy to the configured backend. No external A2A client/server integration, authenticated production A2A task exchange, modern MCP external-client handshake, or full MCP target-revision conformance result is claimed. The overall `protocol.a2a-mcp-adapters` capability therefore remains **NOT VERIFIED**.
