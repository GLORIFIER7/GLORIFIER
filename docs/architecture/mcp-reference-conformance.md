# MCP endpoint implementation and conformance status

**Status:** a fixed-scope, read-only GitHub MCP Worker endpoint is implemented and covered by local contract tests. Broader MCP adapter conformance and external-client interoperability remain **NOT VERIFIED**.  
**Repository:** `GLORIFIER7/GLORIFIER`  
**Reviewed:** 2026-11-01  
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

The implementation's baseline constant is `2025-03-26`. Its initialization handler currently returns the requested version when it is one of `2025-03-26`, `2025-06-18`, or `2025-11-25`, and otherwise falls back to `2025-03-26`.

The checked-in Worker test explicitly verifies initialization with `2025-03-26`. The later version strings are present in the handler, but that alone does not prove full conformance to those revisions. The current route does not implement the selected `2026-07-28` target's `server/discover` operation. Do not advertise full conformance to any later revision until revision-specific transport, header, capability, and error behavior has been tested against the corresponding normative specification.

## Relationship to the broader A2A/MCP capability

The repository capability `protocol.a2a-mcp-adapters` covers general standards-backed A2A and MCP adapters, not only this repository-specific GitHub bridge. It therefore remains **NOT VERIFIED**.

The fixed-scope GitHub MCP route does not establish:

- a general-purpose MCP adapter for arbitrary configured providers or repositories;
- the `2026-07-28` `server/discover` operation or its supported capabilities;
- resources or prompts;
- A2A 1.0.1 Agent Card discovery or message/task binding;
- authenticated private-repository access;
- external-client interoperability with Claude, ChatGPT, or another MCP client.

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

- PR [#595](https://github.com/GLORIFIER7/GLORIFIER/pull/595), which introduced the route, was merged on 2026-11-01.
- Its PR-head workflow checks included successful Worker validation/build, repository CI, CodeQL, npm security, dependency review, workflow syntax, and interoperability/SDK checks. The checks apply to the recorded PR head; they are not universal provider or platform certification.
- Cloudflare reports a production deployment for Worker `glorifier` created at `2026-11-01T13:21:14.927806Z`, with version `4b77f5d8-d82b-4204-abba-f3923d728204` (version number 871) receiving 100% of traffic.
- The deployed Worker settings expose a `MCP_RATE_LIMITER` binding. Binding metadata was inspected; secret values were not read.
- The Workers.dev subdomain is enabled. Cloudflare returned no custom Worker domains for this service.

A deployment record proves that Cloudflare has a deployment assigned 100% of traffic. It does not prove that a public HTTP request, a particular MCP client, or an upstream GitHub operation succeeds.

## Broader protocol conformance target: MCP 2026-07-28

The selected normative target is revision `2026-07-28`. In that revision, the `server/discover` operation reports supported protocol versions, its supported capabilities, and server identity. This target definition is separate from the older fixed-scope GitHub MCP route above.

The target reference is pinned; it is not a claim that GLORIFIER implements `server/discover`, resource/prompt operations, or all required transport semantics for that revision.

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
