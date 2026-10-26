# Keycloak OIDC Integration Plan

## Status

Discovery and implementation plan only. No Keycloak realm, client, credentials, runtime integration, or production behavior has been verified. This document does not claim that Keycloak is integrated.

## Repository evidence reviewed

- `src/lib/auth/backend-auth.ts`: Firebase Admin ID-token verification with revocation checking; authentication middleware; owner checks; a separate configured internal-service token.
- `src/lib/auth/backend-auth.test.ts`: regression checks for authentication, owner-only access, and fail-closed internal-service authentication.
- `src/lib/auth/protected-api-paths.ts` and `src/lib/auth/protected-api-paths.test.ts`: protected API read-path classification and tests.
- `src/lib/openprofile-integration.ts`: existing OIDC-style integration pattern, including state/nonce/PKCE concepts.
- `package.json`: `test:backend-auth`, `test:protected-api-paths`, `lint`; Firebase Admin dependency present; no explicit Keycloak SDK dependency observed in the inspected manifest.

## Proposed implementation

### 1. Add a provider-neutral principal contract

Create `src/lib/auth/identity-provider.ts` (or reuse an existing canonical identity contract if further inspection finds one). Define a minimal normalized principal with immutable subject, issuer, audience/client context, verified email when present, and explicitly mapped application roles. Do not copy raw provider claims into authorization decisions.

Acceptance:
- Firebase remains the default provider and existing callers remain compatible.
- Missing or malformed identity fields fail closed.
- Provider-specific claim mapping is isolated from route handlers.

### 2. Add an optional Keycloak verifier

Create `src/lib/auth/keycloak-oidc.ts` using a maintained OIDC/JWT library selected after checking current dependency and lockfile policy. Configure only through environment variable names; never commit credentials. Require an explicit issuer URL and expected audience/client ID. Use discovery metadata and JWKS signature verification; validate issuer, audience, expiration, not-before, and allowed signing algorithm. Cache discovery/JWKS safely with key-rotation handling. Reject ID tokens when the API contract requires access tokens.

Acceptance:
- Invalid signature, wrong issuer, wrong audience, expired token, not-yet-valid token, unsupported algorithm, missing key, and malformed token all reject.
- Discovery/JWKS network errors fail closed without falling back to unverified decoding.
- No client secret is exposed to the frontend.
- Keycloak is opt-in; Firebase behavior does not change when it is not configured.

### 3. Integrate with existing middleware

Extend `src/lib/auth/backend-auth.ts` through a narrow verifier adapter or dependency injection. Preserve the existing `TokenVerifier` seam where possible. Do not let Keycloak tokens bypass `createRequireAuthentication`, `createRequireOwner`, or `createRequireOwnerOrInternalService`.

Acceptance:
- Existing Firebase tests pass unchanged or with narrowly justified compatibility updates.
- Existing internal-service token checks remain separate and fail closed.
- No provider role named `owner` or `admin` grants GLORIFIER owner authority by itself.

### 4. Explicit authorization mapping

Use an explicit configuration-backed mapping from trusted Keycloak issuer/client/realm roles to low-privilege GLORIFIER application roles. Owner authority must remain bound to the configured GLORIFIER owner identity or a separately approved, auditable owner mapping. Never trust user-editable profile attributes as privileged claims.

Acceptance:
- Ordinary authenticated users receive no owner privileges by default.
- Unknown roles, issuers, clients, and ambiguous mappings fail closed.
- Human approval gates for deployments, merges, secrets, and financial actions remain unchanged.

### 5. Configuration and documentation

Document the optional environment variables in `.env.example` without real values, including issuer, audience/client ID, and role mapping. Add setup/rollback instructions to the relevant authentication documentation after locating the canonical document. Do not create or modify a live Keycloak realm as part of code changes.

Acceptance:
- No secret values are committed.
- Missing Keycloak configuration leaves the current Firebase path operational.
- Rollback is a configuration change, not a database migration.

## Deterministic test plan

Add `src/lib/auth/keycloak-oidc.test.ts` and extend `src/lib/auth/backend-auth.test.ts` to cover:

1. Valid signed access token from the configured issuer/audience.
2. Invalid signature and unknown key ID.
3. Issuer and audience mismatch.
4. Expired and not-yet-valid token.
5. Unsupported algorithm and malformed token.
6. Discovery/JWKS unavailable and key rotation behavior.
7. Keycloak disabled: Firebase verifier remains the default.
8. Non-owner Keycloak principal denied by owner-only middleware.
9. Unmapped/unknown role cannot grant owner authority.
10. Internal-service authentication remains independent and fail-closed.
11. Protected API routes still require authentication.
12. No token or secret values are logged in errors.

Use deterministic fixtures and a local/mock JWKS endpoint; no live identity provider, production credentials, or network access should be required for unit tests.

## CI gates

- `npm run test:backend-auth`
- `npm run test:protected-api-paths`
- the new Keycloak test command, added to `package.json`
- `npm run lint`
- applicable repository security/dependency scans
- full relevant required checks on the exact PR head SHA

Do not merge until required checks pass and the authorization mapping receives human review. Do not deploy or configure production credentials without explicit approval.

## Audit limitations

This was a read-only source inspection via GitHub. Tests were not executed in this session. Live Keycloak configuration, provider behavior, production routes, and CI status were not verified. This plan is not evidence that any fix has been implemented.
