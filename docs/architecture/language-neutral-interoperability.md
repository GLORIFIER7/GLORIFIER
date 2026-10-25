# Language-neutral interoperability contract

## Purpose

GLORIFIER must not make TypeScript the required language for every integration. TypeScript is one implementation in the control plane, not the interoperability boundary. Any language or runtime that can implement the published protocol and security requirements may participate.

This is a target contract and implementation plan. It does not claim that SDKs, bindings, runtimes, Linux distributions, or blockchain adapters already exist or have passed conformance tests.

## Stable boundary: protocols, not shared language objects

Use versioned, language-neutral wire contracts:

- HTTPS with JSON request/response bodies for the baseline public API.
- OpenAPI as the canonical HTTP API description, with generated client bindings where tooling supports them.
- JSON Schema for payload validation and cross-language contract tests.
- Protocol Buffers/gRPC only for internal or explicitly negotiated service-to-service interfaces where operational support justifies it; do not require gRPC for public clients.
- Server-Sent Events or WebSockets only for explicitly documented streaming needs, with reconnect and authorization semantics defined.
- MCP and A2A only at explicit, reviewed adapters; neither replaces GLORIFIER identity, policy, authorization, evidence, or human approval.

Do not expose TypeScript interfaces as the only specification. Do not assume that two languages share memory, object layouts, exceptions, integer widths, or serialization behavior.

## Supported integration shapes

A client may be implemented in any language that can perform HTTPS, encode/decode UTF-8 JSON, validate required fields, and enforce the documented authentication behavior. Initial SDK candidates may include Python, JavaScript/TypeScript, Go, Java/Kotlin, C#, Rust, PHP, Ruby, and Swift. These are candidate targets, not a claim that maintained SDKs currently exist.

For systems that cannot use a native SDK, provide a documented HTTP API, OpenAPI document, examples using curl, and a minimal protocol conformance suite. Linux support is a runtime/platform matrix, not a promise that every distribution and CPU architecture has already been tested.

## Contract requirements

Every versioned endpoint must specify:

1. Method, path, versioning and deprecation policy.
2. Authentication, authorization scopes, caller identity and error behavior.
3. Request/response JSON schemas, required versus optional fields, enum evolution, and maximum body size.
4. Timeouts, retry eligibility, rate limits, idempotency behavior for mutating operations, and correlation/trace identifiers.
5. Stable machine-readable error codes; do not rely on language-specific exception names or parsing human-readable text.
6. UTC timestamps in RFC 3339 format; explicit units and decimal/string rules for monetary values and blockchain quantities.
7. Pagination, ordering, null/missing-field semantics, and forward/backward compatibility rules.
8. Redaction requirements: credentials, bearer tokens, private keys, seed phrases, sensitive task bodies and personal data must not appear in logs or error messages.

For arbitrary-precision values such as blockchain quantities, token amounts, nonces or large integer identifiers, use canonical decimal strings or documented hex strings on the wire. Do not serialize them as JSON floating-point numbers. Represent binary data as base64url or a content-addressed reference with explicit size and integrity rules.

## Architecture

```text
Language-specific clients and agents
(Python, Go, Java/Kotlin, C#, Rust, PHP, Ruby, Swift, JS/TS, shell, ...)
                    |
      OpenAPI + JSON Schema contracts
                    |
      HTTPS versioned protocol boundary
                    |
       GLORIFIER governance control plane
       identity / policy / authorization
                    |
     explicit capability adapters and APIs
       /             |               \
 AI providers     Linux services    Blockchain RPCs
```

Adapters must be explicit and capability-scoped. A language-neutral API does not mean unrestricted access to the internet, shell, provider credentials, wallets, or arbitrary RPC endpoints.

## Security and governance invariants

- Default deny for unknown capabilities, methods, action classes, and chain operations.
- Validate configured origins and use HTTPS; require exact-host egress allowlists for the backend and Neural origins, fail closed when an allowlist is missing or mismatched, and use manual redirect handling so the Worker does not follow untrusted upstream redirects. Do not expose arbitrary URL proxying.
- Never forward a privileged global token to caller-controlled destinations.
- Read-only blockchain queries may be exposed through separately approved adapters. Signing, minting, transfers, contract writes, financial actions, and paid RPC usage remain disabled until specifically authorized.
- Human approval remains required for production changes and consequential or irreversible actions.
- Return evidence-backed status. A successful schema check or mocked test is not proof of live service availability, provider readiness, chain correctness, or full language support.

## Conformance and release gates

For each SDK or adapter:

- Run shared JSON fixtures against request/response encoders and decoders.
- Validate schemas and unknown-field behavior.
- Test authentication failures, authorization denial, timeouts, rate limits, malformed input, large integer handling, Unicode, retries, and idempotency.
- Verify that secrets and sensitive payloads are absent from logs.
- Run the common contract suite in CI and publish results by language, runtime version, OS, architecture, and protocol version.
- Use mocked upstreams by default. Live integration tests require a configured staging endpoint and must not trigger financial, blockchain-write, production-write, or destructive actions.

A language/runtime should be labelled `VERIFIED` only for the specific version/platform/test matrix that passed. Use `PARTIALLY VERIFIED` for incomplete matrices and `NOT VERIFIED` where evidence is absent. Do not label the ecosystem “all languages supported” based solely on the protocol design.

## Incremental delivery

1. Publish and review the canonical OpenAPI/JSON Schema contracts for currently implemented endpoints.
2. Add a shared fixture-driven contract test suite to CI.
3. Generate and test one non-TypeScript SDK first (Python is a practical initial candidate given the separate GLORIFIER-NEURAL FastAPI service).
4. Add Go and Java/Kotlin SDKs after the first SDK establishes code-generation, versioning, packaging and release conventions.
5. Add further SDKs based on actual use cases, maintaining the same conformance gates.
6. Publish a tested Linux/runtime matrix and separately verify each blockchain-family adapter (EVM-compatible networks and Solana are not interchangeable).

## Capability registry and Linux test scope

The machine-readable starting registry is [interoperability-capabilities.json](./interoperability-capabilities.json), governed by [its JSON Schema](./interoperability-capabilities.schema.json). Run `node scripts/validate-interoperability-capabilities.mjs` to check the status vocabulary, unique capability IDs, target environments, evidence references, timestamp syntax, and the rule that a `VERIFIED` claim must have timestamped test evidence. A live-runtime scope requires a live-probe record.

The [Interoperability Linux validation workflow](../../.github/workflows/interoperability-linux.yml) defines source checks on GitHub-hosted Ubuntu 22.04 and Ubuntu 24.04 x86_64 runners, plus builds of the repository's declared container images. The matrix is a bounded support claim only: it does not imply ARM64, Alpine, all Linux distributions, Windows, or macOS support. New target entries remain `NOT VERIFIED` until the workflow produces successful evidence.

The Neural task adapter accepts `application/json` and `application/*+json` and enforces a 1 MiB request-body cap before forwarding. Declared lengths and actual streamed bytes are checked; oversized task requests return `413 REQUEST_BODY_TOO_LARGE`, and unsupported media types return `415 UNSUPPORTED_MEDIA_TYPE`. The branch's regression tests must pass before this boundary is marked verified.

## Current evidence boundary

The repository contains a TypeScript Worker adapter and a small Python client with standard-library tests, but the presence of code is not proof of live interoperability. The registry separates mock contract tests, CI execution, container builds, and live runtime probes. No deployed Neural origin or production readiness is asserted. The reviewed contract documentation does not establish a published OpenAPI specification or passing A2A/MCP interoperability suite. Upgrade statuses only when linked evidence supports the exact claim and target environment.
