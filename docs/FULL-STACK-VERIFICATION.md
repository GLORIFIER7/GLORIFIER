# GLORIFIER FULL-STACK VERIFICATION MATRIX

Last automated baseline: 2026-09-27.

Authenticated E2E gate: `.github/workflows/full-stack-e2e.yml` runs real Chromium against the production Vercel app using disposable Firebase email/password accounts generated at runtime by the browser test. No Firebase password or private credential is stored in GitHub Actions secrets or committed to the repository.

Status meanings:
- VERIFIED — qualifying checks passed for the scope stated.
- PARTIALLY VERIFIED — foundation exists and some checks pass, but end-to-end evidence is incomplete.
- NOT VERIFIED — insufficient evidence.
- DEGRADED — an external dependency, provider restriction, or infrastructure condition prevents verification.

| Component | Status | Evidence / remaining proof |
|---|---|---|
| Frontend build | VERIFIED | Current Vercel production deployment is READY and the verified deployment commit has successful deployment status. |
| Railway backend | VERIFIED | Production backend deployment is SUCCESS. |
| Permanent orchestrator | VERIFIED | Production orchestrator deployment is SUCCESS. |
| Vercel deployment | VERIFIED | Current production deployment is READY. |
| Browser → Railway API rewrites | PARTIALLY VERIFIED | Production health rewrite is covered by the smoke gate; authenticated browser rewrite is covered by the authenticated E2E gate once the automated disposable-account E2E run passes. |
| Firebase authentication | PARTIALLY VERIFIED | Auth/session implementation exists and the E2E suite exercises email/password login, Firebase session propagation, refresh persistence, and protected API access once the automated disposable-account E2E run passes. |
| Neon persistence | VERIFIED | Runtime verification checks database connectivity plus app-state/evidence initialization; user-scoped persistence still needs authenticated E2E proof. |
| Binance authenticated read-only | PARTIALLY VERIFIED | Server-side signed verification and Spot account display are implemented; a live authenticated private-account response is required before VERIFIED. |
| Binance safety | VERIFIED | Read-only guard and server-side secret handling are implemented; no provider restriction bypass is attempted. |
| AI provider registry / AI CEO | PARTIALLY VERIFIED | Runtime paths exist; live provider execution must be demonstrated in production. |
| Gemini | PARTIALLY VERIFIED | Configured path exists; successful live inference remains the qualifying proof. |
| OpenAI | PARTIALLY VERIFIED | Optional provider; runtime availability depends on valid account configuration/credits. |
| Revenue / monetization | PARTIALLY VERIFIED | Evidence-first settlement rules are implemented; authorized settlement evidence is required for financial verification. |
| Error/loading/empty states | PARTIALLY VERIFIED | Key modules expose explicit states; broad deployed browser traversal remains required. |
| Mobile navigation / responsive UI | PARTIALLY VERIFIED | Responsive components exist; device/browser traversal remains required. |
| Persistent state after refresh | PARTIALLY VERIFIED | /api/app-state is authoritative after authentication; authenticated refresh/re-login test remains required. |
| CI/CD | VERIFIED | GitHub Actions plus Vercel/Railway deployment checks are present; a production smoke gate has now been added. |
| Full major-module browser traversal | PARTIALLY VERIFIED | Automated Chromium traversal now covers every registered desktop module plus mobile navigation; status becomes VERIFIED only after the authenticated E2E workflow passes. |
| Overall full-stack | PARTIALLY VERIFIED | Automated E2E infrastructure is in place; the production gate must pass with a dedicated authenticated test account before user-scoped verification is complete. |

## FULLY VERIFIED gate

Do not label GLORIFIER FULLY VERIFIED until all applicable rows are VERIFIED and no required external provider is DEGRADED.