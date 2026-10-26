# AMD + GitHub workstreams: audit baseline

**Checkpoint:** 2026-10-26  
**Repository:** `GLORIFIER7/GLORIFIER`  
**Status:** `PARTIALLY VERIFIED` — source/configuration audit only; no AMD hardware benchmark or local-runtime integration was executed.

This document records the evidence and safety gates for the three requested workstreams. It is not a claim that AMD acceleration is enabled or that local inference has been validated.

## 1. Repository and CI audit (first)

### Evidence inspected

- Repository metadata identifies `GLORIFIER7/GLORIFIER` as public, unarchived, with default branch `main`; the connected GitHub integration reported push/admin permissions. No merge or deployment was performed.
- The inspected `package.json` declares a TypeScript/React/Node application. Relevant commands include `npm run lint` (TypeScript no-emit), `npm run build` (frontend build), and `npm run test:nvidia-provider` (mocked provider test).
- `src/lib/ai/registry.ts` registers cloud/OpenAI-compatible providers including OpenAI, NVIDIA, OpenRouter, and Ollama. The inspected provider list contains no AMD or Lemonade provider.
- `src/lib/ai/providers/nvidia-provider.test.ts` explicitly tests a mocked fetch and labels the result “mocked inference only; live inference not verified.”
- The current source search did not find an AMD/ROCm/Lemonade integration in the indexed default-branch files. A search result is not a complete repository-wide absence proof.
- The open-PR search returned no open PRs at the time of the query. The open-issue search surfaced issue #471 (interoperability), #432 (Cloudflare/Supabase/Neon parity), #411 (infrastructure health), and #94 (Solana Devnet reconciliation). These are existing work items, not AMD-specific findings.
- For commit `40a5a74788d68e759a066e361a35680d5d46f3a0`, the GitHub combined-status endpoint returned two statuses: Vercel = `success`, CircleCI `validate-cloudflare-worker` = `success`. This is a point-in-time status response for that SHA, not proof that every required check, security scan, production route, or current `main` head is green.

### Audit conclusion

The repository has a provider-neutral orchestration path and an OpenAI-compatible provider abstraction, but the inspected evidence does not establish AMD inference, ROCm availability, a Lemonade runtime, AMD GPU throughput, or production readiness. Keep these claims `NOT VERIFIED` until an exact implementation and matching test/benchmark evidence exist.

## 2. AMD inference / GPU optimization

### Current state

- No AMD GPU/Instinct device, ROCm runtime, or AMD benchmark runner was available to this repository audit.
- No inference benchmark was run; no tokens/sec, latency, memory, utilization, or throughput gain is claimed.
- The ordinary repository build and TypeScript tests are CPU-oriented and are not evidence of GPU acceleration.

### Safe optimization protocol

1. Identify a real target device and runtime first (e.g. supported AMD Instinct + ROCm/vLLM, or supported Radeon/Ryzen AI + Lemonade). Do not conflate these hardware/runtime paths.
2. Record the model and exact revision, prompt/input and output lengths, precision/quantization, batch/concurrency, context length, warm-up policy, hardware/driver/runtime versions, and power/thermal conditions.
3. Establish a repeatable baseline before tuning. Record median and tail latency, throughput, peak memory, errors, and model quality checks.
4. Change one bounded variable at a time; retain a reproducible configuration and raw benchmark artifact. Compare results against the baseline and reject regressions.
5. Keep GPU benchmarks opt-in and separate from ordinary CI unless a trusted, already-available self-hosted AMD runner exists. Do not provision paid hardware or start cloud GPU jobs without explicit approval.

**Status:** `NOT VERIFIED` — hardware-specific optimization is blocked on a target AMD device/runtime and repeatable baseline evidence.

## 3. AMD local AI integration

### Current state

The app's inspected provider registry has an OpenAI-compatible abstraction, but no Lemonade entry or tested local-runtime lifecycle. The repository is a web/API application with a stated Cloudflare Worker migration, and its package also contains Android/Capacitor scripts. The AMD Embeddable Lemonade integration instructions target Windows x64/Linux x64 (macOS support is described separately); they do not establish a supported Android/Worker deployment path.

A desktop-only embeddable binary must not be added to the generic app bundle or deployed to a Worker. A browser frontend calling loopback also needs explicit browser-origin, CORS/private-network, authentication, and lifecycle testing; a backend-side localhost URL would refer to the server host, not the end user's device.

### Safe implementation sequence

1. Choose and document the target first: desktop Windows/Linux, end-user browser-to-local-server, Android/on-device, or a remote inference service. These are different architectures.
2. Keep local inference opt-in; do not silently route prompts to a local or remote endpoint and do not weaken GLORIFIER's governed provider eligibility/fallback policy.
3. Before implementation, define endpoint ownership and trust boundaries. Use loopback-only binding for a local subprocess, a fresh per-process API key, explicit readiness probing, bounded startup/request timeouts, model-pull state, cancellation/shutdown cleanup, and redacted logs.
4. Keep user-provided endpoints separate from built-in local endpoints. Validate allowed origins and prevent server-side requests to arbitrary/private network destinations; do not turn provider configuration into an SSRF or credential-forwarding path.
5. Add unit tests for configuration selection, missing model/health, auth failure, timeout, empty responses, and cleanup. Add opt-in integration tests only when the selected runtime is installed. Verify that no cloud key is required in local mode and that cloud/local selection does not silently change.
6. Bundle a runtime only after target OS/architecture support, licensing, artifact integrity, package size, updates, and model-download behavior have been reviewed.

**Status:** `NOT VERIFIED` — integration target is not selected and runtime/device tests have not run. This PR intentionally does not vendor binaries, download models, change provider routing, or add an untested endpoint.

## Acceptance gates for follow-up implementation

- [ ] A named, available target AMD device and supported runtime are recorded.
- [ ] Baseline benchmark artifact and exact environment metadata are retained.
- [ ] Any throughput/latency claim is supported by repeated measurements and no material quality regression.
- [ ] Local AI target platform is explicitly selected and supported.
- [ ] Provider-selection, authorization, timeout, empty-result, and lifecycle tests pass.
- [ ] `npm run lint`, `npm run build`, and the relevant focused tests pass on the PR commit.
- [ ] GitHub checks for the exact PR head are inspected and reported; no check is inferred from another SHA.
- [ ] No merge, deployment, secret exposure, paid provisioning, or irreversible action occurs without separate approval.

## External technical reference

AMD's Lemonade project documents local inference across supported CPU/GPU/NPU hardware and provides an embeddable runtime, but upstream product capability does not establish GLORIFIER integration or compatibility. See the [Lemonade project](https://github.com/lemonade-sdk/lemonade) and [Embeddable Lemonade guide](https://lemonade-server.ai/docs/embeddable/).
