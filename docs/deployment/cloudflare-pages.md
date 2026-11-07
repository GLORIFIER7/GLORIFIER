# Cloudflare Pages public interface

## Intended production topology

- **Public website:** `https://glorifier.pages.dev` (Cloudflare Pages).
- **Private application/API execution:** the existing Cloudflare Worker named `glorifier`.
- **NEURAL execution service:** the separate `glorifier-neural` Worker, retaining its own authentication and service boundary.
- **Database and provider credentials:** remain on server-side Worker bindings/secrets; never expose them through `VITE_*` build variables.

Pages serves the static Vite frontend. A Pages catch-all Function forwards only the existing runtime routes to the internal `glorifier` Worker through the `GLORIFIER_WORKER` service binding. The service binding is Cloudflare's Worker-to-Worker path; it does not require a request to the public `workers.dev` hostname.

The root-level Pages Function invocation manifest is maintained at `public/_routes.json`. Vite copies it to `dist/_routes.json`, which Cloudflare Pages reads at deployment. It limits Function invocation to `/api`, `/api/*`, `/auth`, `/auth/*`, `/mcp`, `/mcp/*`, and `/.well-known/agent-card.json`. Static assets and frontend routes bypass the Pages Function, preserving Pages' unlimited free static-request allowance. The Cloudflare Worker remains reachable through the private service binding only; this manifest does not change Worker Access policies.

The Pages Function forwards these paths:

- `/api` and `/api/*`
- `/auth` and `/auth/*`
- `/mcp`
- `/.well-known/agent-card.json`

All other paths continue through Pages static asset and SPA routing. Missing service bindings fail closed with JSON 503 responses. Service-binding exceptions return a bounded JSON 502 without exposing internal exception details.

## Pages project build settings

Cloudflare Pages project `glorifier` is provisioned in the GLORIFIER account and connected to `GLORIFIER7/GLORIFIER`. Its deployment settings are:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Build watch paths | `*` (all repository paths) |
| Preview deployments | Custom branch patterns: `fix/*`, `ops/*`, `feat/*`, `feature/*`, `security/*`, `docs/*`, `test/*`, `chore/*` |
| Root directory | `/` |
| Build command | `npm ci --no-audit --no-fund --ignore-scripts && CLOUDFLARE_BUILD=true npm run build:frontend` |
| Build output directory | `dist` |
| Node.js build version | `24.12.0` or newer |
| Production service binding | `GLORIFIER_WORKER` → Worker service `glorifier` |
| Preview service binding | None; preview deployments do not receive the production Worker binding |

Do not set `VITE_API_BASE_URL` for the Pages deployment. The application uses same-origin `/api/*` and `/auth/*` requests, which the Pages Function sends to the internal Worker.

The production Pages environment is configured with the `GLORIFIER_WORKER` service binding to the `glorifier` Worker. Production Git deployments are enabled and build watch paths are `*` (all repository paths). Preview deployments are enabled only for the branch patterns listed above and are protected by Cloudflare Access for account members. Preview deployments have no `GLORIFIER_WORKER` service binding; API routes therefore fail closed rather than receiving production backend access. Do not add production credentials or production service bindings to untrusted previews.

## Safe cutover sequence

1. Keep the Pages project connected to `GLORIFIER7/GLORIFIER` with production branch `main`, the configured build command, output directory `dist`, and the reviewed production service binding.
2. For each change merged to `main`, inspect the Git-integrated Pages deployment result and confirm that the deployed commit matches the intended main commit.
3. Confirm the build artifact contains `index.html`, Vite assets, `_routes.json`, and the Functions bundle. The manifest must remain restricted to the approved backend route allowlist.
4. Verify static assets, nested-route refresh, `/api/health`, Worker-native reporting/identity responses, unauthenticated authorization boundaries, login/logout, and callback URLs on the Pages origin.
5. Update Firebase Authentication authorized domains and OAuth redirect/return URLs only after provider configuration has been reviewed.
6. Confirm required UI flows and APIs on Pages. API routes that the Worker deliberately reports as unavailable remain unavailable; a frontend deployment does not prove legacy backend migration or provider health.
7. Only after successful Pages verification and a rollback plan, change or disable any direct `workers.dev` exposure for the main Worker. The Pages service binding must remain configured and tested first.
8. Keep the NEURAL Worker behind its existing authentication policy. Do not remove its Access policy or expose its direct hostname as a public app.

## Evidence and limitations

The Cloudflare account contains the Pages project `glorifier`, linked to this repository, with production Git deployments enabled and `GLORIFIER_WORKER → glorifier` configured. A production deployment from commit `11c27b3070d8cc559e9d3de9adc602d00718744c` completed successfully on 2026-11-07 (deployment ID prefix `406ca01d`). Read-only external probes confirmed the public homepage, `/api/health`, `/api/business-model`, and `/api/reports/summary` responded successfully. The `/api/revenue/control-plane` route returned HTTP 503 because its backend adapter is not yet Worker-native/configured. These observations do not claim that all backend routes, authentication flows, databases, AI providers, or external integrations are fully verified.

A successful `/api/health` response proves only that the Worker runtime answered. It does not prove backend, identity-provider, database, NEURAL, or AI-provider health. Continue to use evidence-backed status labels and keep missing evidence as NOT VERIFIED.

## Verification before production

- `npm run test:cloudflare-worker` includes the Pages proxy contract tests.
- The Pages preview renders the built frontend and static assets with correct content types.
- Direct navigation and refresh work for frontend routes.
- `/api/health` returns JSON from the Worker, not the Pages SPA shell.
- `/api/app-state` remains protected and returns the documented unauthenticated response when no session is supplied.
- The Pages service binding is the only application-to-Worker path required for browser requests; no browser JavaScript calls the private `workers.dev` origin.
- Login/logout, session cookies, OAuth callbacks, and protected API calls succeed on the Pages hostname.
- The old Worker public hostname is not disabled until all replacement checks pass.
