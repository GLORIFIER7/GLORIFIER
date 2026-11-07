# GLORIFIER Interoperability Verification Matrix

This matrix separates implementation/configuration from externally verified interoperability. A row may only move to VERIFIED/FULLY_VERIFIED when the stated evidence exists.

| Capability | Required evidence | Current status | Safe next verification |
|---|---|---|---|
| First-party language SDK contract (Python, Go, Java, Kotlin, C#/.NET, Rust, PHP, Ruby, Swift, Dart, JavaScript/TypeScript) | Language-specific client tests plus shared wire fixtures; exact versions, OS and architecture recorded in capability registry | VERIFIED for the named runtime/runner matrix only | Extend runtime and OS/architecture matrices; separately verify live Neural, A2A/MCP, providers and chains |
| JavaScript / TypeScript Node SDK | Node.js 24.12.0 CI job plus shared wire fixtures and origin/auth/body-limit tests | VERIFIED for Node.js 24.12.0 / Ubuntu 24.04 x86_64 only | Extend the Node runtime/OS matrix deliberately; separately verify live Neural connectivity, providers, and external A2A/MCP interoperability |
| A2A v1.0 conformance | Live authorized endpoint test plus A2A conformance/TCK evidence and retained result | NOT_VERIFIED | Run conformance suite against the deployed endpoint |
| A2A cryptographic identity | Signed Agent Card, trusted key material, signature validation, expiry/revocation checks | NOT_VERIFIED | Verify a real signed Agent Card without weakening trust policy |
| MCP 2025-11-25 | Live authorized client/server interoperability test | NOT_VERIFIED | Exercise handshake/session compatibility and record protocol evidence |
| MCP 2026-07-28 | Live authorized client/server interoperability test | NOT_VERIFIED | Exercise current request semantics through multiple replicas |
| Runtime sandbox/quarantine | Actual isolated execution test, egress/tool/resource policy test, kill/quarantine evidence | NOT_VERIFIED | Execute a harmless canary workload in the real isolated runtime |
| Kubernetes/GPU | Cluster evidence, scheduled workload, GPU visibility, readiness and logs | NOT_VERIFIED | Deploy a non-production read-only canary with explicit authorization |
| NVIDIA Dynamo | Exact Dynamo image/release, backend/model, GPU, CUDA, driver, OS/architecture and Kubernetes tuple; GPU visibility/scheduling; authenticated live model-catalogue readiness and inference; security/rollback evidence | NOT_VERIFIED | Validate the draft adapter in NEURAL PR #67, then deploy only in an authorized GPU environment and retain exact-tuple workload evidence; mocked tests and CI do not promote this row |
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

A draft governed adapter is under review in [GLORIFIER-NEURAL PR #67](https://github.com/GLORIFIER7/GLORIFIER-NEURAL/pull/67). The branch adds explicit provider selection, an exact HTTPS origin allowlist, bearer-authenticated OpenAI-compatible model-catalogue and chat-completion requests, bounded non-streaming I/O, and separate egress/inference gates. Its test suite uses controlled/mocked responses. The PR is not merged, exact-head CI/review is still in progress, and no GPU-backed Dynamo endpoint or Kubernetes workload has been verified. **NVIDIA Dynamo remains NOT_VERIFIED.**
