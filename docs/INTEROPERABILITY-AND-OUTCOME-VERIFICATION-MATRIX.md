# GLORIFIER Interoperability and Execution Verification Matrix

Date: 2026-11-06  
Scope: evidence gates for the ten requested verification targets.

## Status policy

Use only `FULLY VERIFIED`, `VERIFIED`, `PARTIALLY VERIFIED`, `NOT VERIFIED`, `DEGRADED`, or `NOT OBSERVABLE`. A test plan, documentation review, mock, build, or successful provider response is not runtime or outcome verification. Each passing status must link to dated test output, commit/runtime identity, environment, and an evidence artifact. Missing evidence remains `NOT VERIFIED`.

## Required gates

| Target | Evidence required before VERIFIED | Current status |
|---|---|---|
| A2A v1.0 conformance | Run the official A2A Technology Compatibility Kit (TCK) against GLORIFIER's actual client/server adapters; retain suite revision, transport, test report, and failures. Verify version negotiation, task lifecycle, errors, streaming, auth behavior, and declared bindings. | NOT VERIFIED |\n| A2A v1.0 implemented surface (unit/HTTP level) | `SendMessage` create/continue, `GetTask`, requester-scoped `ListTasks`, durable keyset pagination, message/task ownership tests, and JSON-RPC HTTP adapter tests. Does not imply full TCK conformance. | PARTIALLY VERIFIED (branch CI pending) |
| MCP 2025-11-25 compatibility | Run the official MCP conformance suite with the frozen `2025-11-25` requirement set against the actual adapter. Cover initialization/version negotiation, supported tools/resources/prompts, errors, cancellation, transport, and OAuth roles implemented by GLORIFIER. Retain exact SDK versions and report. | NOT VERIFIED |
| MCP 2026-07-28 compatibility | Run the official MCP conformance suite with the frozen `2026-07-28` requirement set separately. Test stateless per-request version/context and `server/discover` where applicable. Do not infer this from a 2025-11-25 pass. | NOT VERIFIED |
| MCP 2026-07-28 local HTTP subset | Worker tests cover `server/discover`, per-request version and client-capabilities metadata, `Mcp-Method`/`Mcp-Name` validation, unsupported-version/header error statuses, and modern method-not-found HTTP behavior. This is bounded local contract evidence only. | PARTIALLY VERIFIED (PR #661 exact-head CI pending) |
| A2A cryptographic identity | Validate Agent Card JWS signatures against configured trusted keys; test unknown key, invalid signature, key rotation, expiry/revocation policy, TLS identity, replay, and authorization separation. A valid signature authenticates a key, not business authority. | NOT VERIFIED |
| Runtime sandbox and quarantine | In an isolated canary, prove default-deny egress, filesystem/process isolation, resource ceilings, least-privilege credentials, operator-triggered stop, interruption of active work where supported, and auditable quarantine. Test denied actions as well as allowed ones. | NOT VERIFIED |
| Self-hosted vLLM adapter contract | Verify exact HTTPS origin allowlisting, unsafe-origin rejection, explicit inference/egress gates, authenticated `/v1/models` readiness, and bounded non-streaming inference. This proves adapter contract behavior only, not a running GPU or live inference endpoint. | PARTIALLY VERIFIED — PR #672 commit `35085d6b7cf9f54f55afe32177935ed04c01c6d8`; Python 3.11/3.12 tests, Ruff, dependency audit, and image build passed in [NEURAL Service CI run #42162526713](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/42162526713). Follow-up workflow-bootstrap corrections remain under validation. |
| Kubernetes/GPU deployment | Deploy to an authorized non-production cluster; retain manifests, image digests, GPU/driver/CUDA/Kubernetes versions, readiness/liveness results, resource limits, network policy, scheduling evidence, and rollback result. | NOT VERIFIED |
| NVIDIA Dynamo deployment | Prove a real deployment with exact Dynamo image/release digest, backend/model, CUDA/driver/GPU, OS/architecture and Kubernetes/operator tuple; verify GPU visibility/scheduling, authenticated model readiness, authorized inference, security controls and rollback; retain logs/artifact digests. A merged HTTP adapter alone is not a deployment. | NOT VERIFIED — adapter source merged in NEURAL PR #67; follow-up sync transport/wildcard-origin fix remains draft in [PR #68](https://github.com/GLORIFIER7/GLORIFIER-NEURAL/pull/68); no GPU-backed deployment or live inference evidence. |
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

The optional adapter was merged in NEURAL PR #67. Follow-up open PR #68 (ready for review, not merged) fixes a reproduced synchronous HTTP/1.0 close-after-response failure and rejects wildcard origins. On exact head `8b21a25d454313888fba0bd33f3b5b17d431276f`, Python 3.11/3.12 jobs, Ruff, pytest, pip-audit, container build, CodeQL, and Cloudflare Worker validation passed; AI Review Policy failed for missing current-head formal AI reviews, and Cloudflare deploy/smoke jobs were skipped. The PR remains open and unmerged; commit-signature and human-review gates remain open. No authorized Dynamo endpoint, GPU host, Kubernetes cluster, CUDA/driver tuple, live readiness check, inference receipt, security canary, or rollback evidence has been supplied. Keep deployment status **NOT VERIFIED** until those artifacts exist.
