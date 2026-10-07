# GLORIFIER Interoperability Verification Matrix

This matrix separates implementation/configuration from externally verified interoperability. A row may only move to VERIFIED/FULLY_VERIFIED when the stated evidence exists.

| Capability | Required evidence | Current status | Safe next verification |
|---|---|---|---|
| A2A v1.0 conformance | Live authorized endpoint test plus A2A conformance/TCK evidence and retained result | NOT_VERIFIED | Run conformance suite against the deployed endpoint |
| A2A cryptographic identity | Signed Agent Card, trusted key material, signature validation, expiry/revocation checks | NOT_VERIFIED | Verify a real signed Agent Card without weakening trust policy |
| MCP 2025-11-25 | Live authorized client/server interoperability test | NOT_VERIFIED | Exercise handshake/session compatibility and record protocol evidence |
| MCP 2026-07-28 | Live authorized client/server interoperability test | NOT_VERIFIED | Exercise current request semantics through multiple replicas |
| Runtime sandbox/quarantine | Actual isolated execution test, egress/tool/resource policy test, kill/quarantine evidence | NOT_VERIFIED | Execute a harmless canary workload in the real isolated runtime |
| Kubernetes/GPU | Cluster evidence, scheduled workload, GPU visibility, readiness and logs | NOT_VERIFIED | Deploy a non-production read-only canary with explicit authorization |
| NVIDIA Dynamo | Exact Dynamo/runtime/backend/GPU/CUDA/driver tuple plus successful workload evidence | NOT_VERIFIED | Verify the exact supported tuple in an authorized environment |
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
