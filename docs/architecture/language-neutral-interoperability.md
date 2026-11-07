# Language-neutral interoperability contract

## Purpose

GLORIFIER must not make TypeScript the required language for every integration. TypeScript is one implementation in the control plane, not the interoperability boundary. Any language or runtime that can implement the published protocol and security requirements may participate.

This document defines the stable wire contract and evidence rules. First-party SDK implementations now exist for eleven language ecosystems; their verified runtime/runner scope is listed below and in the machine-readable capability registry. SDK contract verification must not be confused with live service, provider, A2A/MCP, Linux-distribution, or blockchain interoperability.

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

GLORIFIER currently maintains first-party HTTP/JSON clients for eleven languages:

| Language | Package | CI target | Evidence status |
|---|---|---|
| Python | `sdk/python` | Python 3.10, 3.11, 3.12 on Ubuntu 24.04 x86_64  | VERIFIED |
| Go | `sdk/go` | Go 1.26.x and 1.27.x on Ubuntu 24.04 x86_64  | VERIFIED |
| Java | `sdk/java` | JDK 17 on Ubuntu 24.04 x86_64  | VERIFIED |
| Kotlin | `sdk/kotlin` | Kotlin/JVM 2.0.21 on JDK 17 / Ubuntu 24.04 x86_64  | VERIFIED |
| C# / .NET | `sdk/dotnet` | .NET 8 on Ubuntu 24.04 x86_64  | VERIFIED |
| Rust | `sdk/rust` | stable Rust, edition 2021, on Ubuntu 24.04 x86_64  | VERIFIED |
| PHP | `sdk/php` | PHP 8.2 with cURL and mbstring on Ubuntu 24.04 x86_64  | VERIFIED |
| Ruby | `sdk/ruby` | Ruby 3.2 on Ubuntu 24.04 x86_64  | VERIFIED |
| Swift | `sdk/swift` | Swift 5.9+ / macOS 15 ARM64; macOS 14 is historical (runner retired)  | VERIFIED |
| Dart | `sdk/dart` | Dart 3.4.4 on Ubuntu 24.04 x86_64  | VERIFIED |
| JavaScript / TypeScript | `sdk/javascript` | Node.js 24.12.0 on Ubuntu 24.04 x86_64  | VERIFIED |

The eight additional native SDK jobs (Java, Kotlin, .NET, Rust, PHP, Ruby, Swift, Dart) passed the dedicated native SDK workflow on PR #658 head `23d18f5ecfbe2e4a1c788fa6fe8288e657e69e7e` in [run #41992741980](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41992741980); PR #658 merged to main as `3a04a42b50c3e1e2ef5b70b1ca7d0a0581f09057`. Python and Go retain separate multi-version conformance matrices; their latest recorded successful run is [run #42001480782](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/42001480782) on PR #661 head `368236b13d7cd16d70c4c7e1ba9231a42e1a2b82`. See [the SDK package index](../../sdk/README.md) and the capability registry for exact per-language evidence.

A third-party client may use any language or runtime capable of HTTPS, UTF-8 JSON, the published schemas, and the security contract. This is protocol-level extensibility—not a claim that GLORIFIER ships or has certified a native SDK for every programming language. The JavaScript/TypeScript package is server-side Node.js only; it is not a browser SDK because caller bearer tokens must remain outside browser bundles. Its exact Node.js 24.12.0 / Ubuntu 24.04 x86_64 job passed 9/9 tests on PR #663 head `23d43cd19e0333e57d813759f2efb9a199610c69` in [run #42016850741](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/42016850741). This verifies only that named Node runtime and OS/architecture target, not browser support or other Node/OS/architecture combinations.

For systems that do not use a native SDK, the versioned HTTPS API, OpenAPI document, JSON Schema contracts, and shared fixtures are the compatibility baseline. A language/runtime is supported only for the exact versions, operating systems, architectures, and protocol surfaces for which test evidence exists.

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


## Current implementation status

The first-party SDK catalog is complete for the eleven languages listed above. All eleven packages include fixture-driven tests for UTF-8/Unicode, arbitrary-precision decimal strings, absent-versus-null behavior, nested JSON values, and stable machine-readable errors. Python and Go consume the same canonical fixture file through their dedicated conformance workflow; the other nine SDKs run the corresponding fixture suites through the native SDK workflow.

This status does not extend automatically to additional runtime versions, CPU architectures, operating systems, or other GLORIFIER interfaces. The current Linux source/container workflow covers only the exact Ubuntu runner and container targets it names. It does not establish support for every Linux distribution, ARM64, Windows, or every macOS version.

### Cross-platform verification scope

| Platform target | Evidence boundary | Status |
|---|---|---|
| Ubuntu 24.04 x86_64 | All eleven SDKs have named native CI targets on this platform. | VERIFIED for each exact runtime and runner listed above |
| Windows Server 2022 x86_64 | Python 3.12, Go 1.26.x, and Node.js 24.12.0 passed on PR #728 head `319897d4316862f8c73726c6825c1b6ff7270aad` in [run #42402454620](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/42402454620). | PARTIALLY VERIFIED for those three SDK/runtime pairs only |
| macOS 15 ARM64 | Python 3.12, Go 1.26.x, Node.js 24.12.0, and Swift 5.9+ passed on the same exact PR head and run. | PARTIALLY VERIFIED for those four SDK/runtime pairs only |
| macOS 14 x86_64 | Historical Swift pass; GitHub Actions retired the macOS 14 image on 2026-11-02. | Historical exact-target evidence; no longer a runnable GitHub Actions target |
| Ubuntu 22.04 x86_64 | The interoperability source workflow tests control-plane source here; it does not run all eleven SDK suites on this target. | NOT VERIFIED for the full SDK portfolio |
| Linux ARM64 | No complete first-party SDK matrix is recorded. | NOT VERIFIED |
| Browser JavaScript/TypeScript | No browser SDK is provided; bearer credentials remain server-side by design. | NOT SUPPORTED by the current security boundary |

The supplementary Windows/macOS jobs are coverage probes, not automatic status promotion. A platform target becomes VERIFIED only after its exact job succeeds and the capability registry records the commit, runtime, OS, architecture, timestamp, and CI evidence. A pass for Python, Go, or Node.js does not extend the claim to the other SDKs.

The common Neural SDK surface is intentionally small:

- `health()`: GET `/api/neural/health`.
- `ready()`: GET `/api/neural/ready`.
- `submitTask(...)`: POST `/api/neural/v1/tasks` using a caller-issued bearer token.

All clients must preserve the documented response/error semantics and keep credentials scoped to the task route.

## Capability registry and Linux test scope

The machine-readable starting registry is [interoperability-capabilities.json](./interoperability-capabilities.json), governed by [its JSON Schema](./interoperability-capabilities.schema.json). The first public control-plane contract is [the Neural adapter OpenAPI 3.1 specification](./openapi/glorifier-neural-adapter.openapi.json); its validator checks the endpoint, auth, task-schema limits, and documented error responses. Run `node scripts/validate-interoperability-capabilities.mjs` to check the status vocabulary, unique capability IDs, target environments, evidence references, timestamp syntax, and the rule that a `VERIFIED` claim must have timestamped test evidence. A live-runtime scope requires a live-probe record.

The [Interoperability Linux validation workflow](../../.github/workflows/interoperability-linux.yml) defines source checks on GitHub-hosted Ubuntu 22.04 and Ubuntu 24.04 x86_64 runners, plus builds of the repository's declared container images. The matrix is a bounded support claim only: it does not imply ARM64, Alpine, all Linux distributions, Windows, or macOS support. New target entries remain `NOT VERIFIED` until the workflow produces successful evidence.

The Neural task adapter accepts `application/json` and `application/*+json` and enforces a 65,536-byte (64 KiB) request-body cap before forwarding. Declared lengths and actual streamed bytes are checked; oversized task requests return `413 REQUEST_BODY_TOO_LARGE`, and unsupported media types return `415 UNSUPPORTED_MEDIA_TYPE`. The branch's regression tests must pass before this boundary is marked verified.


## Current evidence boundary

The eleven SDK packages and their named CI jobs provide bounded language-client contract evidence. They do not prove that a live GLORIFIER-NEURAL HTTPS origin is configured or ready, that any AI provider can currently execute a task, or that multiple providers produce semantically equivalent results. The last recorded production Neural health/readiness observations returned HTTP 503 with `NEURAL_ORIGIN_NOT_CONFIGURED` on 2026-11-03; this is a historical fail-closed configuration observation, not a current live probe.

The broader capability registry continues to mark A2A/MCP adapter conformance, external client/server interoperability, provider semantic equivalence, provider billing reconciliation, and independently verified economic outcomes as NOT VERIFIED. Blockchain read-only adapter test vectors are not proof of live RPC reachability, contract state, or transaction capability. Upgrade each capability only with its own exact target, timestamp, verifier, and retained evidence.

## Shared cross-language conformance fixtures

The canonical fixture set is [interoperability-contract-fixtures.json](./interoperability-contract-fixtures.json). It covers UTF-8/Unicode preservation, arbitrary-precision quantities represented as decimal strings, absent-versus-null semantics, nested JSON types, and stable machine-readable error envelopes. Python and Go consume the shared fixtures through the Python/Go SDK conformance workflow. Java, Kotlin, C#/.NET, Rust, PHP, Ruby, Swift, and Dart run their corresponding fixture-driven suites through the native SDK workflow.

The SDK tests establish wire-format consistency for the named test targets. They do not constitute external API certification, live Neural tests, A2A/MCP conformance, provider equivalence tests, or a guarantee that all SDKs behave identically outside the shared contract cases.

## AI provider interoperability boundary

Provider adapters must advertise capabilities explicitly (modalities, tool calling, streaming, structured output, context limits, and supported authentication mode) and return normalized errors without claiming semantic equivalence between different models. Routing may select only adapters that meet the task's declared capability and policy requirements. Provider fallback is permitted only when explicitly configured and authorized; it must not silently change data residency, cost, model class, or action permissions. MCP and A2A adapters require separate protocol testing and must not bypass GLORIFIER authorization, evidence, or human-approval controls.

## First-party native SDKs — evidence reviewed 2026-11-08

The eleven maintained first-party HTTP/JSON clients and their named runtime/runner evidence are listed in [the SDK package index](../../sdk/README.md) and [the capability registry](./interoperability-capabilities.json). The registry records one capability per SDK, exact target environments, and retained CI-run evidence. The SDK inventory validator checks that the catalog, documentation tables, capability records, package directories, and workflow jobs remain aligned.

Each VERIFIED SDK capability is limited to its exact runtime, operating system, architecture, test suite and recorded run. It is not a promise of support for every runtime version, platform, distribution, architecture or protocol. The packages are independently implemented clients, not generated from one code generator; the shared OpenAPI/JSON contract and fixture tests are the compatibility boundary.

The available task API is intentionally narrow:

- `health()`: GET `/api/neural/health`.
- `ready()`: GET `/api/neural/ready`.
- `submitTask(...)`: POST `/api/neural/v1/tasks` with a caller-issued bearer token.

Security invariants remain mandatory: exact-origin HTTPS in production, explicit loopback opt-in for development/tests, credentials scoped only to task submission, authenticated redirects disabled, bounded request and response bodies, and preservation of readiness/error status. Task submissions are not retried without a server-supported idempotency contract.

SDK CI does not prove a live Neural origin, deployed credentials, production readiness, external A2A/MCP conformance, provider semantic equivalence, billing reconciliation, independently verified outcomes, or live blockchain reachability. Each of those remains an independent capability with its own evidence gate.
