# GLORIFIER Interoperability and Execution Verification Matrix

Date: 2026-11-11 12:19 UTC  
Scope: evidence gates for the ten requested verification targets.

## Status policy

Use only `FULLY VERIFIED`, `VERIFIED`, `PARTIALLY VERIFIED`, `NOT VERIFIED`, `DEGRADED`, or `NOT OBSERVABLE`. A test plan, documentation review, mock, build, or successful provider response is not runtime or outcome verification. Each passing status must link to dated test output, commit/runtime identity, environment, and an evidence artifact. Missing evidence remains `NOT VERIFIED`.

## Required gates

| Target | Evidence required before VERIFIED | Current status |
|---|---|---|
| A2A v1.0.1 conformance | Run the official A2A Technology Compatibility Kit (TCK) against GLORIFIER's actual client/server adapters using the frozen v1.0.1 specification snapshot; retain suite revision, transport, test report, and failures. Verify version negotiation, task lifecycle, errors, streaming, authentication behavior, and declared bindings. | NOT VERIFIED |
| A2A implemented surface (unit/HTTP level) | `SendMessage` create/continue, `GetTask`, requester-scoped `ListTasks` with durable keyset pagination, and `CancelTask` for requester-owned queued tasks. Running tasks are not falsely marked canceled because the executor cannot interrupt provider work. Main CI run [#43019184537](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/43019184537) passed A2A SQL-binding, JSON-RPC, durable-runtime, Express, and authenticated-exchange tests on exact main commit `30573ff17d8b06f84004b9ec8f7f6575dcfde80f`. This does not imply TCK or external-client conformance. | PARTIALLY VERIFIED (merged source and exact-main CI; external TCK not run) |
| MCP 2025-11-25 compatibility | Run the official MCP conformance suite with the frozen `2025-11-25` requirement set against the actual adapter. Cover initialization/version negotiation, supported tools/resources/prompts, errors, cancellation, transport, and OAuth roles implemented by GLORIFIER. Retain exact SDK versions and report. | NOT VERIFIED |
| MCP 2026-07-28 compatibility | Run the official MCP conformance suite with the frozen `2026-07-28` requirement set separately. Test stateless per-request version/context and `server/discover` where applicable. Do not infer this from a 2025-11-25 pass. | NOT VERIFIED |
| MCP 2026-07-28 local HTTP subset | Worker tests cover `server/discover`, per-request version and client-capabilities metadata, `Mcp-Method`/`Mcp-Name` validation, unsupported-version/header error statuses, and modern method-not-found HTTP behavior. PR [#661](https://github.com/GLORIFIER7/GLORIFIER/pull/661) merged to GLORIFIER main on 2026-11-05 as [commit d5378fe](https://github.com/GLORIFIER7/GLORIFIER/commit/d5378fef4fcb10e7c92d2e04e1285f99113fdbf8). This is bounded local HTTP contract evidence only; official MCP 2026-07-28 TCK and independent external-client conformance remain NOT VERIFIED. | PARTIALLY VERIFIED (merged local subset; full conformance not run) |
| A2A cryptographic identity | Validate Agent Card JWS signatures against configured trusted keys; test unknown key, invalid signature, key rotation, expiry/revocation policy, TLS identity, replay, and authorization separation. A valid signature authenticates a key, not business authority. | NOT VERIFIED |
| Runtime sandbox and quarantine | In an isolated canary, prove default-deny egress, filesystem/process isolation, resource ceilings, least-privilege credentials, operator-triggered stop, interruption of active work where supported, and auditable quarantine. Test denied actions as well as allowed ones. | NOT VERIFIED |
| Self-hosted vLLM adapter contract | Verify exact HTTPS origin allowlisting, unsafe-origin rejection, explicit inference/egress gates, authenticated `/v1/models` readiness, and bounded non-streaming inference. The current monorepo contains the governed adapter at [`services/neural/app/providers/vllm.py`](https://github.com/GLORIFIER7/GLORIFIER/blob/30573ff17d8b06f84004b9ec8f7f6575dcfde80f/services/neural/app/providers/vllm.py) and offline regression fixtures at [`services/neural/tests/test_vllm_provider.py`](https://github.com/GLORIFIER7/GLORIFIER/blob/30573ff17d8b06f84004b9ec8f7f6575dcfde80f/services/neural/tests/test_vllm_provider.py). The adapter requires a plain HTTPS origin, an exact origin allowlist, API key, model, bounded requests, and separate runtime egress/inference/paid-inference authorization. The earlier standalone CI reference [#42162526713](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/42162526713) is historical; this audit has not established a passing exact-main NEURAL CI run for the current monorepo copy. No live vLLM endpoint or GPU inference was tested. | PARTIALLY VERIFIED (source and offline contract fixtures present; current exact-main execution and live runtime not verified) |
| Kubernetes/GPU deployment | Deploy to an authorized non-production cluster; retain manifests, image digests, GPU/driver/CUDA/Kubernetes versions, readiness/liveness results, resource limits, network policy, scheduling evidence, and rollback result. | NOT VERIFIED |
| NVIDIA Dynamo deployment | Prove a real deployment with exact Dynamo image/release digest, backend/model, CUDA/driver/GPU, OS/architecture and Kubernetes/operator tuple; verify GPU visibility/scheduling, authenticated model readiness, authorized inference, security controls and rollback; retain logs/artifact digests. A merged HTTP adapter alone is not a deployment. | NOT VERIFIED — standalone NEURAL adapter PR [#67](https://github.com/GLORIFIER7/GLORIFIER-NEURAL/pull/67) and HTTP/1.0 connection-close fix [#71](https://github.com/GLORIFIER7/GLORIFIER-NEURAL/pull/71) are merged. Wildcard-host rejection was later added on standalone NEURAL main in [commit 70b6354](https://github.com/GLORIFIER7/GLORIFIER-NEURAL/commit/70b6354fd4bac1cb7bc825add4270b154a879998) and synchronized into the authoritative GLORIFIER monorepo by [PR #770](https://github.com/GLORIFIER7/GLORIFIER/pull/770), merge commit [5502af2](https://github.com/GLORIFIER7/GLORIFIER/commit/5502af2db999db82caca99dc9d3b5bfa32fb4517). Current main includes exact HTTPS/wildcard rejection in [`services/neural/app/providers/dynamo.py`](https://github.com/GLORIFIER7/GLORIFIER/blob/30573ff17d8b06f84004b9ec8f7f6575dcfde80f/services/neural/app/providers/dynamo.py) and a matching regression in [`services/neural/tests/test_nvidia_dynamo_provider.py`](https://github.com/GLORIFIER7/GLORIFIER/blob/30573ff17d8b06f84004b9ec8f7f6575dcfde80f/services/neural/tests/test_nvidia_dynamo_provider.py). These are source/test records only. No authorized GPU-backed deployment, model readiness, inference, or rollback evidence exists. |
| Cross-provider semantic equivalence | Run a versioned task corpus across at least two real providers; normalize only declared differences; score correctness, schema conformance, refusal/safety, tool selection, latency, and cost; use tolerances and report per-task failures. Do not claim identical outputs. | NOT VERIFIED |
| Provider billing reconciliation | Reconcile provider-side usage/charges with GLORIFIER request IDs, model/version, retries, token/cache/media usage, currency, and period. Document rounding, delayed adjustments, missing records, and unexplained variance. Use read-only exports/API access. | NOT VERIFIED |
| Independently verified economic outcomes | Link each claimed outcome to an authoritative external receipt or system-of-record record, transaction/request identifier, timestamp, and independent verification procedure. Distinguish proposed, authorized, attempted, executed, settled, and verified. No evidence means UNKNOWN / NOT VERIFIED. | NOT VERIFIED |

## Official conformance entry points

These are test instructions, not proof that tests have run:

- A2A project and Technology Compatibility Kit: https://github.com/a2aproject
- MCP conformance suite: https://github.com/modelcontextprotocol/conformance
- MCP frozen requirement sets: use `--requirements 2025-11-25` and `--requirements 2026-07-28` separately. The suite README documents these commands:
  - `npx @modelcontextprotocol/conformance list --requirements 2025-11-25`
  - `npx @modelcontextprotocol/conformance list --requirements 2026-07-28`
  - Against an actual local/authorized MCP server endpoint: `npx @modelcontextprotocol/conformance server --url <authorized-server-url> --requirements 2026-07-28`
  - Tier check for a repository with actual client and server endpoints: `npx @modelcontextprotocol/conformance tier-check --repo <owner/repo> --conformance-server-url <authorized-server-url> --requirements 2025-11-25,2026-07-28`

Do not run endpoint tests against systems without authorization. Confirm the current CLI syntax against the pinned suite version before adding it to CI. A command that lists tests is not a passing conformance run.

## Shared evidence envelope

Every test run should record:
- repository URL, commit SHA, branch, and workflow/run URL;
- test-suite revision and command;
- environment and exact dependency/runtime versions;
- sanitized configuration (never secrets);
- start/end timestamps and outcome;
- raw report/artifact digest;
- failed, skipped, unsupported, and not-observable cases;
- reviewer/approval where a production or external system is involved.

## Safe implementation sequence

1. Run official conformance tests against actual protocol endpoints; label mock-only results as unit tests, not interoperability verification.
2. Test cryptographic identity and GEAS authorization as separate gates.
3. Implement runtime containment and run only harmless canaries in an authorized isolated environment.
4. Establish Kubernetes/GPU and Dynamo tuples only when infrastructure is available.
5. Build provider semantic and billing comparisons using authorized provider data.
6. Verify economic outcomes only from authoritative external records.

No credentials, secrets, or provider exports belong in this document. Do not deploy, spend funds, execute financial actions, bypass authorization, or upgrade a status without the required evidence.


### NVIDIA Dynamo source-integration checkpoint — 2026-11-07

The optional adapter was merged in NEURAL PR #67. The combined follow-up PR #68 was closed without merging on 2026-11-07. Its socket-retention correction is now in open draft PR #71 (head `102b2aec4a87d78bf1a5ea438184b51154ef0f86`). On that exact head, Python 3.11 and 3.12 each passed 377 tests; Ruff, pip-audit, container build, runtime-image verification, CodeQL, and Cloudflare Worker preview passed. The AI Review Policy check failed because the required current-head formal CodeAnt review was missing. The wildcard-origin rejection from closed PR #68 was not carried into PR #71 and remains absent from current main; it needs a separate security-reviewed correction. Cloudflare deploy and smoke jobs were skipped. PR #71's head is unsigned, and the active NEURAL main ruleset requires signed commits. No authorized Dynamo endpoint, GPU host, Kubernetes cluster, CUDA/driver tuple, live readiness check, inference receipt, security canary, or rollback evidence has been supplied. Keep deployment status **NOT VERIFIED** until those artifacts exist.
