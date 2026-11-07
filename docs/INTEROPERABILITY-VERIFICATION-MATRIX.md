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
| NVIDIA Dynamo | Exact Dynamo image/release, backend/model, GPU, CUDA, driver, OS/architecture and Kubernetes tuple; GPU visibility/scheduling; authenticated live model-catalogue readiness and inference; security/rollback evidence | NOT VERIFIED | Resolve the follow-up adapter defect fix in NEURAL PR #68, then deploy only in an authorized GPU environment and retain exact-tuple workload evidence; adapter CI and mocks do not promote this row |
| Cross-provider semantic equivalence | Same task corpus, normalized outputs, provider-native error preservation, predefined acceptance thresholds | NOT_VERIFIED | Run a deterministic evaluation corpus across authorized providers |
| Provider billing reconciliation | Provider usage records matched to GLORIFIER metering and independently reconciled totals | NOT_VERIFIED | Reconcile a bounded, non-financial test account/export |
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

The optional OpenAI-compatible adapter was merged to `GLORIFIER7/GLORIFIER-NEURAL` in PR #67 and is present on `main`. A real synchronous HTTP/1.0 close-after-response failure and wildcard-origin acceptance were then reproduced on main. Follow-up PR #68 (head `8b21a25d454313888fba0bd33f3b5b17d431276f`) is open and ready for review (draft=false, not merged); it adds retained-socket handling, wildcard rejection, and a real local HTTP regression test. Python 3.11/3.12 CI, Ruff, pytest, pip-audit, container build, CodeQL, and Cloudflare Worker validation passed; the AI Review Policy check failed because required current-head formal AI reviews are missing. Cloudflare deploy and smoke jobs were skipped. PR #68 remains open and unmerged; its current-head formal CodeAnt review and signed-commit requirements are unresolved. No authorized GPU host, Kubernetes cluster, exact Dynamo image/backend/model/hardware tuple, live `/v1/models` probe, `/v1/chat/completions` inference, ingress-authentication proof, security canary, or rollback evidence exists. **NVIDIA Dynamo deployment remains NOT_VERIFIED.**
