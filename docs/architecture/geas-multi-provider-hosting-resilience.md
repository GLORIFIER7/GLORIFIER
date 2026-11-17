# GEAS — Multi-Provider Hosting Resilience (MPHR)

**Capability status:** approved architecture; source implementation is in progress on a review branch. Approval does not establish a production deployment.

## Purpose

MPHR keeps the original GLORIFIER React/Vite application portable across Cloudflare Pages, Vercel, and a self-hosted Docker container. Hosting providers are replaceable; the approved source commit, frontend behavior, API contract, identity controls, and evidence policy must remain consistent.

The capability is governed by GEAS. It must prefer the existing free/low-cost entitlements, avoid unnecessary paid infrastructure, and never bypass provider quotas, authentication, deployment protection, or human authorization.

## Target topology

| Target | Intended role | What it hosts |
|---|---|---|
| Cloudflare Pages + the existing `glorifier` Worker | Primary public entry point | React/Vite static assets and the existing Cloudflare API/auth/MCP runtime routes |
| Vercel | Frontend standby | The same React/Vite static build; runtime API/auth/MCP requests are rewritten to the current Cloudflare Pages origin |
| Docker frontend image | Portable self-hosted frontend fallback | The same static React/Vite build, served by a small non-root Node process |
| Existing full-application Docker image | Separate backend/container option | The Node/Express application runtime; requires its own host, secrets, persistent database access, and verified readiness |

All targets must build from the same reviewed Git commit. A successful build on one provider does not prove the others are deployed or healthy.

## Implemented source contracts

### Cloudflare

The existing Cloudflare Pages/Workers path remains the current production-oriented path. The protected `.github/workflows/cloudflare-worker.yml` workflow retains its explicit manual production dispatch, `deploy_production=true` input, `CLOUDFLARE_DEPLOY_ENABLED=true` repository variable, credentials checks, production environment, and post-deploy smoke tests. MPHR must not weaken or bypass those gates.

### Vercel

The Vercel project configuration builds the canonical Vite output directory (`dist`) using the locked repository dependencies. It serves the original React app and applies explicit rewrites for `/api`, `/auth`, `/mcp`, and the Agent Card route before the final SPA fallback.

**Important boundary:** those runtime rewrites currently target `https://glorifier.pages.dev`. Therefore Vercel can preserve the frontend when Cloudflare's static frontend delivery fails, but it does **not** independently recover the Cloudflare Worker/API/auth runtime or a Cloudflare-wide outage. It is not yet an independent full-stack failover destination.

### Docker frontend

`Dockerfile.frontend` builds the same React/Vite `dist/` output and runs the static server as the non-root `node` user on port 8080. The static server supports GET/HEAD, MIME types, SPA navigation, bounded cache policies, and path/symlink traversal protections.

The `/healthz` endpoint reports static frontend availability only. Its `backend` field is `not-probed`. API, auth, MCP, and Agent Card paths return a no-store JSON HTTP 503 with `BACKEND_NOT_CONFIGURED`; they never fall through to the React SPA shell. This prevents a static frontend container from falsely claiming to be a healthy full application.

The existing root `Dockerfile` is the distinct Node/Express application image. Publishing that image to Docker Hub does not create a running host, database, TLS endpoint, or automatic route failover.

## Evidence-based current status

Observation: 2026-11-17. These are source/configuration observations, not live production probes.

- Cloudflare source path: **CONFIGURED IN REPOSITORY**. The protected deployment workflow exists; this MPHR change does not execute it or independently verify a newly deployed release.
- Vercel project: **NOT LINKED**. The connected Vercel team inventory returned no Git-linked projects at the time of inspection.
- Docker frontend runtime: **NOT DEPLOYED**. A portable container definition and validation workflow are source artifacts; no independent host or live container endpoint was configured or probed.
- Automatic traffic failover: **NOT ENABLED**. No independently configured traffic controller/DNS failover and recovery policy was verified.
- Backend redundancy: **NOT VERIFIED**. Vercel's runtime rewrites still use Cloudflare Pages/Workers. Docker's static frontend image deliberately does not host the backend.
- Cross-provider release parity: **NOT VERIFIED** until the exact same source commit is built and smoke-tested on each configured provider.

## Failover and recovery design

A future traffic controller may switch the public frontend only after it has independently verified both targets. It must:

1. Probe the public HTTPS origin, static assets, application routes, and the relevant runtime/API contracts separately.
2. Distinguish quota exhaustion, rate limiting, provider-side errors, deployment failure, DNS failure, and application/backend failure. Do not treat HTTP 429, Cloudflare quota errors, or a Worker 1027 response as a healthy origin.
3. Require multiple consecutive failures and a cooldown/hysteresis window before switching; avoid flip-flopping on a transient probe failure.
4. Confirm the standby uses the same approved source commit and compatible public runtime contracts.
5. Preserve authentication/session behavior, API request methods and bodies, CORS, security headers, and cache semantics.
6. Verify the selected origin after switching and record timestamped evidence, reason, source commit, and observed status.
7. Test recovery before failback. Do not automatically return to a recovered provider until it passes the same health and contract checks for a stability window.
8. Fail closed for backend-dependent functionality when the backend is unavailable. Never replace an API response with the SPA HTML shell or a fabricated success response.

A Cloudflare-controlled DNS or Load Balancing configuration alone cannot guarantee recovery from a Cloudflare-wide outage. Full provider independence requires a traffic-control/DNS path that remains reachable when either application host is unavailable, plus independent backend capacity and tested data/identity dependencies.

## Release and authorization gates

- Pull requests validate the frontend tests, TypeScript, Vite build, static server, Vercel rewrite order, and container smoke tests.
- The MPHR validation workflow is verification-only: it does not publish container images, deploy Vercel, deploy Cloudflare, write DNS records, or switch production traffic.
- Vercel project linking and any production deployment require a separately approved Vercel team/project configuration and protected release path.
- Docker production hosting requires an owner-selected independent host, least-privilege runtime secrets, persistent storage/database design, TLS, health checks, backups, and rollback evidence.
- Automatic traffic failover must remain disabled until independent host readiness, provider-specific credentials, public domain ownership, external routing, and rollback behavior are all proven.
- No PR is auto-merged. No unverified build is promoted. No plan/limit is represented as free unless the actual account entitlement has been confirmed.

## Delivery phases

1. **Portable frontend source and verification:** add provider-neutral static container contract, Vercel static project configuration, and CI validation without publishing or deploying.
2. **Standby provisioning:** link/configure a Vercel project and independently host the Docker frontend only after owner-controlled access, domain, and deployment protections are established.
3. **Independent backend readiness:** make API/auth/data execution available independently of the Cloudflare runtime, with parity and authentication evidence.
4. **Independent traffic control:** configure a routing/DNS controller outside the two hosting providers, then exercise failover and failback using controlled tests before enabling any automatic production action.

Until phases 2–4 are separately completed and evidenced, this architecture provides portability and a tested candidate frontend artifact—not automatic bidirectional hosting failover.
