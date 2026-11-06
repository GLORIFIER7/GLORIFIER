# GLORIFIER-NEURAL integration contract

## Decision

Keep `GLORIFIER7/GLORIFIER` as the governance/control plane and `GLORIFIER7/GLORIFIER-NEURAL` as a separately deployable Python/FastAPI inference and task-orchestration service. Integrate through a narrow, authenticated API boundary; do not copy the Neural application into the Worker or treat a passing CI run as proof that inference is live.

## Current evidence

- GLORIFIER's Cloudflare Worker serves the frontend and selected native APIs. Its current backend proxy is configured separately through `GLORIFIER_BACKEND_ORIGIN`; unported routes fail closed when that setting is absent.
- GLORIFIER-NEURAL exposes `GET /health`, `GET /ready`, and a protected `POST /v1/tasks`. The task endpoint returns 503 when `GLORIFIER_API_TOKEN` is absent, compares bearer tokens in constant time, rate-limits authenticated requests, and denies financial, wallet-signing, minting, destructive, production-write, and unknown action classes by default.
- Read-only public probes on 2026-11-06 returned `/health` with process `VERIFIED`; provider, database, and PyTorch checks on that endpoint remained `NOT VERIFIED`. The separate `/ready` response reported overall `READY`, with provider access, database connectivity, authentication configuration, and rate limiting `VERIFIED`; optional audit and task-run persistence remained unconfigured.
- The `/ready` response explicitly returned `inference_performed=false`. No prompt was submitted and no live inference or API charge was triggered.
- The GLORIFIER public `/api/runtime-verification` response reported `checks.neural.status=not-configured`, and `/api/neural/health` returned HTTP 503 because the production Worker did not yet contain the Neural origin/allowlist settings.

The Neural service is deployed and ready for authenticated task execution, but its live inference path has not been exercised.

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
| `/api/neural/v1/tasks` | `/v1/tasks` | POST | Require a non-empty caller bearer token; forward it unchanged; preserve upstream status and JSON body |

Do not add a generic arbitrary-path proxy. Restrict the adapter to these exact paths and methods, reject all other methods with 405, use an explicit HTTPS origin and an independent exact-host allowlist, and never silently fall back to Railway, Vercel, another provider, or an unconfigured host. Strip hop-by-hop headers, avoid caching responses, and use a bounded upstream timeout. The task endpoint accepts only `application/json` or `application/*+json`, buffers no more than 65,536 bytes (64 KiB), rejects oversized declared or observed request bodies with `413 REQUEST_BODY_TOO_LARGE`, and rejects unsupported media types with `415 UNSUPPORTED_MEDIA_TYPE`. The language-neutral schema is published in [the OpenAPI contract](./openapi/glorifier-neural-adapter.openapi.json); it must remain in sync with the separate Neural service's Pydantic task schema. Do not log authorization headers or task bodies. The corresponding branch tests must pass before this limit is considered verified.

## Configuration contract

- `GLORIFIER_NEURAL_ORIGIN`: server-side Cloudflare Worker variable containing only the reviewed HTTPS origin (scheme + host, no credentials, path, query, or fragment).
- `GLORIFIER_NEURAL_ALLOWED_HOSTS`: comma-separated, exact-match hostnames authorized for Neural egress. The origin hostname must appear in this list; wildcards are not accepted. Missing or mismatched allowlists fail closed.
- `GLORIFIER_BACKEND_ALLOWED_HOSTS`: comma-separated, exact-match hostnames authorized for the separately configured legacy backend. Missing or mismatched allowlists fail closed. Configure this alongside `GLORIFIER_BACKEND_ORIGIN` before enabling backend-dependent routes.
- Neural deployment secret `GLORIFIER_API_TOKEN`: unique token configured in the Neural runtime secret manager; never commit it, put it in frontend code, or paste it into logs/chat.
- The Worker adapter must not inject a global privileged token into unauthenticated public requests. Caller authorization is forwarded only when the caller supplies a bearer token, and Neural must validate it.
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

**Worker adapter:** IMPLEMENTED in GLORIFIER source. It retains the fixed three-route mapping, exact HTTPS origin validation, exact-host allowlist, caller bearer-token forwarding, 64 KiB request cap, timeout, status preservation, correlation IDs, and no arbitrary-path proxy.

**NEURAL service:** public read-only probes on 2026-11-06 returned /health with process VERIFIED, and /ready with overall READY; provider access, database connectivity, authentication configuration, and rate limiting were VERIFIED. Optional audit and task-run persistence remained unconfigured. The readiness response explicitly reported inference_performed=false; no prompt was submitted.

**Repository wiring:** PR #675 merged on 2026-11-06 at 04:18:31Z, merge commit 6075c598ec04475f5697f3e420d3cef173527b7a. The merged main Wrangler configuration now sets the production Neural origin to https://glorifier-neural.glorifier.workers.dev with an exact hostname allowlist. Preview origin and allowlist values are empty. The test contract is called by npm run test:cloudflare-worker.

**Production deployment remains NOT VERIFIED.** A subsequent read-only Cloudflare inspection on 2026-11-06 found the active GLORIFIER deployment still serving Worker version 910 (a9cb3c32-e9ea-44f5-b8f1-2a4531e88aac) at 100% traffic. That active version binding inventory does not contain GLORIFIER_NEURAL_ORIGIN or GLORIFIER_NEURAL_ALLOWED_HOSTS. The public /api/runtime-verification probe continued to report checks.neural.status=not-configured; /api/neural/health and /api/neural/ready returned HTTP 503. The script-settings endpoint reports the newer Wrangler values, but that metadata is not proof they are present in the active version or receiving production traffic.

**Release control:** the checked-in cloudflare-worker.yml is the required production release path. It requires a workflow dispatch from main, explicit deploy_production=true, CLOUDFLARE_DEPLOY_ENABLED=true, and valid production credentials. The connected GitHub tools in this session do not expose workflow dispatch. No direct Cloudflare upload, settings mutation, deployment promotion, or traffic change was performed. Do not bypass this gate.

**Task execution and cost:** the protected POST /api/neural/v1/tasks route requires the caller's valid Neural bearer token, forwards it unchanged, and is additionally rate-limited and policy-gated by Neural. No token was exposed, no task was submitted, no model inference occurred, and no provider spend was triggered. End-to-end task execution therefore remains NOT VERIFIED.

**ChatGPT client boundary:** custom MCP server connections and full MCP access are available on ChatGPT Business and Enterprise/Edu on web; Pro has read/fetch permissions only. The current Go plan is not eligible for custom MCP server connections. The existing GLORIFIER /mcp endpoint is also a fixed-scope, read-only GitHub bridge, not a model-inference gateway. See OpenAI's custom MCP availability documentation: https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt.

**Remaining verification:** deploy the merged current-main source through the protected release workflow, verify the active Worker version contains the Neural variables, then re-run read-only health/readiness checks. Separately implement and authorize OAuth 2.1 for any future ChatGPT MCP connection, and only then perform a bounded, explicitly approved inference test.
