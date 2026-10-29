# MCP upstream reference conformance plan

**Status:** reference mapping only; no live MCP connection or protocol-conformance result is claimed.  
**Repository:** `GLORIFIER7/GLORIFIER`  
**Reviewed:** 2026-10-29

## Purpose

Use the official `modelcontextprotocol/servers` repository as an upstream reference for scoped, repeatable tests of GLORIFIER's MCP boundaries. The upstream maintainers describe these projects as educational/reference implementations, not production-ready integrations. GLORIFIER must apply its own authorization, input/output validation, timeout, rate-limit, origin, secret-redaction, and audit controls.

## Reference-to-test mapping

| Upstream reference | Intended GLORIFIER use | Local acceptance evidence | Limits |
|---|---|---|---|
| [Everything](https://github.com/modelcontextprotocol/servers/tree/main/src/everything) | Build or select protocol fixtures covering tools, resources, prompts, and error handling. | Pinned protocol revision; deterministic contract tests for discovery/listing and malformed or unsupported requests. | Not a production dependency; its current README documents Node.js 24+ and multiple protocol eras. Do not assume compatibility with GLORIFIER's runtime without checking `.node-version`. |
| [Fetch](https://github.com/modelcontextprotocol/servers/tree/main/src/fetch) | Reference read-only tool schemas and bounded content extraction behavior. | Mocked fetch tests for timeout, oversized response, redirects, non-public IP rejection, and error preservation. | Never enable unrestricted URL fetching. Protect against SSRF and redirect/DNS edge cases; no live remote fetch is required for unit tests. |
| [Filesystem](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem) | Reference least-privilege file-access design. | Tests proving configured root boundaries and denial outside allowed roots, if/when a filesystem adapter exists. | Do not add filesystem write tools as part of this inspector task. |
| [Git](https://github.com/modelcontextprotocol/servers/tree/main/src/git) | Reference repository-scoped source inspection and tool semantics. | Mocked or sandboxed tests for allowed repositories, input bounds, and read/write authority separation. | No Git mutation or credential handling should be introduced by this read-only inspector change. |

## Conformance gates

1. Record the exact upstream commit or package version before implementing a protocol test; a moving `main` URL is a discovery reference, not a pinned test dependency.
2. Keep MCP protocol conformance distinct from provider API compatibility, A2A behavior, and live service readiness.
3. Test success, invalid schema, unsupported method, unauthorized access, timeout, oversized input/output, cancellation where supported, and redacted error reporting.
4. Treat upstream tool descriptions, schemas, fetched content, and tool results as untrusted data; they never override GLORIFIER policy.
5. Mark a capability `VERIFIED` only when the evidence links to the exact code/test/CI run and the tested boundary. Documentation inspection alone is at most `PARTIALLY VERIFIED`.
6. Do not install or invoke upstream servers automatically, add runtime dependencies, call external endpoints, access secrets, merge, or deploy as part of this phase.

## Next implementation slice

Extend the existing registry validator and CI with deterministic metadata-policy tests first. Then implement a small, read-only MCP conformance fixture in a separately reviewed change after selecting the exact protocol revision and confirming the project's runtime/tooling constraints.
