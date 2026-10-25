# Cloudflare Workers-only migration

## Decision

Cloudflare Workers is the only approved production hosting and application execution platform for GLORIFIER. Vercel and Railway must not remain production dependencies. This migration must be completed through reviewed pull requests and verified deployments; do not remove the existing upstream until its routes have working Worker-native implementations.

## Evidence from the current repository

- `wrangler.jsonc` already builds a Worker entry point at `src/worker.ts` and serves the Vite output from `dist/`.
- `src/worker.ts` has Worker-native `GET /api/health`, `GET /api/identity`, and `GET /api/business-model` handlers. Other `/api/*` and `/auth/*` requests require an explicit `GLORIFIER_BACKEND_ORIGIN` HTTPS-origin binding. The Worker no longer silently falls back to Railway when the binding is absent; unported routes fail closed with `BACKEND_ORIGIN_NOT_CONFIGURED`. A configured origin is still a migration bridge, not proof that the target runtime exists or is healthy.
- `src/worker.test.ts` verifies explicit-origin proxy behavior with a neutral test-only origin and verifies unconfigured routes fail closed without making an upstream request.
- `server.ts` is a large Express/Node application (about 198 KB in the repository API response) with many routes, Node-specific imports, Postgres access, provider SDKs, and daemon initialization. It cannot safely be treated as a drop-in Workers module.
- `vercel.json` still declares Vercel routing and forwards API/auth paths to Railway.
- `.github/workflows/cloudflare-worker.yml` builds and tests the Worker, but deployment is intentionally gated on the repository variable `CLOUDFLARE_DEPLOY_ENABLED=true` and Cloudflare credentials.

## Required implementation sequence

1. Inventory every Express route and the frontend caller, including request/response schemas, auth/owner/internal-service guards, rate limits, webhook verification, and persistence side effects.
2. Extract runtime-independent business logic from `server.ts` into modules that do not require Express, Node-only APIs, or process-global startup side effects.
3. Port endpoints to Worker-native `fetch(Request, Env)` handlers in groups. `GET /api/health` is a Worker-runtime-only probe and explicitly reports backend/auth/database as `not-probed`; `GET /api/identity` is also Worker-native. Add contract tests for success, validation errors, authentication, authorization, rate limiting, provider failures, and persistence.
4. Replace Node-specific dependencies with Workers-compatible APIs or bindings. Use Cloudflare bindings/secrets for runtime configuration; never commit credentials. Until route migration is complete, `GLORIFIER_BACKEND_ORIGIN` may point the proxy at a reviewed HTTPS origin only (origin only; no credentials, path, query, or fragment). The Worker fails closed when this binding is unset; do not configure Railway as the origin if the goal is Railway independence. Unported routes remain unavailable until they are ported or an approved replacement runtime is configured.
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

**Migration incomplete / not production-ready.** The Worker now has native `GET /api/health` and `GET /api/identity` handlers, with tests added for the health endpoint. This does not establish live production health. This file does not claim the backend has been ported, Railway has been disconnected, Vercel has been removed, databases are synchronized, or Cloudflare production is healthy.

## Live smoke-test evidence (2026-10-24)

Fresh external fetches were performed against `https://glorifier.glorifier.workers.dev` on 2026-10-24. These checks confirm the public Worker is reachable but do **not** establish full production readiness.

- `GET /api/health`: **HTTP 200**. The response reports `worker-ready`, Worker and assets binding OK, and explicitly reports backend, authentication, and databases as `not-probed`. Treat this as a Worker-runtime check only.
- `GET /api/business-model`: **HTTP 200**. Returns the static GBM-2.0 contract with evidence-based economic truth labels and human-approval controls.
- `GET /api/identity`: **HTTP 200**, but `ready: false`; canonical domain and primary email are empty and `domainStatus: not-configured`.
- `GET /api/reports/summary`: **HTTP 502**, code `BACKEND_ORIGIN_NOT_CONFIGURED`. The route is not Worker-native and no explicit backend origin is configured.
- `GET /api/runtime-verification?probeAi=false`: **HTTP 502**, code `BACKEND_ORIGIN_NOT_CONFIGURED`. This route still requires functionality that has not been migrated into the Worker.

These results supersede older smoke-test observations in this document. A successful `/api/health` response is not evidence of database, authentication, or backend readiness. The reports and runtime-verification failures remain production blockers.

## Latest live smoke-test evidence (2026-10-26)

A later read-only production check, recorded in [Issue #432 comment](https://github.com/GLORIFIER7/GLORIFIER/issues/432#issuecomment-6400491311), supersedes the 2026-10-24 failure observations for the two endpoints below. These checks were recorded externally; this documentation update did not run or deploy them.

- `GET /api/health`: **HTTP 200**. Worker liveness only; backend, authentication, and database dependencies remain `not-probed`.
- `GET /api/business-model`: **HTTP 200**. Static business-model contract served by the Worker.
- `GET /api/reports/summary`: **HTTP 200**. The six named operational tables returned exact counts of zero at observation time. This does not prove whole-database emptiness, Neon parity, or revenue status.
- `GET /api/runtime-verification?probeAi=false`: **HTTP 200**. Worker/assets checks and a Supabase PostgREST exact-count query passed (reported latency: 819 ms). Authentication and AI/provider readiness were not probed.
- `GET /api/identity`: **HTTP 503**, intentionally not-ready because the canonical domain and primary organization email remain unconfigured.
- `GET /api/app-state` without credentials: **HTTP 401**, `AUTHENTICATION_REQUIRED`. This confirms the unauthenticated boundary for this route at probe time; it does not verify an authenticated session or backend persistence.
- `GET /api/neural/health` and `GET /api/neural/ready`: **HTTP 503**, `NEURAL_ORIGIN_NOT_CONFIGURED`. These are live configuration failures, not merely untested endpoints; configure only a reviewed HTTPS origin and exact host allowlist after the Neural service is deployed and authorized.

### Remaining production gates

- The protected-route authentication contract and authenticated user/session flow need a live, configured-backend check. The scheduled monitor's unauthenticated `/api/app-state` check is proposed in [PR #483](https://github.com/GLORIFIER7/GLORIFIER/pull/483); it is not yet evidence of successful production authentication.
- Live Neural/provider readiness, external A2A/MCP conformance, reviewed production egress allowlists, and real EVM/BNB/Solana RPC reachability remain unverified.
- Neon table/schema inspection has returned HTTP 402 quota exceeded in prior read-only checks. Supabase having six operational tables does not establish schema/data parity. Do not change `DATABASE_URL`, migrate/overwrite records, or add broad RLS policies without verified source-of-truth, permissions, backup/rollback, and per-table parity evidence.
- Cloudflare is not yet proven to be the only production dependency: unported API/auth routes still require a reviewed backend origin or fail closed, and Vercel/Railway removal requires route-by-route verification.

A passing Worker health endpoint must not be described as full application health or 24/7 availability.

## Express route inventory snapshot

A source scan of `server.ts` on the base revision found **213 explicit `app.<method>(path)` route declarations**. This is a static inventory, not a complete behavioral specification: mounted routers, middleware ordering, dynamically registered routes, auth policies, and side effects still require review. The route set must be ported in tested groups rather than replaced by a generic proxy.

```text
GET /api/governance/geas/architecture/api-assets
POST /api/governance/geas/architecture/canonical-action-hash
POST /api/governance/geas/evidence/record
POST /api/monetization/checkout
POST /api/monetization/capture
GET /api/monetization/subscription
GET /api/payouts
POST /api/payouts/request
POST /api/ai/finance-scientists
POST /api/ai/compliance-scientist
GET /api/assets/canonical
GET /api/assets/canonical/all
GET /api/connections
GET /api/connections/:id
POST /api/connections
POST /api/connections/:id/verify
POST /api/connections/:id/approval
GET /api/broker/alpaca/status
GET /api/broker/alpaca/connect
POST /api/broker/alpaca/verify
POST /api/broker/alpaca/revoke
GET /auth/broker/callback
GET /api/collaboration/status
POST /api/collaboration/:provider/event
GET /api/brand-monitor/terms
POST /api/brand-monitor/terms
GET /api/brand-monitor/observations
GET /api/brand-monitor/alerts
POST /api/brand-monitor/scan
GET /api/economic-os/verified-revenue
GET /api/data-status
GET /api/integrations
GET /api/health
GET /api/binance/health
GET /api/health/ready
GET /api/runtime-verification
GET /api/ai/config
POST /api/ai/council
GET /api/llama-cloud/status
GET /api/llama-cloud/indexes
POST /api/llama-cloud/retrieve
GET /api/ai/registry
POST /api/ai/collaborate
POST /api/ai/patent-attorney-scientist
POST /api/ai/compliance-scientist
POST /api/ai/role
POST /api/ai/broker-chat
POST /api/ai/evaluate-offer
POST /api/ai/audit-footprint
POST /api/ai/generate-clawback
POST /api/ai/collaborate-gpt-fix
POST /api/ai/work-together-gpt
GET /api/ai/work-247-gpt
POST /api/ai/work-247-gpt/toggle
POST /api/ai/work-247-gpt/trigger
POST /api/sentinel/crud
GET /api/compute
POST /api/compute/task
GET /api/ai/specialists
POST /api/ai/specialist-council
GET /api/intelligence/report
POST /api/intelligence/report
GET /api/intelligence/status
GET /api/agents
GET /api/glr-commerce/quote
GET /api/economy/glr/policy
GET /api/economy/glr/snapshot
GET /api/economy/glr/intents
GET /api/economy/glr/intents/:id
POST /api/economy/glr/intents
POST /api/economy/glr/intents/:id/authorize
POST /api/economy/glr/intents/:id/commit
POST /api/economy/glr/intents/:id/settlement-evidence
POST /api/glr-commerce/ai-summary
GET /api/federated-a2a/v3/policy
GET /api/federated-a2a/v3/tasks
GET /api/federated-a2a/v3/tasks/:id
POST /api/federated-a2a/v3/tasks
POST /api/federated-a2a/v3/tasks/:id/authorize
POST /api/federated-a2a/v3/tasks/:id/assign
POST /api/federated-a2a/v3/tasks/:id/envelope
POST /api/federated-a2a/v3/handoffs/verify
POST /api/federated-a2a/v3/tasks/:id/evidence
POST /api/federated-a2a/v3/tasks/:id/verify
POST /api/federated-a2a/v3/tasks/:id/settle
POST /api/federated-a2a/v3/tasks/:id/fail
GET /api/a2a/manifest
GET /.well-known/a2a-agent-card.json
GET /api/a2a/capabilities
GET /api/a2a/tasks
GET /api/a2a/tasks/:id
POST /api/a2a/tasks
POST /api/a2a/handoffs/verify
POST /api/a2a/e2e-test
GET /.well-known/glorifier-agent.json
GET /api/agents/tasks
GET /api/agents/tasks/:id
POST /api/agents/tasks
GET /api/agents/capabilities
GET /api/sync/global
POST /api/sync/global
GET /api/agents/registry
POST /api/agents/synchronize
GET /api/scientists/fleet
GET /api/scientists/issues
GET /api/scientists/monetization
POST /api/scientists/resolve
POST /api/scientists/approve
POST /api/scientists/submit
POST /api/scientists/loop/toggle
POST /api/scientists/monetization/claim
GET /api/business-model
GET /api/work-units/summary
GET /api/monetization/dashboard
GET /api/revenue/control-plane
GET /api/economic-os
GET /api/reports/summary
GET /api/business-intelligence/report
GET /api/business-intelligence/competitive
GET /api/game-assets
GET /api/crypto-fiat-assets
GET /api/monetization/sprint
GET /api/global-collaboration/status
GET /api/global-collaboration/policy
POST /api/global-collaboration/run
GET /api/opportunities/24x7/status
POST /api/opportunities/24x7/run
GET /api/opportunities/github-bounties
POST /api/opportunities/github-bounties/discover
GET /api/global-resolution/cases
POST /api/global-resolution/run
GET /api/mediator/snapshot
GET /api/business-intelligence/architecture
GET /api/valuation
GET /api/assets/providers/binance-public/quote/:symbol
GET /api/assets/verification/policy
GET /api/assets/verification/crypto/policy
POST /api/assets/verification/crypto/challenge
POST /api/assets/verification/crypto/proof
GET /api/assets/verification
GET /api/assets/verification/internet-coverage
GET /api/assets/verification/internet-sweep
GET /api/assets/verification/attestation
GET /api/auth/status
GET /api/identity
GET /api/auth/session
GET /api/control-plane/integrations
POST /api/control-plane/integrations/reconcile
GET /api/providers/discovery
POST /api/providers/discovery/refresh
GET /api/governance/architecture
GET /api/governance/policy
GET /api/agents/control-plane
POST /api/agents/control-plane/register
GET /api/agents/control-plane/:agentId
POST /api/agents/control-plane/:agentId/authorize
POST /api/agents/control-plane/:agentId/quarantine
POST /api/governance/evaluate
GET /api/governance/evidence-graph
POST /api/governance/evidence-graph/nodes
POST /api/governance/evidence-graph/edges
GET /api/governance/provenance/architecture
GET /api/governance/provenance/events
GET /api/governance/provenance/verify
POST /api/governance/provenance/events
GET /api/governance/observability
GET /api/governance/geas/architecture
GET /api/governance/geas/architecture/sources
GET /api/governance/geas/architecture/patterns
GET /api/governance/geas/architecture/controls
POST /api/governance/geas/architecture/scan
POST /api/governance/geas/architecture/ai-impact
POST /api/governance/geas/architecture/finops-decision
GET /api/architecture
GET /api/architecture/permanent-stack
GET /api/governance/geas/reconciliation/manifest
POST /api/governance/geas/reconciliation/validate
GET /api/governance/geas/reconciliation/degraded-modes
POST /api/governance/geas/reconciliation/run
POST /api/governance/geas/reconciliation/authority/evaluate
POST /api/governance/geas/reconciliation/authority/attenuate
POST /api/governance/geas/reconciliation/authority
POST /api/governance/geas/reconciliation/telemetry
POST /api/governance/geas/reconciliation/manifest/persist
POST /api/governance/geas/reconciliation/finops
POST /api/governed-actions
GET /api/app-state
PUT /api/app-state
POST /api/evidence/outcomes
POST /api/mobile/device/register
GET /api/mobile/device/me
POST /api/mobile/device/telemetry
DELETE /api/mobile/device/me
GET /api/ai-web-network/status
GET /api/ai-web-network/policy
POST /api/ai-web-network/sync
POST /api/ai-web-network/cycle
GET /api/model-network/status
POST /api/model-network/discover
GET /api/internet-discovery/status
POST /api/internet-discovery/run
GET /api/system/daemon
POST /api/system/daemon/run
POST /api/system/daemon/stop
GET /api/global-verification/status
POST /api/global-verification/run
GET /api/autonomous-verification/status
POST /api/autonomous-verification/run
GET /api/agent-miner/status
POST /api/agent-miner/control
POST /api/agent-miner/compute-authorization
POST /api/agent-miner/run
GET /{*splat}
```

## CI evidence snapshot (2026-10-23)

Observed on migration branch commit `a3538ec4d022f77b1eb4cdfb064a9db67de9d525`:

- GitHub Actions run `39803162732` (`GLORIFIER Cloudflare Worker`) completed successfully: dependency installation, TypeScript check, Worker tests, frontend build, and static-output check all passed.
- The Cloudflare deploy step was **skipped** because production deployment is gated. This is build/test evidence, not a deployed-release verification.
- Other GitHub Actions runs associated with this commit reported success for CI, CodeQL, dependency review, architecture validation, and verification-contract validation.
- The combined commit-status API also reported an external `CircleCI Pipeline` status of `error` and a `Vercel` status of `success`. The Vercel build-verification and GitHub Pages workflows also reported success. These are evidence that legacy deployment/CI paths still exist; they are not evidence that the Cloudflare-only target has been achieved.
- A live request to the public Worker endpoint could not be verified through the available inspection channel. Production health is therefore **not verified here**.

Next gate: port a small, explicitly reviewed route group to Worker-native handlers with contract tests, then repeat this check. Do not remove Railway forwarding or Vercel deployment configuration until the corresponding Worker routes and frontend release are verified.

## First Worker-native route migrated on the migration branch

- `GET /api/identity` is now handled directly by `src/worker.ts` using Cloudflare environment bindings; it no longer calls Railway for this route.
- The response preserves the existing identity response shape and conservative readiness rules: readiness is false unless a domain, organization email, and recognized ownership/verification status are configured.
- The route sets `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.
- `src/worker.test.ts` now covers unconfigured identity, configured identity, normalization of domain/email values, and the assertion that this endpoint does not call the upstream or static assets.
- This is a narrow first migration slice. All other API/auth routes still use the legacy upstream unless separately ported. The test changes have been pushed, but their latest CI run is still pending at the time of this note.
