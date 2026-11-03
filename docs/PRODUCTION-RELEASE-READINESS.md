# Production Release Readiness

This checklist separates source validation from deployment and live-environment readiness. A green build or successful deployment alone does not mean the service is production-ready.

## Pull request and source controls

- [ ] Work is proposed through a pull request targeting `main`; do not push maintenance changes directly to `main`.
- [ ] One approving review is recorded and all review threads are resolved.
- [ ] Required CI, security, dependency, workflow-syntax, and integration checks are configured in the active `main` ruleset and pass for the exact PR head.
- [ ] Do not bypass failed or pending checks. Keep any break-glass bypass narrowly scoped, documented, and auditable.
- [ ] Review the latest static-analysis findings and coverage evidence. A successful analyzer workflow is not proof that the issue backlog is empty.

## Pre-deployment

- [ ] Confirm the release commit is the reviewed `main` commit and all required checks are green.
- [ ] Confirm the Cloudflare production deploy is triggered only through the protected, explicitly authorized workflow; validation/dry-run is not deployment authorization.
- [ ] Confirm required credentials exist in the deployment secret store without copying values into pull requests, logs, or this checklist.
- [ ] Confirm owner-approved canonical domain/email settings before claiming organizational identity is ready. Do not substitute a `workers.dev` host for verified organizational identity.
- [ ] If enabling Neural, obtain an owner-reviewed HTTPS origin, exact hostname allowlist, and server-side runtime token. Never infer or log their values. Keep Neural unavailable when any are missing.
- [ ] Confirm database and other production configuration through approved read-only probes. Do not run migrations, data synchronization, paid operations, signing, or transactions as part of this release checklist.

## Post-deployment verification

Run the repository's GET-only production smoke after the approved deployment and verify:

- [ ] `/api/build-info` identifies the exact expected source commit and Worker version.
- [ ] Worker health and static assets respond as expected.
- [ ] Runtime verification confirms the declared production database provider and exact operational read-model counts.
- [ ] Unauthenticated protected requests are rejected with the documented authentication response.
- [ ] Public read models return their documented, secret-free contracts.
- [ ] Identity and Neural readiness are reported accurately. A `not-ready`, unavailable, or unprobed dependency is not a successful readiness claim.
- [ ] Smoke output and run records contain no secret values, user payloads, or raw upstream error details.
- [ ] Record the deployment commit, workflow run, smoke result, and any remaining NOT VERIFIED boundaries in the release record.

## Stop conditions and ownership

Stop the release and record the blocker instead of guessing when required owner-provided configuration, a required review, a required check, exact source provenance, or a required live probe is missing or fails. Keep endpoints fail-closed until approved configuration is available. Do not deploy directly from an autonomous coding task, auto-merge a pull request, weaken CI/security checks, or claim production readiness based only on source-level tests.

This checklist does not alter GitHub rulesets, create or change secrets, configure external providers, or authorize a production deployment. Those actions require the appropriate repository/production administrator and the normal reviewed release process.
