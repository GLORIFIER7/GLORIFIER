# Cloudflare Autopilot migration status

## Current scope

The Cloudflare Worker has a five-minute Cron Trigger for one bounded, read-only mission-analysis cycle. The cycle is deliberately disabled unless both the GLORIFIER Worker and NEURAL independently report the exact Cloudflare Workers AI provider, pinned model, explicit Workers Free plan verification attestation, free-only mode, and enabled inference flags.

The cycle uses the existing private GLORIFIER-to-NEURAL Service Binding and the dedicated Neon Hyperdrive mission store. It checks the provider configuration before claiming a mission, claims at most one queued mission per cycle, rejects credential-like or oversized mission objectives, sends one bounded read-only analysis request, rejects responses from any provider other than `cloudflare_workers_ai`, records a response digest, and leaves the mission blocked with `pending-external-evidence`.

A model response is evidence that a provider returned text. It does not establish that the analysis is factually correct, that a GitHub change occurred, or that any repository, production, or business outcome is verified.

## Explicitly not migrated

This Worker path is not yet a full replacement for the Node Autopilot orchestrator. The following capabilities remain unavailable in the Cloudflare execution path:

- AI CEO multi-stage planning and Specialist Council arbitration.
- GEAS policy evaluation across the complete mission graph.
- A2A task dispatch and durable inter-agent handoff.
- GitHub read/write capability adapters, branch creation, file updates, draft PR publication, and GitHub source-readback verification.
- Independent verification from a separate trust domain.
- Automatic resumption of interrupted side effects.

The Worker must not mark an analysis-only mission as completed execution. The current Worker keeps it blocked pending external evidence and capability migration.

## Cost and authorization controls

The monthly paid-inference budget remains USD 0. Paid provider fallback, auto-top-up, pay-as-you-go, broad external data egress, automatic merge, and automatic production deployment remain disabled.

The `GLORIFIER_WORKERS_PLAN` value alone is not proof of an account entitlement. Activation requires an owner-reviewed, independently confirmed Workers Free entitlement recorded by setting `GLORIFIER_WORKERS_PLAN_VERIFIED=true` in both Worker environments. This attestation is distinct from the model's runtime binding check. The current production settings intentionally use `GLORIFIER_WORKERS_PLAN=unverified`, `GLORIFIER_WORKERS_PLAN_VERIFIED=false`, `GLORIFIER_WORKERS_AI_FREE_ONLY=false`, and `GLORIFIER_ENABLE_INFERENCE=false`.

Cloudflare Workers AI has finite free usage. The owner must confirm current plan and usage terms before enabling the verification attestation. If the account is not confirmed to be on Workers Free, do not enable this path. Do not switch to a paid provider as a fallback.

## Production database

The production Neon `glorifier` database has the `public.glorifier_autopilot_missions` table, requester-scoped row-level security, and least-privilege `SELECT`, `INSERT`, and `UPDATE` grants for `glorifier_worker_app_rw`. The Worker database adapter performs no DDL and checks the table and grants at startup.

## Deployment and verification

A source change and passing CI do not prove a production deployment. After the reviewed PR is merged, use the explicit Cloudflare release workflows, deploy both Workers, and verify the exact deployed Worker version, Cron Trigger, Hyperdrive binding, NEURAL Service Binding, and the authenticated readiness route. Do not enable model inference until the account entitlement is separately verified. Do not merge or deploy automatically from the scheduled mission cycle.
