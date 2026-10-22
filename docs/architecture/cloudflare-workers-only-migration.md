# Cloudflare Workers-only migration

## Decision

Cloudflare Workers is the only approved production hosting and application execution platform for GLORIFIER. Vercel and Railway must not remain production dependencies. This migration must be completed through reviewed pull requests and verified deployments; do not remove the existing upstream until its routes have working Worker-native implementations.

## Evidence from the current repository

- `wrangler.jsonc` already builds a Worker entry point at `src/worker.ts` and serves the Vite output from `dist/`.
- `src/worker.ts` currently forwards every `/api/*` and `/auth/*` request to `https://glorifier-artificial-intelligence-production.up.railway.app`. It is therefore not Railway-independent.
- `src/worker.test.ts` explicitly asserts that API and authentication requests reach Railway.
- `server.ts` is a large Express/Node application (about 198 KB in the repository API response) with many routes, Node-specific imports, Postgres access, provider SDKs, and daemon initialization. It cannot safely be treated as a drop-in Workers module.
- `vercel.json` still declares Vercel routing and forwards API/auth paths to Railway.
- `.github/workflows/cloudflare-worker.yml` builds and tests the Worker, but deployment is intentionally gated on the repository variable `CLOUDFLARE_DEPLOY_ENABLED=true` and Cloudflare credentials.

## Required implementation sequence

1. Inventory every Express route and the frontend caller, including request/response schemas, auth/owner/internal-service guards, rate limits, webhook verification, and persistence side effects.
2. Extract runtime-independent business logic from `server.ts` into modules that do not require Express, Node-only APIs, or process-global startup side effects.
3. Port endpoints to Worker-native `fetch(Request, Env)` handlers in groups. Add contract tests for success, validation errors, authentication, authorization, rate limiting, provider failures, and persistence.
4. Replace Node-specific dependencies with Workers-compatible APIs or bindings. Use Cloudflare bindings/secrets for runtime configuration; never commit credentials.
5. Decide and document database access for Supabase and Neon. Do not assume their records synchronize automatically; implement and test explicit ownership, idempotency, conflict resolution, and recovery before dual writes.
6. Move scheduled/background work to supported Cloudflare primitives (Cron Triggers, Queues, Workflows, or Durable Objects as appropriate) with idempotency and bounded execution. Do not start infinite daemons inside request handlers.
7. Remove Railway forwarding only after the relevant Worker-native route group passes contract tests. Remove Vercel configuration and deployment automation only after the Cloudflare frontend deployment is verified.
8. Keep Cloudflare production deployment gated until owner-approved secrets/configuration, CI checks, health checks, auth, data access, and rollback have been verified.

## Release gates

- No production API/auth path depends on a Railway origin.
- No Vercel project/configuration/workflow is required to build or serve production.
- `npm ci`, TypeScript checks, frontend build, Worker tests, and all applicable required checks pass.
- Authentication and protected routes retain their existing security boundaries.
- Database migrations and data synchronization are tested and recoverable.
- The deployed Worker health check and critical API smoke tests pass against the actual Cloudflare deployment.
- No production deployment, merge, credential rotation, database migration, or financial action is implied by this document.

## Current status

**Migration incomplete / not production-ready.** This file records the verified blockers and release gates. It does not claim the backend has been ported, Railway has been disconnected, Vercel has been removed, databases are synchronized, or Cloudflare production is healthy.
