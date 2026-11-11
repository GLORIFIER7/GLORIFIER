# GLORIFIER Interoperability Verification Matrix

This matrix separates implementation/configuration from externally verified interoperability. A row may only move to VERIFIED/FULLY_VERIFIED when the stated evidence exists.

| Capability | Required evidence | Current status | Safe next verification |
|---|---|---|---|
| First-party language SDK contract (Python, Go, Java, Kotlin, C#/.NET, Rust, PHP, Ruby, Swift, Dart, JavaScript/TypeScript) | Language-specific client tests plus shared wire fixtures; exact versions, OS and architecture recorded in capability registry | VERIFIED for the named runtime/runner matrix only | Keep each claim scoped to its exact target; separately verify live Neural, A2A/MCP, providers and chains |
| Cross-platform SDK probe (Python, Go, Node.js, Swift) | Exact Windows Server 2022 x86_64 and macOS 15 ARM64 jobs for Python 3.12, Go 1.26.x, Node.js 24.12.0, and Swift 5.9+; exact PR #728 head and run evidence retained in the capability registry | PARTIALLY VERIFIED | These exact runtime/platform pairs passed run #42402454620. Windows for the remaining SDKs, Linux ARM64, and untested runtime/architecture combinations remain NOT VERIFIED |
| JavaScript / TypeScript Node SDK | Node.js 24.12.0 CI job plus shared wire fixtures and origin/auth/body-limit tests | VERIFIED for Node.js 24.12.0 / Ubuntu 24.04 x86_64 only | Extend the Node runtime/OS matrix deliberately; separately verify live Neural connectivity, providers, and external A2A/MCP interoperability |
| A2A v1.0 conformance | Live authorized endpoint test plus A2A conformance/TCK evidence and retained result | NOT_VERIFIED | Run conformance suite against the deployed endpoint |
| A2A cryptographic identity | Signed Agent Card, trusted key material, signature validation, expiry/revocation checks | NOT_VERIFIED | Verify a real signed Agent Card without weakening trust policy |
| MCP 2025-11-25 | Live authorized client/server interoperability test | NOT_VERIFIED | Exercise handshake/session compatibility and record protocol evidence |
| MCP 2026-07-28 | Live authorized client/server interoperability test | NOT_VERIFIED | Exercise current request semantics through multiple replicas |
| Runtime sandbox/quarantine | Actual isolated execution test, egress/tool/resource policy test, kill/quarantine evidence | NOT_VERIFIED | Execute a harmless canary workload in the real isolated runtime |
| Kubernetes/GPU | Cluster evidence, scheduled workload, GPU visibility, readiness and logs | NOT_VERIFIED | Deploy a non-production read-only canary with explicit authorization |
| NVIDIA Dynamo | Exact Dynamo image/release, backend/model, GPU, CUDA, driver, OS/architecture and Kubernetes tuple; GPU visibility/scheduling; authenticated live model-catalogue readiness and inference; security/rollback evidence | NOT_VERIFIED | Resolve the socket-retention correction in NEURAL PR #71; separately restore and review the wildcard-origin rejection from closed, unmerged PR #68; then deploy only in an authorized GPU environment and retain exact-tuple workload evidence; adapter CI and mocks do not promote this row |
| Cross-provider semantic equivalence | Same task corpus, normalized outputs, provider-native error preservation, predefined acceptance thresholds | NOT_VERIFIED | Run a deterministic evaluation corpus across authorized providers |
| Provider billing reconciliation | Authenticated provider-issued usage and invoice records matched to complete GLORIFIER per-request metering for the exact period; FOCUS 1.4 CostAndUsage/InvoiceDetail reconciliation; credits, taxes, refunds and adjustments; source integrity and retained evidence. The generic GEAS evidence endpoint blocks `economically-verified` claims until a dedicated server-side verifier admits the complete evidence set. | NOT_VERIFIED | No live provider source or paid call is authorized. First build deterministic fixtures and the server-side verifier; later use a human-authorized provider export or explicitly approved voucher/free-credit/sponsored account, with exact-period source-authentication and reconciliation evidence. |
| Independently verified economic outcomes | External authoritative evidence connecting authorized execution to outcome/settlement | NOT_VERIFIED | Validate one bounded outcome with independent evidence |

## Fail-closed rules

- Configuration is not verification.
- Discovery is not authorization.
- A successful request is not an independently verified outcome.
- Provider-reported usage is not automatically economic truth.
- Missing or stale evidence must remain UNKNOWN/NOT_VERIFIED.
- No test may add credentials to source control or bypass GEAS authorization.
- Financial or irreversible production execution is outside this verification workflow.

## Evidence minimum

Each verified claim should retain:
1. subject identity;
2. exact version/protocol/runtime tuple;
3. test scope and timestamp;
4. authorization reference;
5. raw or immutable evidence reference;
6. verifier/result;
7. expiry or freshness rule where applicable.


## NVIDIA Dynamo evidence checkpoint — 2026-11-07

The optional OpenAI-compatible adapter was merged to `GLORIFIER7/GLORIFIER-NEURAL` in PR #67 and is present on `main`. A real synchronous HTTP/1.0 close-after-response failure and wildcard-origin acceptance were reproduced on main. The combined follow-up PR #68 was closed without merging on 2026-11-07. The socket-retention correction is now in open draft PR #71 (head `102b2aec4a87d78bf1a5ea438184b51154ef0f86`); exact-head Python 3.11 and 3.12 tests each passed 377 tests, Ruff, dependency audit, container build, CodeQL, and Cloudflare Worker preview passed, but AI Review Policy failed because the current-head formal CodeAnt review is missing. The wildcard-origin rejection from closed PR #68 was not carried into PR #71 and remains absent from main; it requires a separate security-reviewed correction. PR #71's head is unsigned, and the active NEURAL main ruleset requires signed commits. Cloudflare deploy and smoke jobs were skipped. No authorized GPU host, Kubernetes cluster, exact Dynamo image/backend/model/hardware tuple, live `/v1/models` probe, `/v1/chat/completions` inference, ingress-authentication proof, security canary, or rollback evidence exists. **NVIDIA Dynamo deployment remains NOT_VERIFIED.**
