# Auth0 + Firebase Authentication

## Status

This change adds an opt-in Auth0 Authorization Code + PKCE browser flow and Auth0 RS256 access-token verification to the existing Firebase authentication path. Firebase remains supported. No Auth0 tenant, production callback, API audience, or live login has been configured or verified by this repository change.

## Configuration

Set these values in the relevant runtime/build environments. Do not commit actual values or secrets.

- `AUTH0_ISSUER_BASE_URL`: the Auth0 tenant/custom-domain issuer URL, HTTPS only, e.g. `https://YOUR_TENANT.auth0.com/`. The issuer must match the access token's `iss` claim exactly, including the trailing slash.
- `AUTH0_AUDIENCE`: the identifier of the Auth0 API registered for GLORIFIER.
- `VITE_AUTH0_DOMAIN`: the Auth0 tenant/custom domain hostname only, without scheme or path.
- `VITE_AUTH0_CLIENT_ID`: the public SPA application client ID. Never use a client secret in a `VITE_*` variable.
- `VITE_AUTH0_AUDIENCE`: the same API identifier as `AUTH0_AUDIENCE`.

The Auth0 application must be configured as a Single Page Application using Authorization Code Flow with PKCE. Add the exact application origin/path currently used by the GLORIFIER frontend to Allowed Callback URLs, Allowed Logout URLs, and Allowed Web Origins as appropriate. Configure the API audience and RS256 signing. Keep Firebase provider configuration and Firebase Authorized Domains unchanged while both providers are supported.

## Behavior and security boundaries

- The Auth0 browser flow creates a random state, nonce, and PKCE verifier; it checks state on callback and checks the returned ID token's issuer, audience, nonce, and subject for UI identity only.
- The API access token is validated server-side using the configured issuer, audience, expiry, not-before time, RS256 signature, and a key from the issuer's JWKS endpoint. JWKS retrieval fails closed and uses a short in-memory cache.
- Auth0 roles and owner-like claims are not copied into Firebase custom-claim fields. Owner access still depends on GLORIFIER's configured owner UID/email policy or existing trusted Firebase claims.
- Auth0 is opt-in. If the Auth0 issuer/audience are not configured, Firebase verification remains the normal path.
- Browser tokens are held in session storage for the current tab/session and cleared by sign-out. As with any browser token, XSS prevention and a strict CSP remain important.
- This implementation does not create Auth0 users, modify a tenant, set secrets, deploy, or migrate Firebase accounts.

## Verification

Run:

```sh
npm run test:auth0-token
npm run test:backend-auth
npm run test:protected-api-paths
npm run lint
npm run build
```

GitHub Actions runs the Auth0 token-validation test as part of the normal CI workflow. Passing tests prove local verifier behavior, not that a real Auth0 tenant or production callback is correctly configured.
