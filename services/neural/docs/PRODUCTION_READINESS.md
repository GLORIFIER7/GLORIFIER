# GLORIFIER Neural production readiness

This runbook describes the controls required before declaring the Cloudflare Worker production-ready.

## Deployment target

- Worker: `glorifier-neural`
- Public route: `https://glorifier-neural.glorifier.workers.dev`
- Runtime: Cloudflare Python Workers / FastAPI
- Database read probe: existing `NEON_READONLY` Hyperdrive binding
- Task-run writes: a separately provisioned `NEON_WRITE` binding or a writer `NEON_DATABASE_URL` secret
- Currently selected production provider: OpenAI Responses API. The adapter defaults to model `gpt-6-luna` unless `OPENAI_MODEL` overrides it. NVIDIA NIM remains an optional alternative provider, not the current production selection.

The Cloudflare deployment has two production paths. Cloudflare Workers Builds
automatically builds and deploys commits on `main`, using the `/cloudflare` root
and `bash ./worker-build.sh deploy`. The repository's
`.github/workflows/cloudflare-neural-worker.yml` also provides a separate manual
`workflow_dispatch` path, gated by `deploy=true` on `main`. Pull-request and
push runs in GitHub Actions validate or dry-run only; they do not deploy production.

The branch-specific Workers Builds triggers used for Dependabot PRs #38, #39, and
#40 are separately scoped to their respective branches. They now run from
`/cloudflare`, prepare the Worker package with
`bash ./worker-build.sh --prepare-only`, and run
`npx wrangler deploy --dry-run`. All three corrected builds completed successfully
and stopped at `--dry-run`; they published neither a Preview nor a production
version. Worker preview URLs remain disabled in `cloudflare/wrangler.jsonc`. The
main-branch production build configuration remains unchanged.

## GitHub deployment environment

The `glorifier-neural-cloudflare-production` GitHub Environment must define:
- Secret: `CLOUDFLARE_API_TOKEN` with permission to deploy this Worker.
- Variable: `CLOUDFLARE_ACCOUNT_ID` identifying the intended Cloudflare account.

The workflow fails closed when either value is absent. The account identifier is supplied at deployment time and is not committed to the repository.

## Cloudflare Access

The account-wide `All Workers` Access application remains enabled and still protects Neural task execution. A separate application named `GLORIFIER Neural Public Readiness Probes` has been created with narrowly scoped public destinations for only:

- `GET /health`
- `GET /ready`

These read-only operational routes bypass the account-wide Access gate so monitoring and the post-deploy smoke job can reach them. The task endpoint `POST /v1/tasks` is not included in the bypass; it remains behind account-wide Access and also requires `GLORIFIER_API_TOKEN`. Public `GET /ready` is protected by a separate Cloudflare-native per-client rate limiter and a 30-second cache for provider/database probes. Do not broaden this exception to all Worker paths or disable the existing `All Workers` policy.

Historical safe-mode observation (2026-11-04; superseded by the current production observation below): `GET /health` returned HTTP 200 and process status `VERIFIED`. The production smoke job (run [#41792456546](https://github.com/GLORIFIER7/GLORIFIER-NEURAL/actions/runs/41792456546), 13:33:52Z) returned HTTP 503 from `/ready` with `providers: NOT VERIFIED`, `database: VERIFIED`, `authentication: VERIFIED`, `rate_limit: VERIFIED`, and `inference_performed=false`. That run passed the strict provider-disabled safe-mode branch. This records the earlier non-provider-ready state only; it is not the current production readiness result.

## Cloudflare variables and secrets

Configure the following in Workers & Pages → `glorifier-neural` → Settings → Variables and Secrets. Do not put secret values in Git, this document, issue comments, or chat.

### Required secret

- `GLORIFIER_API_TOKEN`: a high-entropy bearer token used by authenticated `POST /v1/tasks` callers.

### OpenAI (currently selected production provider)

The observed production Worker is configured with `GLORIFIER_PROVIDER=openai`.
Its read-only model-access probe uses `GET /v1/models/{model}`; the adapter
defaults to `gpt-6-luna` unless `OPENAI_MODEL` is explicitly set.

For read-only provider readiness, configure:

- `GLORIFIER_PROVIDER=openai`
- `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=true`
- Store `OPENAI_API_KEY` as a Worker secret.

A direct Cloudflare settings read-back on 2026-11-05 at approximately 16:28 (UTC+07:00) confirmed `GLORIFIER_ENABLE_INFERENCE=true`, `GLORIFIER_PROVIDER=openai`, and `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=true`. The `OPENAI_API_KEY` binding name is present; its value was not read. This is configuration evidence only. The latest production smoke performed read-only readiness checks and explicitly reported `inference_performed=false`; it did not submit a prompt or verify a live completion. Authenticated task requests can send prompt content to OpenAI and incur separate API usage charges. A successful model-catalogue check establishes model access only; it does not prove inference quality, latency, capacity, or end-to-end task execution.

### NVIDIA NIM (optional alternative provider)

Set these plain-text variables only when the owner explicitly authorizes sending task prompts to NVIDIA:

- `GLORIFIER_ENABLE_INFERENCE=true`
- `GLORIFIER_PROVIDER=nvidia_nim`
- `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=true`
- `NVIDIA_NIM_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b`

Store the NVIDIA credential as a Worker secret:

- `NVIDIA_NIM_API_KEY`

The readiness probe performs a read-only `GET /v1/models` request. It does not submit a prompt or run inference. The documented NVIDIA model ID is not proof that the user's API credential or hosted endpoint is enabled; that must be verified against the deployed Worker.

### Gemini Interactions API (optional alternative provider)

The service supports Gemini through Google's recommended Interactions API. The default model is `gemini-3.8-flash`; override it with `GEMINI_MODEL` when required by the account.

Configure the following only after the owner has supplied a valid Gemini API key:

- Set `GLORIFIER_PROVIDER=gemini`.
- Explicitly set `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=true` at deployment time to permit provider readiness and external requests; the tracked Worker configuration defaults this switch to `false`.
- Separately set `GLORIFIER_ENABLE_INFERENCE=true` only after an authorized inference test is approved; the tracked Worker configuration defaults this switch to `false`.
- Store `GEMINI_API_KEY` as a Cloudflare Worker secret.
- Optionally set `GEMINI_MODEL`; the default is `gemini-3.8-flash`.

Readiness uses a read-only `GET /v1beta/models/{model}` request and does not submit a prompt. Inference uses `POST /v1beta/interactions` with `store=false`, bounded output tokens, disabled redirects, a request deadline, and sanitized errors. This makes requests stateless at the Gemini Interactions resource layer; it does not replace Google's applicable service data-processing terms or billing controls.

### Anthropic Claude Messages API (optional alternative provider)

The service supports Claude through Anthropic's Messages API. The default model is `claude-sonnet-5`; override it with `ANTHROPIC_MODEL` when required by the account.

Configure the following only after the owner has supplied a valid Anthropic API key:

- Set `GLORIFIER_PROVIDER=anthropic`.
- Explicitly set `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=true` at deployment time to permit provider readiness and external requests; the tracked Worker configuration defaults this switch to `false`.
- Separately set `GLORIFIER_ENABLE_INFERENCE=true` only after an authorized inference test is approved; the tracked Worker configuration defaults this switch to `false`.
- Store `ANTHROPIC_API_KEY` as a Cloudflare Worker secret.
- Optionally set `ANTHROPIC_MODEL`; the default is `claude-sonnet-5`.

Readiness uses the read-only `GET /v1/models/{model_id}` endpoint and does not submit a message. Inference uses `POST /v1/messages` with a bounded `max_tokens`, the pinned `anthropic-version` header, disabled redirects, a request deadline, and sanitized errors. Requests may incur Anthropic API usage charges.

These adapters are explicit alternatives, not automatic multi-provider failover. Only the provider named by `GLORIFIER_PROVIDER` is registered in the runtime. No provider is switched automatically when another provider is unavailable. Keep the deployed provider on its current selection until the selected provider's secret binding, read-only readiness, and a separately authorized inference test have been verified.

### Neon task-run writes (optional)

The production Worker currently has the `glorifier-neon-readonly` Hyperdrive resource bound as `NEON_READONLY`. It is used only for the read-only `SELECT 1` readiness probe and must not be used for writes. The direct live `/ready` check on 2026-11-05 returned HTTP 200 with `status: READY` and `database: VERIFIED`; the Hyperdrive probe is read-only and does not test application-data writes. The probe remains read-only and does not verify application-data reads/writes. No writer-role `NEON_WRITE` binding is configured, and task-run persistence remains disabled.

To enable task-run persistence:

1. Apply `db/neon/migrations/0001_task_runs.sql` to the intended Neon database through the database owner's approved migration process. The SQL file is marked proposal-only and must not be applied without that separate approval.
2. Provision a separate writer-role Hyperdrive configuration and bind it as `NEON_WRITE`, or provide `NEON_DATABASE_URL` as a Cloudflare Worker secret for a dedicated least-privilege writer role.
3. Set `GLORIFIER_NEON_TASK_RUNS_ENABLED=true`.

Task-run persistence stores only validated lifecycle metadata and evidence codes. It does not store prompts, outputs, credentials, wallet data, or payment data. A successful task-run write is committed and read back before the API returns success.

### Supabase audit sink (optional)

To enable the REST audit sink:

- Set `GLORIFIER_AUDIT_ENABLED=true`.
- Store `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as Worker secrets.

Audit writes use the Cloudflare Fetch API and fail closed when explicitly enabled but unavailable.

## Readiness semantics

`GET /health` confirms process health only. It is not a production-ready signal.

`GET /ready` performs read-only/configuration checks. For Cloudflare Workers it requires:

- Provider readiness verified through the selected provider adapter's bounded, read-only model-access probe: OpenAI uses `GET /v1/models/{model}`; Gemini uses `GET /v1beta/models/{model}`; Anthropic uses `GET /v1/models/{model_id}`; NVIDIA NIM uses its read-only model catalogue probe.
- Neon connectivity verified through `NEON_READONLY`.
- `GLORIFIER_API_TOKEN` configured.
- The `GLORIFIER_RATE_LIMITER` and `GLORIFIER_READINESS_LIMITER` bindings present.

Optional audit and task-run integrations report their configuration state separately. Their write paths are not tested by readiness. A post-execution persistence failure is returned as a degraded evidence marker alongside the completed task outcome, not as a retryable HTTP 503.

The post-deploy smoke job requires HTTP 200 from `/health` and accepts either (a) HTTP 200 from `/ready` when the selected provider, database, authentication, and rate-limit checks pass, or (b) the strict provider-disabled safe-mode HTTP 503 response when database, authentication, and rate-limit checks pass and `inference_performed=false`. It performs no inference and does not incur a model completion request. The latest production smoke on 2026-11-05 followed branch (a): `/ready` returned HTTP 200 with `status: READY`. The 2026-11-04 HTTP 503 result above is historical only. A later direct Cloudflare settings read-back confirmed that the production inference flag is now `true`; the smoke still performed no inference. An HTTP 503 is a fail-closed non-ready/safe-mode result, not the expected current response while the selected provider readiness probe succeeds.

## Rate limiting

The Worker uses the Cloudflare-native `GLORIFIER_RATE_LIMITER` binding with a configured limit of 60 requests per 60-second window, keyed by an HMAC-SHA-256 digest of the bearer token. Cloudflare's native Workers rate-limit counters are approximate and per-location, not a strict global quota. Do not represent this as globally exact enforcement.

## Current production observation — 2026-11-05 (UTC+07:00)

Direct Cloudflare configuration inventory was read at approximately 16:28 local time. The latest deployment inventory returned:

- Worker: `glorifier-neural`; route: `https://glorifier-neural.glorifier.workers.dev`.
- Latest deployment: `77cace04-8c1b-4a26-82b6-b4504f920625`, created `2026-11-05T07:30:11.656407Z`; 100% traffic assigned to version `ecf822d5-745e-4c33-8fc2-5c10ca83baf7`.
- Current non-secret Worker variables: `GLORIFIER_PROVIDER=openai`, `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS=true`, `GLORIFIER_ENABLE_INFERENCE=true`, and `GLORIFIER_NEON_CONNECTIVITY_ENABLED=true`.
- Secret-binding inventory includes `OPENAI_API_KEY`, `GLORIFIER_API_TOKEN`, and `NVIDIA_NIM_API_KEY`. Only binding names were inspected; secret values were not read.
- The latest successful production smoke was GitHub Actions run [#41987341798](https://github.com/GLORIFIER7/GLORIFIER-NEURAL/actions/runs/41987341798), around `2026-11-05T07:30Z`. It confirmed `/health` HTTP 200 and `/ready` HTTP 200 with `status: READY`; provider, database connectivity, authentication, and rate limiting were `VERIFIED`.
- That smoke response reported `inference_performed=false`. No prompt was submitted and no model inference was executed.
- Audit and task-run persistence remain `NOT CONFIGURED (OPTIONAL)`; no optional persistence write was tested.

Conclusion: Cloudflare deployment and the configured read-only production readiness checks are **VERIFIED**. The production inference flag and external-egress consent are configured `true`, but live inference, inference quality, end-to-end task execution, optional audit/task-run writes, and externally verified economic outcomes remain **NOT VERIFIED**. Do not infer successful model execution from a successful readiness probe.
## Release procedure

1. Make code changes on a branch and open a pull request. The active repository ruleset targets `~DEFAULT_BRANCH`, requires the exact `AI Review Policy` status check with strict latest-commit enforcement, retains CodeQL/code-quality constraints, prohibits deletion and non-fast-forward updates, has zero required human approvals, and has no bypass actors. The AI policy workflow itself still has a PR-controlled workflow-definition trust limitation; see `docs/AI_REVIEW_POLICY.md`.
2. Require the repository's CI, security checks, and Cloudflare dry-run validation to pass. Do not bypass the active ruleset or weaken quality thresholds to obtain a green result.
3. After an approved merge to `main`, verify the automatic Cloudflare Workers Builds production build and active deployment. The separate GitHub Actions path can be manually dispatched with `deploy=true` using the configured GitHub Environment credentials. Verify the deployment job and intended Worker version/traffic before announcing release.
4. Require live `/health` and `/ready` checks. Expect `/ready` HTTP 200 when the selected provider, database, authentication, and rate-limit checks are verified. Accept HTTP 503 only for the explicit provider-disabled safe-mode response when the other required controls are verified and `inference_performed=false`; that response is not provider-ready.
5. The production inference flag is currently configured `true`, but do not treat that as proof of live execution. Perform a controlled authenticated inference request only after confirming the selected provider credential is valid, approving transmission of task content, and accepting any applicable API usage charges. The automated readiness/smoke steps intentionally do not submit a prompt.

Do not declare full AI production readiness until provider model-catalog readiness and a separately controlled inference check succeed. Enable audit writes or task-run persistence only after their own schema, least-privilege credentials, backup, and read/write verification steps have been approved and completed.
