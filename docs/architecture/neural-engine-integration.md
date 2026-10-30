# GLORIFIER-NEURAL integration contract

## Decision

Keep `GLORIFIER7/GLORIFIER` as the governance/control plane and `GLORIFIER7/GLORIFIER-NEURAL` as a separately deployable Python/FastAPI inference and task-orchestration service. Integrate through a narrow, authenticated API boundary; do not copy the Neural application into the Worker or treat a passing CI run as proof that inference is live.

## Current evidence

- GLORIFIER's Cloudflare Worker serves the frontend and selected native APIs. Its current backend proxy is configured separately through `GLORIFIER_BACKEND_ORIGIN`; unported routes fail closed when that setting is absent.
- GLORIFIER-NEURAL exposes `GET /health`, `GET /ready`, and a protected `POST /v1/tasks`. The task endpoint returns 503 when `GLORIFIER_API_TOKEN` is absent, compares bearer tokens in constant time, rate-limits authenticated requests, and denies financial, wallet-signing, minting, destructive, production-write, and unknown action classes by default.
- Neural readiness currently returns HTTP 503 while provider readiness is unverified. Its README explicitly states that providers and database integrations are not established as live.

These repository contracts do not prove a deployed Neural origin exists or is reachable.

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

## Implementation status (updated 2026-10-25)

**Worker adapter: IMPLEMENTED IN REPOSITORY / NOT FULLY VERIFIED.** PR #469 added the Worker route adapter and tests; PR #470 added the POST streaming `duplex: 'half'` handling and corrected the unknown-route assertion. Both PRs are merged. The adapter is present in `src/worker.ts` on `main`.

**CI evidence:** the combined status for merge commit `44244b272b3178604c24f04d3ec2c97395273421` reports Vercel `success` and CircleCI `failure` (https://circleci.com/gh/GLORIFIER7/GLORIFIER/207). The failure cause has not yet been established from logs. Treat CI as blocking; do not mark this integration verified until the failing job is diagnosed and all required checks pass.

**Runtime configuration and live operation:** no evidence here confirms that `GLORIFIER_NEURAL_ORIGIN` is configured, that a Neural deployment is reachable, or that `/health`, `/ready`, authentication rejection, and a harmless read-only task have passed against staging. No production deployment, secret setup, provider egress, or database write was performed.

**Next steps:** diagnose CircleCI failure; run Worker contract tests and security checks; then configure a reviewed staging origin and perform the staging smoke tests listed above. Keep provider inference and consequential action classes disabled until separately approved and verified.
