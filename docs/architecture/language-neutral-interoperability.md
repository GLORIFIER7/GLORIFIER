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

## Go SDK initial implementation

The stacked branch for the initial Go implementation adds `sdk/go/neuralclient`, a dependency-free client for the existing versioned Worker OpenAPI routes:

- `POST /api/neural/v1/tasks` with the caller-scoped bearer token.
- `GET /api/neural/health` without forwarding the configured token.
- `GET /api/neural/ready`, preserving HTTP 503 as a not-ready observation.

The client rejects non-HTTPS destinations except explicitly enabled loopback HTTP, refuses redirects, bounds task and response sizes, uses a finite timeout, validates optional correlation IDs, normalizes API errors, and does not retry task submissions where the wire contract lacks an idempotency key. Tests use mocked HTTP servers and the same shared JSON fixtures consumed by Python.

The Go 1.26.x and 1.27.x CI jobs passed on code commit `13b67952cf19ceacf4ceaa71ada70e654755423b`; the SDK remains unmerged. The passing matrix verifies only those tested Go runtimes and mocked HTTP/JSON contract behavior. It does not prove a live Neural origin, provider readiness, all languages, every AI provider, or a production deployment.

## Capability registry and Linux test scope

The machine-readable starting registry is [interoperability-capabilities.json](./interoperability-capabilities.json), governed by [its JSON Schema](./interoperability-capabilities.schema.json). The first public control-plane contract is [the Neural adapter OpenAPI 3.1 specification](./openapi/glorifier-neural-adapter.openapi.json); its validator checks the endpoint, auth, task-schema limits, and documented error responses. Run `node scripts/validate-interoperability-capabilities.mjs` to check the status vocabulary, unique capability IDs, target environments, evidence references, timestamp syntax, and the rule that a `VERIFIED` claim must have timestamped test evidence. A live-runtime scope requires a live-probe record.

The [Interoperability Linux validation workflow](../../.github/workflows/interoperability-linux.yml) defines source checks on GitHub-hosted Ubuntu 22.04 and Ubuntu 24.04 x86_64 runners, plus builds of the repository's declared container images. The matrix is a bounded support claim only: it does not imply ARM64, Alpine, all Linux distributions, Windows, or macOS support. New target entries remain `NOT VERIFIED` until the workflow produces successful evidence.

The Neural task adapter accepts `application/json` and `application/*+json` and enforces a 65,536-byte (64 KiB) request-body cap before forwarding. Declared lengths and actual streamed bytes are checked; oversized task requests return `413 REQUEST_BODY_TOO_LARGE`, and unsupported media types return `415 UNSUPPORTED_MEDIA_TYPE`. The branch's regression tests must pass before this boundary is marked verified.

## Current evidence boundary

The repository contains a TypeScript Worker adapter and a small Python client with standard-library tests, but the presence of code is not proof of live interoperability. The registry separates mock contract tests, CI execution, container builds, and live runtime probes. No deployed Neural origin or production readiness is asserted. The OpenAPI document exists, but its presence does not prove generated-client compatibility or passing external A2A/MCP interoperability suites. Upgrade statuses only when linked evidence supports the exact claim and target environment.


## Shared cross-language conformance fixtures

The canonical starter fixtures are [interoperability-contract-fixtures.json](./interoperability-contract-fixtures.json). They cover UTF-8/Unicode preservation, arbitrary-precision quantities represented as decimal strings, absent-versus-null semantics, nested JSON types, and stable machine-readable error envelopes. The Python SDK workflow runs equivalent assertions on Python 3.10, 3.11, and 3.12.

These are baseline fixtures, not a claim of multi-language certification. Each additional SDK/runtime must consume the same fixture file and pass equivalent encode/decode assertions in its own CI before it can be marked verified. Next targets should be Go and Java/Kotlin, followed by Rust, C#, JavaScript/TypeScript, PHP, Ruby, Swift, and other requested runtimes according to actual use cases. For runtimes without a native SDK, the versioned HTTPS/JSON contract remains the compatibility baseline.

## AI provider interoperability boundary

Provider adapters must advertise capabilities explicitly (modalities, tool calling, streaming, structured output, context limits, and supported authentication mode) and return normalized errors without claiming semantic equivalence between different models. Routing may select only adapters that meet the task's declared capability and policy requirements. Provider fallback is permitted only when explicitly configured and authorized; it must not silently change data residency, cost, model class, or action permissions. MCP and A2A adapters require separate protocol testing and must not bypass GLORIFIER authorization, evidence, or human-approval controls.

## Native SDK implementations — 2026-11-05

The repository now contains native HTTP/JSON client packages for the following additional languages. These are implementation targets, not certified compatibility claims:

| SDK | Runtime target | Package path | CI job |
|---|---|---|---|
| Java | JDK 17+ | `sdk/java` | Java SDK |
| Kotlin | Kotlin/JVM 2.0.21, JDK 17+ | `sdk/kotlin` | Kotlin SDK |
| C# / .NET | .NET 8 | `sdk/dotnet` | .NET SDK |
| Rust | stable Rust, edition 2021 | `sdk/rust` | Rust SDK |
| PHP | PHP 8.2+, cURL, mbstring | `sdk/php` | PHP SDK |
| Ruby | Ruby 3.2+ | `sdk/ruby` | Ruby SDK |
| Swift | Swift 5.9+, macOS 13+ | `sdk/swift` | Swift SDK |
| Dart | Dart 3.4+ | `sdk/dart` | Dart SDK |

The implementation contract for each package is:

- Exact-origin HTTPS validation; loopback HTTP is available only through an explicit test/development opt-in.
- Health and readiness calls do not carry the caller's bearer token.
- The bearer token is attached only to `POST /api/neural/v1/tasks`.
- Authenticated redirects are not followed.
- Task payloads use only the canonical OpenAPI fields: `task`, `purpose`, `require_approval`, and `action_class`.
- Task request bodies are limited to 65,536 UTF-8 bytes; response reads are limited to 1 MiB where the runtime transport provides bounded streaming.
- HTTP 503 readiness observations are returned with their status and JSON body; task submission is not automatically retried because the API does not define an idempotency key.
- Unknown task fields and invalid field types/lengths are rejected before network access.

Run each language's test command as listed in [the SDK package index](../../sdk/README.md). The dedicated [native SDK conformance workflow](../../.github/workflows/polyglot-sdk.yml) runs the language-specific contract suites. A capability remains `NOT VERIFIED` until the exact current commit's corresponding CI job succeeds. A successful mocked/local test run does not establish a live Neural origin, production credentials, external A2A/MCP conformance, or provider readiness.

These packages are initial, independently implemented clients. They are not generated from a single OpenAPI code generator, and their language runtimes, dependency trees, and exception/error models remain language-specific. The shared wire contract and conformance tests—not shared in-memory objects—are the compatibility boundary.
