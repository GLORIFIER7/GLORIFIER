# GLORIFIER Neural Orchestration

A governed, provider-neutral AI orchestration API built with Python and FastAPI, deployed as a Cloudflare Python Worker. The latest successful production smoke on 2026-11-05 returned HTTP 200 from `/health` and `/ready`; provider access, read-only Neon connectivity, authentication, and rate limiting were VERIFIED. A direct Cloudflare settings read-back later that day confirmed `GLORIFIER_PROVIDER=openai`, external data egress enabled, Neon connectivity enabled, and `GLORIFIER_ENABLE_INFERENCE=true`. Optional audit and task-run persistence remain unconfigured. The smoke test did not submit a prompt or perform inference, so end-to-end model execution remains NOT VERIFIED.

## License

This project is distributed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the complete terms. The license does not grant rights to use GLORIFIER names, logos, or trademarks. Third-party dependencies and assets remain subject to their respective licenses and notices.

## Current capabilities

- FastAPI liveness/status endpoint at `GET /health`.
- Evidence-based readiness endpoint at `GET /ready`: it returns HTTP 200 only after the explicitly enabled provider passes its read-only model-availability probe; missing or failed providers return HTTP 503. Neon connectivity is an optional, separately reported read-only check.
- Task request/response schemas with input limits, including a bounded action-class field.
- Enforces a 64 KiB request-body limit against both the declared `Content-Length` and streamed ASGI body chunks; keep a matching limit at the reverse proxy as defense in depth.
- Deny-by-default policy for financial actions, wallet signing, minting, destructive operations, production writes, and unknown action classes.
- Explicit provider adapter interface; OpenAI is the default provider selection. A provider may be registered for read-only readiness when external egress is explicitly enabled; task inference is separately gated by `GLORIFIER_ENABLE_INFERENCE` and external-egress consent. Local and newly provisioned environments default to inference disabled.
- OpenAI Responses API adapter (`OPENAI_API_KEY`, optional `OPENAI_MODEL`, default `gpt-6-luna`), registered for read-only readiness when `GLORIFIER_PROVIDER=openai` (or unset), the API key is configured, and `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=true`. Task inference additionally requires `GLORIFIER_ENABLE_INFERENCE=true`.
- Optional NVIDIA NIM chat-completions adapter (`NVIDIA_NIM_API_KEY`, optional `NVIDIA_NIM_MODEL`), registered for read-only readiness when NVIDIA is explicitly selected, its API key is configured, and external-egress consent is enabled. Task inference separately requires `GLORIFIER_ENABLE_INFERENCE=true`.
- Optional NVIDIA Dynamo OpenAI-compatible runtime adapter is implemented in the repository (merged in PR #67). It requires an exact HTTPS `/v1` API root, exact origin allowlist, ingress-validated bearer credential, model ID, explicit provider selection, and external-egress consent. No live GPU-backed Dynamo deployment or inference is verified; see [NVIDIA Dynamo operations and verification gates](docs/NVIDIA-DYNAMO.md).
- Constant-time comparison for bearer-token validation and fail-closed behavior when the API token is absent.
- Validated UUID-shaped `X-Correlation-ID` propagation: a valid caller-supplied value is echoed unchanged in `X-Correlation-ID` and stored as `details.correlation_id` on audit events. Invalid values are replaced with a server-generated UUID. Every response also carries a unique server-generated `X-Request-ID`, which is used as the audit-event `request_id`.
- Optional PyTorch availability check.
- Unit tests and GitHub Actions CI on Python 3.11 and 3.12.
- Container runs as a non-root user; CI builds the image without publishing it.
- Dependabot proposes weekly Python dependency and GitHub Actions updates.

## Request and correlation identifiers

`X-Correlation-ID` is a tracing/grouping value, not an authentication credential or idempotency key. The API trims the incoming header, accepts only a canonical UUID-shaped value, and echoes an accepted value byte-for-byte (including uppercase hex) in the response. A missing or invalid value is replaced by a server-generated UUID. The sanitized value is recorded separately as `details.correlation_id` on the audit event.

`X-Request-ID` is generated independently for each request, returned on every response, and stored as the audit event's `request_id`. Reusing the same valid `X-Correlation-ID` across related requests therefore never reuses the request ID or the audit key. Clients should use `X-Correlation-ID` to correlate related work and `X-Request-ID` to identify one specific server request.

## Quick start

Requires Python 3.11 or 3.12.

```bash
python -m venv .venv
# Linux/macOS
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -e ".[dev]"
ruff check .
pytest
uvicorn app.api:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/docs`. The `/health` endpoint reports process status separately from external dependencies. `/ready` performs a bounded read-only model-access check against the explicitly configured provider; OpenAI uses `GET https://api.openai.com/v1/models/{model}`, while NVIDIA NIM queries its model catalogue. These checks do not submit a prompt or execute inference. The optional Neon `SELECT 1` probe is reported separately and blocks readiness only when explicitly enabled but failing. Provider readiness is independent of inference: `/ready` validates the selected provider's read-only model-access probe and other required checks; it does not execute inference even when `GLORIFIER_ENABLE_INFERENCE=true`. Without a configured, accessible provider, provider readiness remains `NOT VERIFIED` and `/ready` returns HTTP 503.

## Cloudflare deployment

Neural is deployed as a dedicated Cloudflare Python Worker, not as a Railway service.
The Worker uses Cloudflare's Python runtime with the FastAPI ASGI entrypoint in
`cloudflare/worker.py` and the `python_workers` compatibility flag in
`cloudflare/wrangler.jsonc`. Before validation or deployment, the workflow runs
`cloudflare/prepare_worker.py` to stage the repository's `app/` package as a
local Python project under `cloudflare/neural_app/`. Pywrangler resolves that
local project dependency and vendors it into `cloudflare/python_modules/`, the
directory Cloudflare bundles for Python Workers. The workflow asserts that the
vendored package contains the API, Neon, and PyTorch adapter modules before
starting the Pyodide runtime.

The account's Workers subdomain is `glorifier`. The live Worker address is
`https://glorifier-neural.glorifier.workers.dev`. An earlier Cloudflare deployment inventory at `2026-11-05T03:58:11Z` observed
version `733211d1-6931-4fdb-a4b9-5c7482bcf9b8`; that inventory has been
superseded by the newer deployment recorded under **Current deployed state**
below. Deployment success is not itself a readiness result.

The task endpoint reads `GLORIFIER_API_TOKEN` from the Cloudflare request-scoped
`env` binding. A secret binding with this name is present on the current production
Worker; its value is not read or stored in this repository or Wrangler configuration.
The endpoint remains protected by Cloudflare Access and bearer-token validation.

The current production Worker settings, read back directly from Cloudflare on
2026-11-05 at approximately 16:28 (UTC+07:00), are
`GLORIFIER_PROVIDER=openai`,
`GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=true`,
`GLORIFIER_ENABLE_INFERENCE=true`, and
`GLORIFIER_NEON_CONNECTIVITY_ENABLED=true`. The OpenAI secret binding
`OPENAI_API_KEY` and task-authentication secret binding `GLORIFIER_API_TOKEN`
are present by name; secret values are never read from the binding inventory.
The `NVIDIA_NIM_API_KEY` binding is also present for the optional NVIDIA adapter,
but NVIDIA is not the selected production provider. External egress is enabled
for the read-only provider readiness request. The production inference flag is
now `true`, but the latest successful production smoke (GitHub Actions run
[#41987341798](https://github.com/GLORIFIER7/GLORIFIER-NEURAL/actions/runs/41987341798),
2026-11-05T07:30Z) reported HTTP 200 from `/health` and `/ready`, with provider,
read-only database connectivity, authentication, and rate limiting `VERIFIED`.
Audit and task-run persistence remain `NOT CONFIGURED (OPTIONAL)`. The smoke
response explicitly reported `inference_performed=false`; no prompt was
submitted, no inference was run, and no optional persistence writes were tested.
`/health` reports process liveness, not dependency readiness.

Pull requests build and validate the Worker bundle in GitHub Actions dry-run mode.
Cloudflare Workers Builds also has an automatic `main`-branch production deployment
path configured under `/cloudflare` with `bash ./worker-build.sh deploy`. A separate
manual GitHub Actions `workflow_dispatch` deployment path is available, gated by
`deploy=true` on `main` and the `CLOUDFLARE_API_TOKEN` secret plus
`CLOUDFLARE_ACCOUNT_ID` variable in the
`glorifier-neural-cloudflare-production` GitHub Environment.

The branch-specific Workers Builds triggers used for Dependabot PRs #38, #39, and
#40 are corrected to run from `/cloudflare`, prepare the Worker package with
`bash ./worker-build.sh --prepare-only`, and finish with
`npx wrangler deploy --dry-run`. All three corrected Cloudflare builds completed
successfully and stopped at `--dry-run`; no Preview or production version was
published. Worker preview URLs remain disabled in `cloudflare/wrangler.jsonc`.
The main-branch production deployment configuration remains unchanged.
## API access

The task endpoint is disabled unless `GLORIFIER_API_TOKEN` is configured. Set a strong, unique token in the deployment secret manager; never commit it to Git or paste it into chat. Send it as a bearer token in the Authorization header. The legacy `GLORIFIER_REQUIRE_API_TOKEN` flag cannot enable access when the token is missing.

Do not expose the service publicly without TLS, monitoring, secret rotation, and an operational incident plan. Local execution applies a bounded, process-local limit of 60 authenticated task requests per minute, keyed by a domain-separated HMAC-SHA-256 fingerprint of the bearer token; local counters reset on restart. Cloudflare Workers use the native `GLORIFIER_RATE_LIMITER` binding with a 60-request/60-second configuration and the same credential-keyed HMAC construction. Public `/ready` probes use a separate `GLORIFIER_READINESS_LIMITER` binding, limited to 10 requests per 60 seconds per Cloudflare client IP, and cache provider/database probe results for 30 seconds. Worker requests fail closed with HTTP 503 if the binding is missing or unavailable and return HTTP 429 when the binding denies a request. Cloudflare documents these counters as approximate and per-location, not a strict global quota; use a separately reviewed global coordination design if exact global quotas are required.

## Explicit inference configuration

Inference is disabled by default for local development and newly provisioned deployments. The existing production Worker was directly read back from Cloudflare on 2026-11-05 at approximately 16:28 (UTC+07:00): `GLORIFIER_ENABLE_INFERENCE=true`, `GLORIFIER_PROVIDER=openai`, and `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=true`. The `OPENAI_API_KEY` and `GLORIFIER_API_TOKEN` secret binding names are present; their values were not read. The readiness smoke check is read-only and did not call the Responses API completion endpoint. Live inference, output quality, latency, task execution, and usage-cost behavior therefore remain **NOT VERIFIED**. Authenticated task requests may send task content to OpenAI and incur separate API usage charges. A controlled live inference request must be treated as a separate operational test and must not be inferred from a successful `/ready` response. ChatGPT subscriptions and API billing are separate.
## Current deployed state — observed 2026-11-05 (UTC+07:00)

Direct Cloudflare configuration inventory was read at approximately 16:28 local time. The latest deployment inventory returned:

- Worker: `glorifier-neural`; route: `https://glorifier-neural.glorifier.workers.dev`.
- Latest deployment: `77cace04-8c1b-4a26-82b6-b4504f920625`, created `2026-11-05T07:30:11.656407Z`; 100% traffic assigned to version `ecf822d5-745e-4c33-8fc2-5c10ca83baf7`.
- Current non-secret Worker variables: `GLORIFIER_PROVIDER=openai`, `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=true`, `GLORIFIER_ENABLE_INFERENCE=true`, and `GLORIFIER_NEON_CONNECTIVITY_ENABLED=true`.
- Secret-binding inventory includes `OPENAI_API_KEY`, `GLORIFIER_API_TOKEN`, and `NVIDIA_NIM_API_KEY`. Only binding names were inspected; secret values were not read.
- The latest successful production smoke was GitHub Actions run [#41987341798](https://github.com/GLORIFIER7/GLORIFIER-NEURAL/actions/runs/41987341798), around `2026-11-05T07:30Z`. It confirmed `/health` HTTP 200 and `/ready` HTTP 200 with `status: READY`; provider, database connectivity, authentication, and rate limiting were `VERIFIED`.
- That smoke response reported `inference_performed=false`. No prompt was submitted and no model inference was executed.
- Audit and task-run persistence remain `NOT CONFIGURED (OPTIONAL)`; no optional persistence write was tested.

Conclusion: Cloudflare deployment and the configured read-only production readiness checks are **VERIFIED**. The production inference flag and external-egress consent are configured `true`, but live inference, inference quality, end-to-end task execution, optional audit/task-run writes, and externally verified economic outcomes remain **NOT VERIFIED**. Do not infer successful model execution from a successful readiness probe.
## Database foundation

A PostgreSQL-compatible audit schema starter is in `db/supabase/migrations/0001_audit_events.sql`. It is **not applied automatically**. The API can write sanitized audit events only when `GLORIFIER_AUDIT_ENABLED=true` and `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` are configured. The `glorifier` schema must be exposed in Supabase API settings. If the initial audit write fails, task processing is blocked; if the final write fails, the API returns HTTP 503 and flags that audit status needs inspection. Do not enable this against production until the migration, schema exposure, access controls, backup, and staging test are reviewed. Review `db/README.md`. Production has the read-only `NEON_READONLY` Hyperdrive binding and a configured connectivity probe. The live `/ready` response on 2026-11-05 returned HTTP 200 with `database: VERIFIED` and overall `READY`. This reflects the bounded read-only Hyperdrive connectivity check only; it does not verify application-data reads/writes or audit/task-run persistence. The asynchronous `asyncpg` Hyperdrive path uses a bounded 15-second connection timeout and executes only read-only `SELECT 1`. This verifies connectivity only; it does not verify application-data reads/writes, schema availability, or audit/task-run persistence.

## Explicit limitations

- OpenAI is the default provider selection, with `gpt-6-luna` as the configurable default model. The adapter is registered for read-only readiness when external egress is authorized and the secret stays server-side. Task inference still requires its independent enable flag.
- OpenAI readiness uses a bounded, authenticated `GET /v1/models/{model}` request and verifies that the API key can access the selected model. This proves model-access reachability only, not inference quality, latency, capacity, SLA, or factual correctness. Actual inference remains a separate controlled staging check; readiness never sends task content.
- NVIDIA NIM remains an optional explicitly selected alternative. Its readiness uses a bounded, authenticated model-catalogue request. Live provider inference remains NOT VERIFIED until a controlled staging check succeeds.
- Neon has an optional, read-only connectivity probe. Install `.[neon]` for local execution (the Docker image includes this extra), set `GLORIFIER_NEON_CONNECTIVITY_ENABLED=true` and `NEON_DATABASE_URL` in the deployment secret manager to make `/ready` run a bounded `SELECT 1` using certificate-verified TLS (`sslmode=verify-full`, system trust roots) and required channel binding. This does not create schemas or write data. The probe is disabled by default and is not proof of application-data readiness. The audit database integration remains optional and must be separately verified before it is treated as operational.
- No Supabase migration, Neon application-data schema, dual-write, or reconciliation is implemented.
- Supabase audit writes are opt-in through `GLORIFIER_AUDIT_ENABLED=true`, `SUPABASE_URL`, and server-side `SUPABASE_SERVICE_ROLE_KEY`; the API writes a sanitized pre-execution event before processing and a result event afterward. Audit persistence has not been verified against a live project.
- No autonomous financial actions, wallet signing, minting, or irreversible production changes are enabled.
- CI runs lint, tests, and a local Docker build; it does not deploy or publish an image.

## Status vocabulary

Use `FULLY VERIFIED`, `VERIFIED`, `PARTIALLY VERIFIED`, `NOT VERIFIED`, `DEGRADED`, and `NOT OBSERVABLE` only when backed by explicit checks and evidence. A healthy process is not proof that providers or databases are healthy. `NOT VERIFIED` indicates a known integration or capability has not been implemented or validated; `NOT OBSERVABLE` means the system lacks evidence to determine its state.

## Architecture

- `app/api.py`: API routes, authentication, and health reporting.
- `app/orchestrator.py`: policy-first orchestration shell.
- `app/policy.py`: deny-by-default action policy.
- `app/providers/base.py`: provider adapter contract.
- `app/neural/torch_status.py`: optional PyTorch status check.
- `tests/`: policy and API regression tests.
- `.github/workflows/ci.yml`: lint, tests, and Docker build on Python 3.11/3.12.
- `.github/dependabot.yml`: weekly dependency update proposals.
## Protected no-inference task-path diagnostic

The Worker includes a private `POST /__internal/verify-task` diagnostic route. It is intentionally excluded from the public OpenAPI schema and accepts no request body or caller-supplied task content. Keep it behind a dedicated Cloudflare Access self-hosted application scoped to the exact path:

`glorifier-neural.glorifier.workers.dev/__internal/verify-task`

The Access policy must allow only the dedicated Cloudflare Access service token; do not add a bypass or broaden the existing `All Workers` policy. The Worker also verifies `CF-Access-Client-Id` and `CF-Access-Client-Secret` against server-side secret bindings:

- `GLORIFIER_INTERNAL_SERVICE_CLIENT_ID`
- `GLORIFIER_INTERNAL_SERVICE_CLIENT_SECRET`

The handler requires both `GLORIFIER_API_TOKEN` and the separately managed `GLORIFIER_INTERNAL_SERVICE_TOKEN` Worker bindings to be configured. Its bearer credential is authenticated only through the internal-only branch of the task-authentication helper; `GLORIFIER_INTERNAL_SERVICE_TOKEN` is never accepted by public `POST /v1/tasks`, which accepts `GLORIFIER_API_TOKEN` only. The internal credential is rate-limited independently and is used only after the dedicated Cloudflare Access client ID and client secret have been verified. It submits one fixed `read_only` diagnostic request with `require_approval=true`. The policy therefore returns `policy:approval-required` before inference; no model request is made. This diagnostic skips optional audit and task-run persistence, does not write to Neon or Supabase, and never returns or logs secret values.

The response reports a diagnostic `task_id` equal to its unique `X-Request-ID`, the separate `X-Correlation-ID`, the policy response, and explicit evidence that inference and persistence were not performed. This proves the Worker-held task credential was accepted and the task policy path was reached; it does **not** prove provider inference, factual model output, or the public GLORIFIER proxy path. Treat the endpoint as a one-off operational probe. Provision the two Access identity bindings and Access application only for an authorized test, and remove the temporary service token and bindings after verification unless a separate long-lived operational use is approved.
