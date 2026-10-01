# GLORIFIER FULL-STACK VERIFICATION MATRIX

Last live verification: 2026-10-01.

Current live evidence:
- Vercel production deployment is READY and points to main commit ad4d8b59af26d8d7349af5a3249e716a998b9175.
- Vercel production frontend returns HTTP 200.
- Vercel -> Railway /api/health rewrite returns HTTP 200; Railway reports database=ok and both OpenAI/Gemini credentials configured.
- /api/runtime-verification?probeAi=true returns HTTP 200 with database, app-state, evidence store, and a real Gemini inference probe returning GLORIFIER_RUNTIME_PROBE_OK.
- /api/auth/status returns Firebase Authentication configured with Firebase ID-token + revocation checks.
- Railway production services report SUCCESS deployments.

Status meanings:
- VERIFIED — qualifying checks passed for the scope stated.
- PARTIALLY VERIFIED — foundation exists and some checks pass, but end-to-end evidence is incomplete.
- NOT VERIFIED — insufficient evidence.
- DEGRADED — an external dependency, provider restriction, or infrastructure condition prevents verification.

| Component | Status | Evidence / remaining proof |
|---|---|---|
| Frontend build | VERIFIED | Current Vercel production deployment is READY for the latest main commit. |
| Railway backend | VERIFIED | Production backend deployment is SUCCESS and live health returns 200. |
| Permanent orchestrator | VERIFIED | Production orchestrator deployment is SUCCESS. |
| Vercel deployment | VERIFIED | Current production deployment is READY and serves the latest main commit. |
| Browser -> Railway API rewrites | VERIFIED | Live Vercel /api/health successfully reaches Railway and returns database/provider health. |
| Firebase authentication configuration | VERIFIED | Live /api/auth/status reports Firebase ID-token + revocation-check backend verification. |
| Firebase authenticated browser E2E | PARTIALLY VERIFIED | Production authenticated browser traversal still requires the disposable-account Chromium workflow to complete successfully. |
| Neon persistence | VERIFIED | Live runtime verification reports database=ok and app-state/evidence initialization successful. |
| Binance authenticated read-only | PARTIALLY VERIFIED | Server-side signed verification and read-only guard exist; a qualifying live private-account response is still required. |
| Binance safety | VERIFIED | Read-only guard and server-side secret handling are implemented. |
| AI provider registry / AI CEO | VERIFIED | Live production runtime probe executed through the provider registry successfully. |
| Gemini | VERIFIED | Live production probe executed real Gemini inference using gemini-3.1-flash-lite and returned the expected probe response. |
| OpenAI | PARTIALLY VERIFIED | Credential is configured, but this run did not execute an OpenAI-specific inference probe. |
| Revenue / monetization | PARTIALLY VERIFIED | Evidence-first settlement rules are implemented; real external payment/settlement evidence is still required before verified revenue can be recorded. |
| Error/loading/empty states | PARTIALLY VERIFIED | Core API/runtime paths verified; broad authenticated browser traversal remains. |
| Mobile navigation / responsive UI | PARTIALLY VERIFIED | Responsive components exist; device/browser traversal remains. |
| Persistent state after refresh | PARTIALLY VERIFIED | Database persistence is live; authenticated user refresh/re-login remains an E2E proof requirement. |
| CI/CD | VERIFIED | GitHub Actions, Vercel and Railway deployment paths are present; production smoke verification is defined. |
| Full major-module browser traversal | PARTIALLY VERIFIED | Chromium workflow exists and covers major modules; successful production authenticated E2E evidence is still required. |
| Overall full-stack | PARTIALLY VERIFIED | Infrastructure and real provider inference are now live-verified; authenticated E2E, Binance private-account evidence, and external settlement evidence remain. |

## FULLY VERIFIED gate

Do not label GLORIFIER FULLY VERIFIED until all applicable rows are VERIFIED and no required external provider is DEGRADED.

Economic truth rule:
- Estimates are not revenue.
- Market value is not revenue.
- A configured credential is not proof of successful execution.
- Authentication configuration is not proof of a successful authenticated user session.
- A connected asset provider is not proof of asset ownership.
- Only qualifying external payment/settlement evidence can create VERIFIED_REVENUE.