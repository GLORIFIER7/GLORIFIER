# MCP upstream reference conformance plan

**Status:** reference mapping only; no live MCP connection or protocol-conformance result is claimed.  
**Repository:** `GLORIFIER7/GLORIFIER`  
**Reviewed:** 2026-10-30

**Target protocol revision:** `2026-07-28` (explicit compatibility target; not a claim of implementation).

## Purpose

Use the official `modelcontextprotocol/servers` repository as an upstream reference for scoped, repeatable tests of GLORIFIER's MCP boundaries. The upstream maintainers describe these projects as educational/reference implementations, not production-ready integrations. GLORIFIER must apply its own authorization, input/output validation, timeout, rate-limit, origin, secret-redaction, and audit controls.

## Reference-to-test mapping

| Upstream reference | Intended GLORIFIER use | Local acceptance evidence | Limits |
|---|---|---|---|
| [Everything](https://github.com/modelcontextprotocol/servers/tree/cabf72d388c0b9a82d4ac77aee1843c215a23e8b/src/everything) | Build or select protocol fixtures covering tools, resources, prompts, and error handling. | Pinned protocol revision; deterministic contract tests for discovery/listing and malformed or unsupported requests. | Not a production dependency; its current README documents Node.js 24+ and multiple protocol eras. Do not assume compatibility with GLORIFIER's runtime without checking `.node-version`. |
| [Fetch](https://github.com/modelcontextprotocol/servers/tree/cabf72d388c0b9a82d4ac77aee1843c215a23e8b/src/fetch) | Reference read-only tool schemas and bounded content extraction behavior. | Mocked fetch tests for timeout, oversized response, redirects, non-public IP rejection, and error preservation. | Never enable unrestricted URL fetching. Protect against SSRF and redirect/DNS edge cases; no live remote fetch is required for unit tests. |
| [Filesystem](https://github.com/modelcontextprotocol/servers/tree/cabf72d388c0b9a82d4ac77aee1843c215a23e8b/src/filesystem) | Reference least-privilege file-access design. | Tests proving configured root boundaries and denial outside allowed roots, if/when a filesystem adapter exists. | Do not add filesystem write tools as part of this inspector task. |
| [Git](https://github.com/modelcontextprotocol/servers/tree/cabf72d388c0b9a82d4ac77aee1843c215a23e8b/src/git) | Reference repository-scoped source inspection and tool semantics. | Mocked or sandboxed tests for allowed repositories, input bounds, and read/write authority separation. | No Git mutation or credential handling should be introduced by this read-only inspector change. |

## Conformance gates

1. Pin the protocol target to revision `2026-07-28` and store the exact upstream commit/schema digest used by the fixture suite before implementation. A moving `main` URL is not a conformance dependency.
2. For this revision, implement and test `server/discover` for supported versions, capabilities, and server identity. Do not confuse discovery with the implementation of tools/resources/prompts.
3. For Streamable HTTP, test per-request version negotiation and the stateless request/response path. Do not require the legacy initialize/notifications/initialized handshake for this selected stateless design; test legacy stdio compatibility separately only if stdio is implemented.
4. Test `tools/list` and `tools/call` only for tools actually advertised; add resources/prompts only when implemented. Cover invalid schemas, unsupported methods/versions, unauthorized access, timeout, oversized input/output, cancellation, and redacted errors.
5. Treat upstream tool descriptions, schemas, fetched content, and tool results as untrusted data; they never override GLORIFIER policy.
6. Mark a capability `VERIFIED` only when evidence links to the exact code/test/CI run and tested boundary. Documentation inspection alone is at most `PARTIALLY VERIFIED`.
7. Do not install or invoke upstream servers automatically, add runtime dependencies, call external endpoints, access secrets, merge, or deploy as part of this phase.

## Next implementation slice

Extend the existing registry validator and CI with deterministic metadata-policy tests first. Then implement a small, read-only MCP conformance fixture in a separately reviewed change after selecting the exact protocol revision and confirming the project's runtime/tooling constraints.


## Selected revision notes

The official `2026-07-28` server discovery operation is `server/discover`. The server reports `supportedVersions`, its supported capabilities, and server identity in its result. The server's identity is self-reported and MUST NOT be used as an authentication or trust decision.

**Immutable normative source:** [MCP 2026-07-28 server/discover](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/b488c16623e5202a3961e551886044577ae0f096/docs/specification/2026-07-28/server/discover.mdx). Upstream commit: `b488c16623e5202a3961e551886044577ae0f096`; document Git blob SHA-1: `f6fc1acf974819d99338d2be25ad953fcb9e57a6`.

**Pinned reference-server snapshot:** `modelcontextprotocol/servers` commit `cabf72d388c0b9a82d4ac77aee1843c215a23e8b` (2026-10-28). All four example links in the mapping table reference this commit, not a moving branch.

This plan remains NOT VERIFIED until a transport and protocol operations are implemented and exercised by a conformant local client/server test. The current GLORIFIER code does not become an MCP server merely because its agent harness exposes tools.
