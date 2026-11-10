# GLORIFIER-NEURAL integration contract

## Decision

Keep `GLORIFIER7/GLORIFIER` as the single authoritative source repository and governance/control plane. Maintain NEURAL at `services/neural/` as a separately deployable Python/FastAPI inference and task-orchestration service. The monorepo does not collapse the runtimes: Node.js/TypeScript and Python retain independent dependency locks, tests, containers, deployment workflows and health checks. Integrate through a narrow, authenticated API boundary; do not copy the Neural application into the GLORIFIER Worker or treat a passing CI run as proof that inference is live.

## Current evidence

- GLORIFIER's Cloudflare Worker serves the frontend and selected native APIs. Its current backend proxy is configured separately through `GLORIFIER_BACKEND_ORIGIN`; unported routes fail closed when that setting is absent.
- GLORIFIER-NEURAL exposes `GET /health`, `GET /ready`, and a protected `POST /v1/tasks`. The task endpoint returns 503 when `GLORIFIER_API_TOKEN` is absent, compares bearer tokens in constant time, rate-limits authenticated requests, and denies financial, wallet-signing, minting, destructive, production-write, and unknown action classes by default.
- Read-only public probes on 2026-11-06 returned `/health` with process `VERIFIED`; provider, database, and PyTorch checks on that endpoint remained `NOT VERIFIED`. The separate `/ready` response reported overall `READY`, with provider access, database connectivity, authentication configuration, and rate limiting `VERIFIED`; optional audit and task-run persistence remained unconfigured.
- The `/ready` response explicitly returned `inference_performed=false`. No prompt was submitted and no live inference or API charge was triggered.
- Historical 2026-11-06 observation: GLORIFIER runtime verification reported Neural as not configured. This is superseded by the 2026-11-09 observation: active production Worker v994 contains the HTTPS origin and exact-host allowlist but lacks the `GLORIFIER_NEURAL` service binding; PR #774 merged the binding repair to `main`, pending the protected production release.

The standalone NEURAL `/ready` endpoint reported READY on 2026-11-09, but no authenticated task or inference was executed. The GLORIFIER-to-NEURAL proxy remains degraded until the merged service-binding repair is deployed and the proxy endpoints pass read-only smoke tests.

## Proposed request flow

```text
GLORIFIER UI / trusted caller
  -> GLORIFIER Cloudflare Worker (public control plane)
  -> dedicated /api/neural/* adapter
  -> configured HTTPS GLORIFIER_NEURAL_ORIGIN
  -> GLORIFIER-NEURAL FastAPI
  -> configured provider adapter only when explicitly enabled
```

The Worker remains responsible for public routing, GLORIFIER identity, policy, and caller-facing governance. Neural handles bounded task orchestration and reports structured results/evidence. A provider is not automatically enabled by connecting the API.

## API mapping

| GLORIFIER path | Neural upstream | Method | Rule |
| --- | --- | --- | --- |
| `/api/neural/health` | `/health` | GET, HEAD | Read-only process status only; must not imply provider/database readiness |
| `/api/neural/ready` | `/ready` | GET, HEAD | Preserve 503 until Neural itself reports ready |
| `/api/neural/v1/tasks` | `/v1/tasks` | POST | Legacy caller bearer tokens are forwarded unchanged. For an authenticated internal GLORIFIER service caller, validate the inbound service token at GLORIFIER and use the separate Worker-held `GLORIFIER_API_TOKEN` downstream; preserve upstream status and JSON body |

Do not add a generic arbitrary-path proxy. Restrict the adapter to these exact paths and methods, reject all other methods with 405, use an explicit HTTPS origin and an independent exact-host allowlist, and never silently fall back to Railway, Vercel, another provider, or an unconfigured host. Strip hop-by-hop headers, avoid caching responses, and use a bounded upstream timeout. The task endpoint accepts only `application/json` or `application/*+json`, buffers no more than 65,536 bytes (64 KiB), rejects oversized declared or observed request bodies with `413 REQUEST_BODY_TOO_LARGE`, and rejects unsupported media types with `415 UNSUPPORTED_MEDIA_TYPE`. The language-neutral schema is published in [the OpenAPI contract](./openapi/glorifier-neural-adapter.openapi.json); it must remain in sync with the separate Neural service's Pydantic task schema. Do not log authorization headers or task bodies. The corresponding branch tests must pass before this limit is considered verified.

## Configuration contract

- `GLORIFIER_NEURAL_ORIGIN`: server-side Cloudflare Worker variable containing only the reviewed HTTPS origin (scheme + host, no credentials, path, query, or fragment).
- `GLORIFIER_NEURAL_ALLOWED_HOSTS`: comma-separated, exact-match hostnames authorized for Neural egress. The origin hostname must appear in this list; wildcards are not accepted. Missing or mismatched allowlists fail closed.
- `GLORIFIER_BACKEND_ALLOWED_HOSTS`: comma-separated, exact-match hostnames authorized for the separately configured legacy backend. Missing or mismatched allowlists fail closed. Configure this alongside `GLORIFIER_BACKEND_ORIGIN` before enabling backend-dependent routes.
- Neural deployment secret `GLORIFIER_API_TOKEN`: high-entropy bearer token configured in the Neural runtime secret manager; never commit it, put it in frontend code, or paste it into logs/chat.
- GLORIFIER's Cloudflare Worker must also hold the same `GLORIFIER_API_TOKEN` value as a separate secret so its trusted internal-service path can authenticate to NEURAL's public `/v1/tasks` endpoint.
- GLORIFIER's `GLORIFIER_INTERNAL_SERVICE_TOKEN` is ingress-only: validate it at the GLORIFIER Worker against `x-glorifier-internal-token`, but never use it as the NEURAL `Authorization` bearer. It must remain distinct from `GLORIFIER_API_TOKEN`.
- The Worker adapter must not inject a global privileged token into unauthenticated public requests. Legacy caller authorization is forwarded only when the caller supplies a bearer token; an authenticated internal service caller uses the Worker-held NEURAL API token, and Neural validates that token.
- Provider credentials (including NVIDIA NIM) remain in the Neural runtime secret manager. External data egress stays disabled unless the owner explicitly approves the data classification and configuration.
- Do not configure Supabase or Neon for this bridge. The bridge must not run migrations, write to databases, or synchronize records.

## Runtime-verification configuration semantics

The Worker `/api/runtime-verification` response includes a `checks.neural` object. This is a configuration-only assessment of the Neural egress boundary; it does not call the Neural service and must never be interpreted as proof of service health, authentication, provider readiness, or inference availability.

| Status | Meaning | `ok` |
| --- | --- | --- |
| `not-configured` | `GLORIFIER_NEURAL_ORIGIN` is absent | `false` |
| `invalid-origin` | Origin is not a plain HTTPS origin on the default port | `false` |
| `allowlist-not-configured` | Exact-host egress allowlist is absent | `false` |
| `not-allowlisted` | Origin host is absent from the exact-host allowlist | `false` |
| `configured-not-probed` | Origin and exact-host allowlist are syntactically configured | `null` |

Only separate read-only calls to `/api/neural/health` and `/api/neural/ready` establish upstream reachability and readiness. A 200 health response proves process liveness only; readiness remains 503 until Neural integrations are actually verified. The runtime verification endpoint deliberately does not test the task endpoint because doing so would require a caller credential and could trigger processing.

## Required implementation and release gates

1. Implement the exact route adapter and environment type in `src/worker.ts` on a separate branch.
2. Add Worker contract tests for missing/invalid origin, no-token task calls, token forwarding, body/method rejection, upstream timeout/error, JSON response handling, and the `/ready` 503 state.
3. Add a small integration smoke-test workflow using a mocked upstream by default. Any live staging probe must be explicitly configured and must not print secrets or task content.
4. Deploy Neural to a reviewed staging HTTPS origin; verify `/health`, `/ready`, invalid-token rejection, and a harmless read-only task before enabling the Worker route in staging.
5. Keep provider inference disabled until separately approved and verified. Keep consequential action classes denied; human approval remains mandatory.
6. Verify required GLORIFIER CI checks and a staging smoke test before proposing production configuration. Production deployment, secrets, provider egress, database migrations, and paid services require separate explicit approval.

## Implementation status (updated 2026-11-06)

**Worker adapter:** IMPLEMENTED in GLORIFIER source. It retains the fixed three-route mapping, exact HTTPS origin validation, exact-host allowlist, legacy caller bearer-token forwarding, separately authenticated internal-service ingress, server-held NEURAL API-token egress, 64 KiB request cap, timeout, status preservation, correlation IDs, and no arbitrary-path proxy.

**NEURAL service:** public read-only probes on 2026-11-06 returned /health with process VERIFIED, and /ready with overall READY; provider access, database connectivity, authentication configuration, and rate limiting were VERIFIED. Optional audit and task-run persistence remained unconfigured. The readiness response explicitly reported inference_performed=false; no prompt was submitted.

**Repository wiring:** PR #675 merged on 2026-11-06 at 04:18:31Z, merge commit 6075c598ec04475f5697f3e420d3cef173527b7a. The merged main Wrangler configuration now sets the production Neural origin to https://glorifier-neural.glorifier.workers.dev with an exact hostname allowlist. Preview origin and allowlist values are empty. The test contract is called by npm run test:cloudflare-worker.

**Historical next steps (2026-11-06):** the earlier CircleCI and origin-configuration checks predate the 2026-11-09 deployment observations. Current next step: deploy the already-merged PR #774 service-binding repair through the protected production workflow, then perform read-only proxy health/readiness smoke tests. Keep provider inference and consequential action classes disabled until separately approved and verified.


## Monorepo consolidation record — 2026-11-06

The NEURAL source snapshot is being consolidated from `GLORIFIER7/GLORIFIER-NEURAL` into `GLORIFIER7/GLORIFIER/services/neural/`. The migration branch imports the NEURAL `main` tree at source commit `9a32356ee4fa7d517e74db936b69312de488ae85`. The source repository remains intact during review and cutover.

This migration intentionally preserves the service boundary:

- NEURAL remains a Python/FastAPI service with its own `pyproject.toml`, `uv.lock`, Dockerfile, tests and Cloudflare Python Worker package.
- GLORIFIER root workflows own CI, security scanning, scheduled automation and deployment orchestration. NEURAL-specific workflows run from the root and target `services/neural/**`.
- The existing Worker API contract, exact-host allowlist, bearer-token validation, rate limiting and fail-closed behavior remain in force.
- The existing NEURAL Cloudflare Worker name, deployment configuration and secret names are not changed by repository consolidation.
- No production deployment, secret rotation, provider egress change, database migration, wallet signing, asset transfer or paid action is performed by this source migration.

**History limitation:** this migration imports a content snapshot tied to the exact source commit above; it does not transplant the full NEURAL commit graph or rewrite prior commit history. The standalone source repository must remain available until the snapshot passes CI, deployment parity is verified, open PR work is reconciled, and any separately required history-preservation operation is completed.

**Cutover gates:** (1) all NEURAL files and tests are present under `services/neural/`; (2) root NEURAL CI, Cloudflare dry-run and disposable database migration workflows pass; (3) GLORIFIER Worker-to-NEURAL staging calls pass health, readiness, invalid-token rejection and harmless read-only task checks; (4) production deployment parity and rollback are documented; (5) open NEURAL PRs #62 and #63 are migrated or deliberately closed only after their changes are accounted for. Do not archive or delete the standalone source repository before these gates pass.
**Release state:** PR #675 is a source/configuration change only. It does not deploy or mutate the production Cloudflare Worker. Production remains behind the protected `workflow_dispatch` release gate. After merge, the owner must dispatch `.github/workflows/cloudflare-worker.yml` from `main` with `deploy_production=true` and ensure `CLOUDFLARE_DEPLOY_ENABLED=true`; then verify the deployed `/api/neural/health`, `/api/neural/ready`, and runtime verification endpoints.
**Production deployment remains NOT VERIFIED.** A subsequent read-only Cloudflare inspection on 2026-11-06 found the active GLORIFIER deployment still serving Worker version 910 (a9cb3c32-e9ea-44f5-b8f1-2a4531e88aac) at 100% traffic. That active version binding inventory does not contain GLORIFIER_NEURAL_ORIGIN or GLORIFIER_NEURAL_ALLOWED_HOSTS. The public /api/runtime-verification probe continued to report checks.neural.status=not-configured; /api/neural/health and /api/neural/ready returned HTTP 503. The script-settings endpoint reports the newer Wrangler values, but that metadata is not proof they are present in the active version or receiving production traffic.

**Release control:** the checked-in cloudflare-worker.yml is the required production release path. It requires a workflow dispatch from main, explicit deploy_production=true, CLOUDFLARE_DEPLOY_ENABLED=true, and valid production credentials. The connected GitHub tools in this session do not expose workflow dispatch. No direct Cloudflare upload, settings mutation, deployment promotion, or traffic change was performed. Do not bypass this gate.

**Task execution and cost:** the protected POST /api/neural/v1/tasks route requires the caller's valid Neural bearer token, forwards it unchanged, and is additionally rate-limited and policy-gated by Neural. No token was exposed, no task was submitted, no model inference occurred, and no provider spend was triggered. End-to-end task execution therefore remains NOT VERIFIED.

**ChatGPT client boundary:** custom MCP server connections and full MCP access are available on ChatGPT Business and Enterprise/Edu on web; Pro has read/fetch permissions only. The current Go plan is not eligible for custom MCP server connections. The existing GLORIFIER /mcp endpoint is also a fixed-scope, read-only GitHub bridge, not a model-inference gateway. See OpenAI's custom MCP availability documentation: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt.

**Remaining verification:** deploy the merged current-main source through the protected release workflow, verify the active Worker version contains the `GLORIFIER_NEURAL` service binding (the origin and exact-host allowlist are already present in the observed v994), then re-run read-only proxy health/readiness checks. Separately implement and authorize OAuth 2.1 for any future ChatGPT MCP connection, and only then perform a bounded, explicitly approved inference test.


## Live evidence reconciliation — 2026-11-09

This checkpoint supersedes earlier statements in this document that the production Neural origin/allowlist were absent or that the public GLORIFIER proxy health routes returned only the old `NEURAL_ORIGIN_NOT_CONFIGURED` response. Earlier entries remain as historical observations.

- **Standalone NEURAL deployment:** Cloudflare read-only deployment inventory shows `glorifier-neural` Worker version 33 at 100% traffic (deployment `3d97535a-efc5-45b3-b5a3-be2bb4afda5c`, created `2026-11-09T11:40:45.754352Z`).
- **Direct process health:** unauthenticated `GET https://glorifier-neural.glorifier.workers.dev/health` returned HTTP 200 at `2026-11-09T15:33:43Z`, with process VERIFIED but provider, database, and PyTorch reported NOT VERIFIED on the health endpoint.
- **Direct readiness:** unauthenticated `GET https://glorifier-neural.glorifier.workers.dev/ready` returned HTTP 200 and status READY at `2026-11-09T15:33:47Z`. Providers, database, authentication, and rate-limit configuration were reported VERIFIED; optional audit and task-run persistence were not configured. The response explicitly reported `inference_performed=false`.
- **GLORIFIER proxy:** unauthenticated GETs to `/api/neural/health` and `/api/neural/ready` on the GLORIFIER Worker returned HTTP 404 with Cloudflare error 1042 at `2026-11-09T15:33:23Z` and `15:33:25Z`. Cloudflare documents 1042 as a same-zone Worker-to-Worker fetch restriction unless the documented compatibility behavior is enabled.
- **Active GLORIFIER release:** Cloudflare inventory shows version 994 at 100% traffic, created `2026-11-09T01:53:21.985954Z`, associated with release commit `ba13862ac05ae26dc5096c4774c52a10a4e9d1ab`. It has the configured origin and exact-host allowlist but not the `GLORIFIER_NEURAL` service binding.
- **Merged source repair:** [GLORIFIER PR #774](https://github.com/GLORIFIER7/GLORIFIER/pull/774) merged at `2026-11-09T14:48:42Z`. Current main declares the `GLORIFIER_NEURAL` Cloudflare service binding in `wrangler.jsonc`; `src/worker.ts` calls that binding's `fetch()`. This source repair is not reflected in active production version 994 yet.
- **Release control:** Production deployment remains behind the protected manual workflow gate requiring `workflow_dispatch`, `deploy_production=true`, `CLOUDFLARE_DEPLOY_ENABLED=true`, and the production environment. No deployment was triggered as part of this checkpoint.

**Current conclusion:** the standalone NEURAL service is directly reachable and reports readiness, but the public GLORIFIER-to-NEURAL proxy is still degraded because the active GLORIFIER production version predates the merged service-binding repair. Readiness does not mean model inference, authenticated task execution, or end-to-end interoperability has been tested.


## Post-merge deployment gate — 2026-11-09 15:48 UTC

NEURAL main commit `92d209544c02a3bf9c6f45eeb9d459b4a468426b` passed Python 3.11/3.12 CI and CodeQL, and Cloudflare bundle preparation/validation succeeded. The Cloudflare Workers Builds production deployment then failed because the required `GLORIFIER_INTERNAL_SERVICE_TOKEN` secret was not configured. The workflow skipped its post-deploy health/readiness smoke steps; the newer commit was not released by this build.

The internal service token is a separate credential and must be different from `GLORIFIER_API_TOKEN` (the merged PR #83 code rejects equality). Provision a unique value directly in the Cloudflare secret manager using the authorized owner workflow; never commit or disclose its value. After provisioning, retry the approved Cloudflare deployment and verify the deployed version, /health, /ready, and the GLORIFIER service-binding proxy independently. Until then, retain the deployment and end-to-end integration status as DEGRADED / NOT VERIFIED.

The six source/test files changed by NEURAL PR #83 were verified byte-for-byte identical to their counterparts under `GLORIFIER/services/neural/` on main. This verifies repository source synchronization, not the production release.


## Production auto-deploy control — 2026-11-09

A read-only Cloudflare Workers Builds API inspection found the `glorifier-neural` production build connected to repository branch `main`, with `auto_build_enabled=true` and production deploy command `bash ./worker-build.sh deploy`. This path attempted to deploy commit `92d209544c02a3bf9c6f45eeb9d459b4a468426b` on a push event.

This is separate from the repository's guarded `workflow_dispatch` job, which requires `deploy=true`, branch `main`, and the protected `glorifier-neural-cloudflare-production` environment. The account-level auto-build configuration can therefore bypass that manual release gate if required secrets are later provisioned.

Before provisioning `GLORIFIER_INTERNAL_SERVICE_TOKEN`, an authorized owner should change the Cloudflare Workers Builds production command to `bash ./worker-build.sh --prepare-only && npx wrangler versions upload` (or disable production auto-build). Cloudflare documents that `wrangler versions upload` creates a version without routing traffic; the separate protected GitHub `workflow_dispatch` should remain the only path to `wrangler versions deploy` / production traffic promotion. The main GLORIFIER Worker already uses `wrangler versions upload` in its Workers Builds production command. Preview builds may remain independently enabled. This external configuration is not mutated by this repository PR.


## Superseding production configuration observation — 2026-11-10T23:42:17.818Z

Observation time: 2026-11-10T23:42:17.818Z UTC / 2026-11-11T06:42:17.818+07:00 Asia/Vientiane. This read-only inventory updates the 2026-11-10 production configuration snapshot recorded in docs/architecture/interoperability-gap-register.md where values differ. Only active deployment metadata, non-secret settings, binding names, and secret names were read; no secret values were accessed.

- GLORIFIER remains at 100% traffic on deployment 3292d6bf-d40c-4682-9b6d-ff5faf41aa1b, Worker version 12b2bfdc-ef46-436b-8f54-bab5e246ec5f. It has the configured origin and exact-host allowlist but still lacks the GLORIFIER_NEURAL service binding declared on GLORIFIER main c54c35e0353457f29cc966dea8db098978fcde1d.
- NEURAL remains at 100% traffic on deployment 3d97535a-efc5-45b3-b5a3-be2bb4afda5c, Worker version cfef05f3-1729-4583-a523-9cf7d43d3860. Its active non-secret settings still have inference and external data egress enabled; the new paid-inference authorization variable is absent.
- GLORIFIER secret names still lack GLORIFIER_API_TOKEN and GLORIFIER_INTERNAL_SERVICE_TOKEN. NEURAL has a GLORIFIER_API_TOKEN binding but lacks GLORIFIER_INTERNAL_SERVICE_TOKEN. Values were not read.
- GLORIFIER source main has the service-binding configuration and mirrored paid-inference default-deny code. The standalone NEURAL main remains 92adf8c3dee0371b197edde8e1f64f5d2052d3f0; PR #86 has 427 passing tests on both Python 3.11 and 3.12 but remains blocked by mandatory signed commits, failed AI review policy checks, and missing formal approval. The source repair is not active production configuration.

**Required disposition:** keep the route and runtime readiness DEGRADED. Owner-controlled credential staging, source review, and protected production releases remain mandatory. Restore inference and external egress to false before any provider workload; do not submit a prompt or task. Do not change active settings or secrets or upload/promote Worker versions outside the approved release path. No provider request, inference, task submission, secret mutation, production deployment, database mutation, or financial action was performed. Configuration inventory is not a process/health probe.
