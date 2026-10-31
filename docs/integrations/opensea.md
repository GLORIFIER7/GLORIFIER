# OpenSea integration

GLORIFIER uses the OpenSea REST API v2 for read-only metadata on its registered collections.

## Credentials

| Cloudflare Worker secret | Purpose | Used by |
|---|---|---|
| `OPENSEA_API_KEY` | Application API key | Public collection lookups, sent only in the `X-API-KEY` header |
| `OPENSEA_SCOPED_TOKEN` | Wallet-scoped personal access token (PAT) | Reserved for wallet-scoped operations that explicitly require wallet authorization; not used by public collection lookups |

The credentials are different values and are not interchangeable. Do not send the PAT in the `X-API-KEY` header or as a Bearer token. OpenSea requires the PAT to be exchanged for a short-lived wallet JWT before using wallet-scoped endpoints. Public collection metadata does not require a PAT or wallet JWT.

The current GLORIFIER integration intentionally does not exchange or use the scoped token because its supported routes are public, read-only collection lookups. A configured secret name is not proof that its value is valid.

## Worker routes

- `GET /api/opensea/health` — performs an authenticated read-only lookup of the `glorifier7` collection and reports whether the API key was accepted. Its upstream cache TTL is zero so the check revalidates the API key on each probe.
- `GET /api/opensea/collections/glorifier7` — returns public collection metadata for the ERC-721 collection.
- `GET /api/opensea/collections/glorifier1` — returns public collection metadata for the ERC-1155 collection.

Collection metadata responses use a 60-second Cloudflare edge cache to reduce API-key quota usage. The health route is never cached.

Only the two registered GLORIFIER collection slugs are accepted. Routes reject other methods and unknown slugs. Upstream errors, rate limits, timeouts, and malformed responses are reported without exposing credentials or upstream response bodies.

## Runtime configuration

Set `OPENSEA_API_KEY` as a Cloudflare Worker secret. Never put the key in `wrangler.jsonc`, frontend code, GitHub source files, logs, or request URLs. `OPENSEA_SCOPED_TOKEN` should remain in Cloudflare Secrets until a separately reviewed wallet-scoped feature requires it.

## Verification

The OpenSea Worker tests mock the provider boundary. They verify the header, allowed routes, fail-closed behavior, provider error mapping, and that neither API credential is returned to callers. They do not prove live OpenSea connectivity. After the reviewed change is deployed, call `/api/opensea/health` to test the actual Cloudflare secret and OpenSea API response.
