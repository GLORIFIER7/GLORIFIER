# AI Council deployment safety

The AI council can fan out to multiple metered providers and may issue a separate synthesis request. It is restricted to the verified owner or a configured internal service. Owner requests are limited to two starts per minute per authenticated UID; internal-service requests are limited to two starts per minute per observed socket-peer IP. Client-supplied `X-Real-IP` and `X-Forwarded-For` headers are ignored; behind a reverse proxy, traffic may share the proxy's peer-IP bucket, which is intentionally conservative.

The current limiter uses the Express process-local memory store. **Do not run the AI council behind multiple backend replicas with this store.** In production (defined as `NODE_ENV=production`), the route fails closed with HTTP 503 unless the deployment explicitly sets. Ensure `NODE_ENV=production` is set in the production backend so this safeguard is active:

```env
AI_COUNCIL_SINGLE_INSTANCE=true
```

Set this only when the backend scheduler/platform is configured to run exactly one instance. If horizontal scaling is required, implement and verify a shared atomic rate-limit store (for example, a Supabase RPC backed by a dedicated quota table) before enabling the route. Do not treat the environment flag as proof that the platform is single-instance; it is an operator attestation.

The setting is not a secret. This change does not set it, deploy the service, or modify any provider credentials. Without the setting in production, council execution remains disabled.
