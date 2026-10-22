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
