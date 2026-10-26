# GitHub-to-Zite Evidence Synchronization

**Status: DESIGN ONLY — NOT CONNECTED OR RUNNING**

## Purpose

Create a reviewable, idempotent mirror of selected GitHub operational evidence in a Zite workspace. GitHub remains the source of truth for repositories, issues, pull requests, commits, and Actions checks. Zite is a reporting/index surface; it must not be able to merge pull requests, deploy software, modify repository settings, or trigger paid actions through this workflow.

## Current evidence and blockers

- The GitHub repository `GLORIFIER7/GLORIFIER` is accessible and has existing interoperability capability schemas and validation scripts.
- The connected Zite workspace discovery returned an empty list. No target workspace, database, table IDs, or Zite connection was available to verify.
- Therefore no live sync, webhook, database write, or Zite app change is claimed by this design.

## Recommended rollout

### Phase 0 — Contract and review

1. Review this design and the companion event schema.
2. Create or select a Zite workspace only after the owner confirms the destination.
3. Define tables using the schema below; record the workspace/database/table identifiers as configuration, not in source.
4. Keep the initial integration read-only toward GitHub and use a least-privilege Zite connection.

### Phase 1 — Pull-based synchronization

Use a manually dispatched or scheduled GitHub Actions job to fetch bounded pages of:
- repository metadata and default branch;
- open issues and pull requests;
- latest commit/check-run/status summaries for relevant heads;
- workflow-run metadata and conclusions.

Use pagination and explicit query windows. Do not assume one page is exhaustive. Store the last successful checkpoint only after all pages are validated and upserted. A failed batch must not advance the checkpoint.

For each source object, upsert by a stable key: `source + repository + object_type + external_id`. Keep source `updated_at` and observation time separately. Replaying a batch must update the same row, not create duplicates.

### Phase 2 — Event-driven refresh (optional)

After pull-based reconciliation is proven, optionally accept GitHub webhook deliveries through a verified receiver. Verify the GitHub HMAC signature against a secret stored in the platform secret manager, reject invalid signatures, and deduplicate by delivery ID. Treat webhook payloads as hints: re-fetch the authoritative object from GitHub before writing normalized state. Retain periodic reconciliation because webhooks can be delayed or missed.

### Phase 3 — Operational assurance

- Add bounded retries with exponential backoff for transient failures and rate limits; respect `Retry-After`.
- Use a per-run idempotency key and a dead-letter/error record that excludes credentials and sensitive payloads.
- Emit counts, checkpoint, source timestamp, observation timestamp, and redacted error class; never log tokens, signatures, webhook secrets, or full environment variables.
- Make synchronization one-way: GitHub → Zite. Any future write-back must be a separate, explicitly reviewed workflow with its own authorization gates.
- Do not enable automatic merge, deployment, repository administration, or billing actions.

## Evidence status rules

Use the vocabulary already present in `docs/architecture/interoperability-capabilities.schema.json`:

- `VERIFIED`: the specific claim is supported by fresh, directly observed evidence and its required deterministic checks passed.
- `PARTIALLY VERIFIED`: some checks passed, but at least one relevant boundary is untested or only mocked.
- `NOT VERIFIED`: required evidence is absent, stale, failed, or not yet validated.
- `DEGRADED`: an integration previously observed working is currently failing or materially impaired, with recent failure evidence.
- `NOT OBSERVABLE`: the source cannot currently be inspected or no trustworthy observation can be obtained.

A status belongs to a narrowly scoped claim, not the entire product. A green CI run verifies only the checks in that run and commit; it does not prove a deployment is live. Missing evidence must never be upgraded to success. Do not write `FULLY VERIFIED` into this registry: it is not part of the existing capability schema vocabulary. If a summary label is later required, derive it from an explicitly defined set of independently verified requirements rather than accepting it from a source payload.

Every status record should include evidence references, target environment, observation time (nullable only when no observation exists), scope, limitations, and the source object’s update time. A sync success status means only that the mirror operation succeeded; it does not mean the underlying issue, PR, build, or deployment is healthy.

## Minimum Zite data model

1. **GitHub Evidence** — stable source key, repository, object type/ID, title, URL, source state/conclusion, source updated time, observed time, evidence status, evidence references, scope, limitations, last sync run ID.
2. **Sync Runs** — run ID, start/end time, status, source window/checkpoint, counts read/upserted/skipped/failed, redacted error class.
3. **Sync Errors** — run ID, stable source key if known, retryable flag, attempt count, redacted error class, next retry time. Never store credentials or raw authorization headers.

Use unique constraints where supported. If Zite cannot enforce uniqueness atomically, use a serialized writer and verify uniqueness during reconciliation before calling the mirror reliable.

## Acceptance criteria

- [ ] Owner-selected Zite workspace and table IDs are confirmed; no workspace is inferred.
- [ ] A sample record validates against the companion schema and maps to the existing status vocabulary.
- [ ] Two identical sync runs produce no duplicate source records.
- [ ] A partial failure does not advance the checkpoint.
- [ ] Pagination and rate-limit handling are tested with deterministic fixtures.
- [ ] Invalid webhook signatures are rejected before any write (only if Phase 2 is implemented).
- [ ] Logs and error records contain no secrets or raw authorization headers.
- [ ] GitHub permissions are read-only; no merge, deployment, repository administration, or paid action occurs.
- [ ] CI validates the schema and tests the normalizer/upsert-key/checkpoint behavior.
- [ ] Live Zite synchronization remains marked `NOT VERIFIED` until an owner-approved workspace is connected and an end-to-end test is evidenced.

## Out of scope for this PR

This PR documents the architecture and event contract only. It does not create a Zite workspace, store credentials, install webhooks, schedule a job, write production records, merge, or deploy.
