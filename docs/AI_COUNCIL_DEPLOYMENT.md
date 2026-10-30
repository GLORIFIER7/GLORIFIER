# AI Council deployment safety

The AI council can fan out to multiple metered providers and may issue a separate synthesis request. It is owner-only and limited to two starts per minute per authenticated principal.

The current limiter uses the Express process-local memory store. **Do not run the AI council behind multiple backend replicas with this store.** In production, the route fails closed with HTTP 503 unless the deployment explicitly sets:

```env
AI_COUNCIL_SINGLE_INSTANCE=true
```

Set this only when the backend scheduler/platform is configured to run exactly one instance. If horizontal scaling is required, implement and verify a shared atomic rate-limit store (for example, a Supabase RPC backed by a dedicated quota table) before enabling the route. Do not treat the environment flag as proof that the platform is single-instance; it is an operator attestation.

The setting is not a secret. This change does not set it, deploy the service, or modify any provider credentials. Without the setting in production, council execution remains disabled.
