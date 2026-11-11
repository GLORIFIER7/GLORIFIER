# GLORIFIER Interoperability Verification Matrix

This matrix separates implementation/configuration from externally verified interoperability. A row may only move to VERIFIED/FULLY_VERIFIED when the stated evidence exists.

| Capability | Required evidence | Current status | Safe next verification |
|---|---|---|---|
| First-party language SDK contract (Python, Go, Java, Kotlin, C#/.NET, Rust, PHP, Ruby, Swift, Dart, JavaScript/TypeScript) | Language-specific client tests plus shared wire fixtures; exact versions, OS and architecture recorded in capability registry | VERIFIED for the named runtime/runner matrix only | Keep each claim scoped to its exact target; separately verify live Neural, A2A/MCP, providers and chains |
| Cross-platform SDK probe (Python, Go, Node.js, Swift) | Exact Windows Server 2022 x86_64 and macOS 15 ARM64 jobs for Python 3.12, Go 1.26.x, Node.js 24.12.0, and Swift 5.9+; exact PR #728 head and run evidence retained in the capability registry | PARTIALLY VERIFIED | These exact runtime/platform pairs passed run #42402454620. Windows for the remaining SDKs, Linux ARM64, and untested runtime/architecture combinations remain NOT VERIFIED |
| JavaScript / TypeScript Node SDK | Node.js 24.12.0 CI job plus shared wire fixtures and origin/auth/body-limit tests | VERIFIED for Node.js 24.12.0 / Ubuntu 24.04 x86_64 only | Extend the Node runtime/OS matrix deliberately; separately verify live Neural connectivity, providers, and external A2A/MCP interoperability |
| A2A v1.0 conformance (target: A2A 1.0.1) | Official A2A 1.0.1 TCK report, authenticated external-client interoperability, and a controlled two-agent lifecycle test against an authorized endpoint | NOT_VERIFIED | Run the pinned TCK and bounded client/two-agent tests only against an explicitly owner-authorized staging endpoint; local JSON-RPC and lifecycle tests do not establish full conformance |
| A2A cryptographic identity | Signed Agent Card, trusted key material, signature validation, expiry/revocation checks | NOT_VERIFIED | Verify a real signed Agent Card without weakening trust policy |
| MCP 2025-11-25 | Legacy compatibility test plus live authorized external-client/server interoperability evidence | NOT_VERIFIED | Retain the legacy compatibility smoke and run an independent client handshake/discovery/read-only tools test only against an explicitly authorized endpoint |
| MCP 2026-07-28 | Official frozen-revision server TCK report and independent external-client discovery/list/call evidence | NOT_VERIFIED | PR #819 added a manual, opt-in TCK workflow, but it has not been dispatched; local stateless-subset tests do not establish full TCK or client conformance |
| Runtime sandbox/quarantine | Actual isolated execution test, egress/tool/resource policy test, kill/quarantine evidence | NOT_VERIFIED | Execute a harmless canary workload in the real isolated runtime |
| Kubernetes/GPU | Cluster evidence, scheduled workload, GPU visibility, readiness and logs | NOT_VERIFIED | Deploy a non-production read-only canary with explicit authorization |
| NVIDIA Dynamo | Exact Dynamo image/release, backend/model, GPU, CUDA, driver, OS/architecture and Kubernetes tuple; GPU visibility/scheduling; authenticated live model-catalogue readiness, separately authorized inference, ingress security, and rollback evidence | NOT_VERIFIED for live GPU deployment; source-level origin and transport guards are present on NEURAL main | Source/CI completion is not deployment proof. Proceed only after explicit owner authorization for a no-cost or approved sponsored environment and exact endpoint; validate the pinned GPU/runtime tuple, ingress authentication, read-only `/v1/models`, security controls, and rollback. Do not send inference without separate authorization |
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


## Reconciled NVIDIA Dynamo evidence checkpoint — 2026-11-11

`GLORIFIER7/GLORIFIER-NEURAL` PR #67 added the OpenAI-compatible Dynamo adapter. The HTTP/1.0 connection-close response fix from PR #71 is merged on NEURAL main (merge recorded 2026-11-08T11:26:19Z); the current source at `app/providers/dynamo.py` retains the connection socket until the bounded body read finishes. The earlier combined PR #68 was closed without merging, but its wildcard-host security correction is no longer absent: NEURAL main contains commit [`70b6354`](https://github.com/GLORIFIER7/GLORIFIER-NEURAL/commit/70b6354fd4bac1cb7bc825add4270b154a879998), which rejects `*` in both the configured HTTPS origin and API-base hostname. Regression coverage is present in test commits [`54f555d`](https://github.com/GLORIFIER7/GLORIFIER-NEURAL/commit/54f555d78b52f746b5a5ad8ecd0b699f42210953) and [`4c0f0ef`](https://github.com/GLORIFIER7/GLORIFIER-NEURAL/commit/4c0f0ef1a895b2bee901483b6414b8db4d85f959). Current NEURAL main is `042c50d5d570122eeb12036c7a68865330630da7`; source-level HTTPS-origin/wildcard validation and bounded transport logic are present. The GLORIFIER repository also added a matching wildcard-host rejection in its `services/neural` vLLM adapter in PR #822, merged as `7769ffa193eedc50eaa7ed021604416c523d5070`. These are source and test results only. No owner-authorized GPU host/Kubernetes cluster, exact deployed Dynamo image/backend/model/hardware tuple, authenticated live `/v1/models` probe, authorized inference, ingress-authentication proof, security canary, or rollback evidence is recorded. **Live NVIDIA Dynamo deployment remains NOT_VERIFIED.**
