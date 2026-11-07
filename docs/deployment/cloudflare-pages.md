# Cloudflare Pages public interface

## Intended production topology

- **Public website:** `https://glorifier.pages.dev` (Cloudflare Pages).
- **Private application/API execution:** the existing Cloudflare Worker named `glorifier`.
- **NEURAL execution service:** the separate `glorifier-neural` Worker, retaining its own authentication and service boundary.
- **Database and provider credentials:** remain on server-side Worker bindings/secrets; never expose them through `VITE_*` build variables.

Pages serves the static Vite frontend. A Pages catch-all Function forwards only the existing runtime routes to the internal `glorifier` Worker through the `GLORIFIER_WORKER` service binding. The service binding is Cloudflare's Worker-to-Worker path; it does not require a request to the public `workers.dev` hostname.

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
| Preview deployments | Disabled |
| Root directory | `/` |
| Build command | `npm ci --no-audit --no-fund --ignore-scripts && CLOUDFLARE_BUILD=true npm run build:frontend` |
| Build output directory | `dist` |
| Node.js build version | `24.12.0` or newer |
| Production service binding | `GLORIFIER_WORKER` → Worker service `glorifier` |

Do not set `VITE_API_BASE_URL` for the Pages deployment. The application uses same-origin `/api/*` and `/auth/*` requests, which the Pages Function sends to the internal Worker.

The production Pages environment is configured with the `GLORIFIER_WORKER` service binding to the `glorifier` Worker. Production Git deployments are enabled, build watch paths are `*` (all repository paths), and preview deployments remain disabled. Initial pushes were skipped because the project initially had an empty path-includes rule (`skip_reason: path_config`); this has been corrected to `*`. No successful production deployment has been observed yet; a subsequent push to `main` should trigger the initial Git-integrated Pages build. Do not bind production credentials or production services into untrusted preview deployments. Keep preview deployments disabled unless isolated, reviewed bindings are established.

## Safe cutover sequence

1. Keep the Pages project connected to `GLORIFIER7/GLORIFIER` with production branch `main`, the configured build command, and output directory `dist`.
2. Merge a reviewed, CI-green commit to `main` to trigger the initial Git-integrated Pages build.
3. Inspect the Pages deployment logs and confirm the build artifact contains `index.html`, the Vite assets, and the `functions/` routes.
4. Verify static assets, nested-route refresh, `/api/health`, Worker-native reporting/identity responses, unauthenticated authorization boundaries, login/logout, and callback URLs on the Pages origin.
5. Update Firebase Authentication authorized domains and OAuth redirect/return URLs to include the exact Pages hostname only after the provider configuration has been reviewed.
6. Confirm all required UI flows and APIs on Pages. API routes that the Worker deliberately reports as unavailable remain unavailable; a frontend deployment does not prove legacy backend migration or provider health.
7. Only after successful Pages verification and a rollback plan, disable the old public `workers.dev` route for the main Worker. The Pages service binding must remain configured and tested first.
8. Keep the NEURAL Worker behind its existing authentication policy. Do not remove its Access policy or expose its direct hostname as a public app.

## Evidence and limitations

The Cloudflare account contains the Pages project `glorifier`, linked to this repository, with production Git deployments enabled and `GLORIFIER_WORKER → glorifier` configured. At the latest configuration check, `latest_deployment` and `canonical_deployment` were null; therefore the Pages project exists but its first deployment has not yet been verified. The production deployment is triggered by a new commit to `main`. This does not claim that all backend routes are implemented, or that authentication, databases, AI providers, or external integrations are fully verified.

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
