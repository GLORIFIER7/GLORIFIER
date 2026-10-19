# Full-stack verification and truthful status gates

## Contract

GLORIFIER must never present a build, mock, local sample, configured credential, HTTP 200, or model-generated diagnosis as proof of end-to-end production success. Report each capability independently and include the checked commit, UTC timestamp, environment, test, result, and evidence link.

Allowed statuses:

- **FULLY VERIFIED** — every required test and live end-to-end evidence for the specifically named scope passed.
- **VERIFIED** — the named check passed; this is not a claim about other layers.
- **PARTIALLY VERIFIED** — some requirements passed and others remain.
- **NOT VERIFIED** — evidence is absent or did not pass.
- **DEGRADED** — observed service is failing or impaired.
- **NOT OBSERVABLE** — no valid measurement is available.

## Required verification layers

| Layer | Minimum evidence | What does not count |
|---|---|---|
| Source and dependencies | Locked install, dependency audit, TypeScript check, tests, production build | Green badge alone; unrun tests |
| Frontend | Production build plus a live URL check and browser-level smoke test against the deployed revision | Build success alone; an HTTP 200 that only serves a shell |
| Backend | Direct backend health/readiness contract, API contract tests, authenticated-path tests | Frontend proxy response alone; a configured URL |
| Database | Authenticated read-only readiness/query and migration/schema compatibility evidence | Environment variable presence or dashboard allowance |
| AI provider | Timestamped real inference with non-empty response and correct completion status; model/provider identity recorded without secrets | API key exists, HTTP 200 with empty/truncated output, cached/mock response |
| Payments/revenue | Independent settlement verification, payer/recipient/amount/network/finality checks, idempotent delivery and reconciled ledger | UI estimates, token balances, quotes, test transactions, or a successful payment-link open |
| Operations | Scheduled health checks, failure alert delivery, recovery/rollback exercise, monitoring history | CI success or a workflow schedule alone |

## Production endpoint contract

Configure repository Actions variables/secrets only after confirming the authoritative URLs:

- GLORIFIER_FRONTEND_URL (Actions variable): deployed public frontend.
- GLORIFIER_BACKEND_HEALTH_URL (Actions secret): direct backend health/readiness endpoint. The endpoint must be read-only and must not expose environment values, credentials, personal data, or internal topology.

The scheduled/manual audit may report frontend reachability only. Backend status stays NOT VERIFIED until a direct backend health URL and expected response contract are configured and pass. If either URL is missing, report NOT VERIFIED rather than inventing a successful result.

## NVIDIA role and change control

NVIDIA NIM may provide a diagnostic hypothesis from redacted logs. The model is not an authority to modify production, merge code, change credentials, move funds, deploy, or label unobserved behavior as verified. Source fixes must be reviewable diffs, pass deterministic tests, and be rechecked after merge. Keep secrets out of prompts and artifacts. AI-generated diagnosis is advisory until a human or deterministic test validates it.

## Current known boundaries

- A green CI run proves only the checks in that run and commit.
- Live backend, database, provider inference, customer payments, and revenue require separate runtime evidence.
- If the runtime or evidence is unavailable, preserve NOT VERIFIED / NOT OBSERVABLE.
- Never claim 100% verified for the entire system from a partial test suite. Verification claims must name their scope.
