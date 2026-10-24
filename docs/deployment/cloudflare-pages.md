# Cloudflare Workers frontend deployment

GLORIFIER already has a Cloudflare Worker entry point in `src/worker.ts` and configuration in `wrangler.jsonc`. Use the existing Worker at `https://glorifier.glorifier.workers.dev/` rather than creating a separate Cloudflare Pages project.

## Existing architecture

- Static frontend: Vite build output in `dist`, served through the Worker's `ASSETS` binding.
- API and authentication: Worker-native handlers cover selected routes. Remaining `/api/*` and `/auth/*` routes require an explicitly configured `GLORIFIER_BACKEND_ORIGIN`; there is no implicit Railway fallback, and unconfigured routes fail closed.
- Database: backend database access is not proven to be Worker-native. Never expose database credentials in frontend or Worker client-visible values.

## GitHub-connected deployment

1. In Cloudflare Dashboard, open **Workers & Pages**.
2. Select the existing `glorifier` Worker.
3. Under **Settings → Builds**, connect the `GLORIFIER7/GLORIFIER` GitHub repository if it is not already connected.
4. Configure the production branch as `main`. Use the repository's lockfile-based install and frontend build command `npm ci && npm run build:frontend`; use the deploy command `npx wrangler deploy --config wrangler.jsonc` only after Wrangler is explicitly pinned in `package.json` and the lockfile and the command is verified in CI. Check the dashboard's detected settings before saving.
5. For previews, use **Settings → Builds → Set up Worker Previews**, configure preview-specific variables, secrets, and bindings, review the preview command, and select **Switch to Worker Previews**. Then open **Settings → Build → Branch control** and enable preview builds for non-production branches. This switch is not reversible, so review Cloudflare's current guidance before enabling it.
6. Keep secrets in Cloudflare Worker secrets or Railway environment variables, never in `VITE_*` variables. Do not point previews at production unless their access controls and backend origin policy are explicitly reviewed.
7. Confirm Firebase Authentication's Authorized domains include the exact intended Worker origin before testing popup/redirect sign-in; do not broadly allow wildcard preview domains.
8. Check OAuth callback/return URLs against the configured `GLORIFIER_FRONTEND_URL`; do not claim `/auth/*` is fully verified until the callback returns to the intended Worker origin and a real login round-trip succeeds.
9. Deploy a preview and verify it before changing production routing.

Cloudflare's documented Git integration can build and deploy a Worker on pushes and provides preview deployments for non-production branches: https://developers.cloudflare.com/workers/ci-cd/builds/ and https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/.

This repository is configured for **Cloudflare Workers with `wrangler.jsonc`**, not Cloudflare Pages. Do not add a Pages-only `public/_redirects` file or use Pages `200` proxy rewrites for this Worker. The Worker itself must implement API/auth proxying. The Railway origin is not a credential, but it must be kept server-side in Worker configuration and never baked into `VITE_*` client variables. Preview traffic must not become an unreviewed proxy into production.

## Verification before production

- Home page loads and static assets return the expected content types.
- Nested routes survive direct navigation and refresh.
- `/api/health` returns a valid API response rather than HTML.
- Login/logout, session cookies, protected API calls, and CORS work on mobile.
- Missing JavaScript/CSS assets return 404 rather than the SPA HTML.
- Worker logs show no upstream failures or secret leakage.

Do not disable or delete the Vercel deployment until the Cloudflare Worker is verified and a rollback path is confirmed.
