# GLORIFIER native SDKs

All eleven first-party clients use the same language-neutral HTTPS/JSON contract documented in [the architecture guide](../docs/architecture/language-neutral-interoperability.md) and the canonical [Neural adapter OpenAPI 3.1 document](../docs/architecture/openapi/glorifier-neural-adapter.openapi.json).

## Current packages and verified targets

| Language | Package | Runtime target | Test command | Evidence status |
|---|---|---|---|
| Python | `sdk/python` | Python 3.10–3.12 CI matrix | `cd sdk/python && python -m unittest -v`  | VERIFIED |
| Go | `sdk/go` | Go 1.26.x and 1.27.x CI matrix | `cd sdk/go && go test -race -count=1 ./... && go vet ./...`  | VERIFIED |
| Java | `sdk/java` | JDK 17+ | `cd sdk/java && mvn --batch-mode test`  | VERIFIED |
| Kotlin | `sdk/kotlin` | Kotlin/JVM 2.0.21, JDK 17+ | `gradle -p sdk/kotlin test`  | VERIFIED |
| C# / .NET | `sdk/dotnet` | .NET 8 | `dotnet test sdk/dotnet/Glorifier.Neural.Tests/Glorifier.Neural.Tests.csproj`  | VERIFIED |
| Rust | `sdk/rust` | stable Rust, edition 2021 | `cargo test --manifest-path sdk/rust/Cargo.toml --all-targets`  | VERIFIED |
| PHP | `sdk/php` | PHP 8.2+, cURL, mbstring | `php sdk/php/tests/run.php && php sdk/php/tests/interoperability_fixtures.php`  | VERIFIED |
| Ruby | `sdk/ruby` | Ruby 3.2+ | `ruby sdk/ruby/test/test_client.rb && ruby sdk/ruby/test/test_interoperability_fixtures.rb`  | VERIFIED |
| Swift | `sdk/swift` | Swift 5.9+ / macOS 15 ARM64 (run #42402454620); macOS 14 is historical | `swift test --package-path sdk/swift`  | VERIFIED |
| Dart | `sdk/dart` | Dart 3.4+ | `cd sdk/dart && dart pub get && dart test`  | VERIFIED |
| JavaScript / TypeScript | `sdk/javascript` | Node.js 24.12.0 on Ubuntu 24.04 x86_64 | `cd sdk/javascript && npm test`  | VERIFIED |

The Java, Kotlin, .NET, Rust, PHP, Ruby, Swift, and Dart conformance jobs all passed on final PR #658 head `23d18f5ecfbe2e4a1c788fa6fe8288e657e69e7e` in [run #41992741980](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/41992741980). PR #658 merged to main as `3a04a42b50c3e1e2ef5b70b1ca7d0a0581f09057`. Python 3.10/3.11/3.12 and Go 1.26.x/1.27.x passed their separate SDK conformance jobs on PR #661 head `368236b13d7cd16d70c4c7e1ba9231a42e1a2b82` in [run #42001480782](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/42001480782). The capability registry now records all eleven SDKs as VERIFIED for their exact, named CI targets only. The JavaScript/TypeScript package passed 9/9 tests on Node.js 24.12.0 / Ubuntu 24.04 x86_64 in [run #42016850741](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/42016850741).

These are bounded CI contract results. They do not establish live Neural connectivity, production credentials, provider availability, external A2A/MCP protocol certification, compatibility on untested OS/architecture/runtime versions, or a production deployment.

## Cross-platform expansion probes

The native SDK jobs above remain the evidence baseline for the exact runtime/runner tuples listed in the table. PR #728 added passing coverage for Python 3.12, Go 1.26.x, and Node.js 24.12.0 on Windows Server 2022 x86_64 and macOS 15 ARM64, plus Swift on macOS 15 ARM64. The exact jobs passed on PR head `319897d4316862f8c73726c6825c1b6ff7270aad` in [Native SDK Conformance run #42402454620](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/42402454620). The capability registry records these specific combinations; Windows support for the remaining SDKs and other untested platform/architecture combinations remain NOT VERIFIED. These results do not prove live Neural connectivity, provider readiness, external A2A/MCP conformance, browser support, or production deployment.

Windows and ARM64 support for the remaining SDKs, Linux ARM64, and macOS ARM64 remain NOT VERIFIED. Browser JavaScript/TypeScript remains intentionally unsupported because bearer credentials must stay out of browser bundles.

## Shared wire-fixture parity

The canonical fixture file at `docs/architecture/interoperability-contract-fixtures.json` defines common UTF-8, Unicode, arbitrary-precision decimal-string, null-versus-absent, nested-type, and stable-error cases. All eleven SDK packages include language-specific fixture tests. Python and Go execute them through [the Python/Go workflow](../.github/workflows/python-sdk.yml); Java, Kotlin, .NET, Rust, PHP, Ruby, Swift, and Dart execute them through [the native SDK workflow](../.github/workflows/polyglot-sdk.yml); JavaScript/TypeScript executes them through the Node.js job in that workflow.

This is cross-language wire-contract evidence for the listed test targets, not proof of live API connectivity or external protocol certification.

## Shared API shape

Each client exposes the same three operations:

- `health()`: GET `/api/neural/health`.
- `ready()`: GET `/api/neural/ready`.
- `submitTask(...)`: POST `/api/neural/v1/tasks` with a caller-issued bearer token.

Canonical task fields:

```json
{
  "task": "Inspect the public service status",
  "purpose": "general",
  "require_approval": true,
  "action_class": "read_only"
}
```

Only `task` is required. The remaining fields are optional and validated against the OpenAPI schema. Unknown fields are rejected. The SDKs do not silently retry task submissions because the server contract does not provide an idempotency key.

## Security contract

- Production URLs must be HTTPS and match an exact allowed origin. Loopback HTTP requires an explicit development/test option.
- Bearer credentials are sent only to the task-submission route, never to health or readiness probes.
- Redirects are not followed for authenticated calls.
- The encoded task body cannot exceed 65,536 bytes.
- Response reads are limited to 1 MiB in SDK transports that support streaming size enforcement.
- Readiness HTTP 503 is preserved as a readiness observation, not rewritten as success.
- No SDK executes financial, wallet, blockchain-write, or other consequential actions outside GLORIFIER's server-side governance and human-approval policy.

## Scope and evidence rules

A capability marked VERIFIED applies only to its listed runtime, operating system, architecture, and CI result in [the capability registry](../docs/architecture/interoperability-capabilities.json). Additional versions/platforms require separate tests. A mocked contract suite does not prove a live Neural origin, provider availability, A2A/MCP interoperability, or production deployment health.

A client in another language may use the published HTTPS/JSON contract without a first-party SDK. That is protocol-level compatibility, not certification of an untested language binding.
