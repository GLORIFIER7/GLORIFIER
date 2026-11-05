# GLORIFIER native SDKs

All SDKs use the same language-neutral HTTPS/JSON contract documented in [the architecture guide](../docs/architecture/language-neutral-interoperability.md) and the canonical [Neural adapter OpenAPI 3.1 document](../docs/architecture/openapi/glorifier-neural-adapter.openapi.json).

## Current packages

| Language | Package | Runtime target | Test command |
|---|---|---|---|
| Python | `sdk/python` | Python 3.10–3.12 CI matrix | `cd sdk/python && python -m unittest -v` |
| Go | `sdk/go` | Go 1.26.x and 1.27.x CI matrix | `cd sdk/go && go test -race -count=1 ./... && go vet ./...` |
| Java | `sdk/java` | JDK 17+ | `cd sdk/java && mvn --batch-mode test` |
| Kotlin | `sdk/kotlin` | Kotlin/JVM 2.0.21, JDK 17+ | `gradle -p sdk/kotlin test` |
| C# / .NET | `sdk/dotnet` | .NET 8 | `dotnet test sdk/dotnet/Glorifier.Neural.Tests/Glorifier.Neural.Tests.csproj` |
| Rust | `sdk/rust` | stable Rust, edition 2021 | `cargo test --manifest-path sdk/rust/Cargo.toml --all-targets` |
| PHP | `sdk/php` | PHP 8.2+, cURL, mbstring | `php sdk/php/tests/run.php` |
| Ruby | `sdk/ruby` | Ruby 3.2+ | `ruby sdk/ruby/test/test_client.rb` |
| Swift | `sdk/swift` | Swift 5.9+, macOS 13+ | `swift test --package-path sdk/swift` |
| Dart | `sdk/dart` | Dart 3.4+ | `cd sdk/dart && dart pub get && dart test` |

The Python and Go SDKs have prior successful CI evidence for their explicitly recorded matrices. Java, Kotlin, .NET, Rust, PHP, Ruby, Swift and Dart are new source packages; their conformance status remains **NOT VERIFIED** until their exact-head jobs pass in [polyglot-sdk.yml](../.github/workflows/polyglot-sdk.yml). The existence of a source package is not evidence that the runtime is supported or production-ready.

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

## Evidence rules

Consult [the capability registry](../docs/architecture/interoperability-capabilities.json) for the current recorded status. A language/runtime may be marked VERIFIED only after its exact runtime, OS, architecture and commit-specific conformance checks pass. Mocked tests do not prove live Neural connectivity, provider availability, A2A/MCP client interoperability or production deployment health.
