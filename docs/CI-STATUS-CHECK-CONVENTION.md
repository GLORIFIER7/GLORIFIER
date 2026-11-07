# GLORIFIER CI and status-check convention

Last reviewed: 2026-10-16

## Purpose

Keep required validation fast and trustworthy without making an optional hosting provider's deployment quota a proxy for code quality. This convention applies to pull requests, main, production checks, and evidence/status reporting.

## Required merge gate

A pull request is eligible for automatic merge only when GitHub's configured required checks and review rules are satisfied. Do not bypass CI, security, dependency, or review requirements to get a green merge.

Required checks should be stable, owned by GLORIFIER, and directly validate the changed code. Maintain the appropriate checks for:
- install from the lockfile, lint/type-check, and production build;
- unit/integration/E2E tests relevant to the change;
- security/dependency scanning and secret protection;
- architecture/governance checks and container/build checks where configured.

Keep names stable once configured as required. When changing a workflow's display name or job name, first check whether that exact context is required by branch protection/rulesets.

## Optional Vercel status

Vercel's GitHub integration may post an external status named Vercel even when Vercel is not the selected production frontend or when its deployment quota blocks a deployment. Treat that status as informational/non-blocking only if repository rules confirm it is not required.

- Do not fabricate a passing status, overwrite a failed status, or add a success-shaped shim.
- Do not weaken or bypass CI/security checks.
- If Vercel is listed as a required status check, remove only that exact requirement in the applicable repository branch protection/ruleset; preserve all required code, security, and review gates.
- If settings cannot be inspected or changed through the available authenticated integration, report that limitation. For rulesets: GitHub repository → Settings → Rules → ruleset targeting `main` → Require status checks. For classic branch protection: GitHub repository → Settings → Branches → branch protection rule targeting `main` → Require status checks. Remove Vercel only if it is explicitly listed, preserve all other required gates, and check all active rulesets plus applicable classic rules before saving.
- A Vercel status still visible on a commit does not by itself prove it is required. Status visibility and merge-blocking policy are separate facts.

The workflow at .github/workflows/vercel-production-deploy.yml performs local dependency installation, lint, frontend build, and output-file verification; it does not itself deploy to Vercel. Do not remove those build checks merely because the file has a legacy Vercel name.

## Production target and independent checks

- Cloudflare Pages is the intended public frontend at `https://glorifier.pages.dev`. The `glorifier` Worker is the internal API/execution layer reached through the Pages `GLORIFIER_WORKER` service binding; do not use its `workers.dev` hostname as the public frontend default. Vercel is not the production-hosting authority. The Vercel-named GitHub Actions workflow is a local build/type-check gate and must not be removed just because an external Vercel status fails.
- A Vercel external status is non-blocking only after an authorized repository admin confirms it is absent from all required-check rulesets/branch-protection rules. Preserve all GLORIFIER-owned CI, security, architecture, container, review, and runtime checks.
- Keep direct Railway health/readiness/runtime checks and unauthenticated API authorization checks.
- Do not mark Cloudflare API routing verified based only on the frontend returning HTTP 200. Test API routes for the expected JSON content type and response contract.
- A known audit from 2026-10-15 found the Cloudflare Worker returned SPA HTML for at least one API path while direct Railway returned JSON. This remains an acceptance test until a fresh live check proves otherwise.

## Status vocabulary and evidence

Use the narrowest status supported by fresh evidence:
- FULLY VERIFIED — every applicable required acceptance gate has fresh successful evidence.
- VERIFIED — the named component/behavior passed its stated checks.
- PARTIALLY VERIFIED — some evidence passes, but one or more material acceptance gates remain.
- NOT VERIFIED — evidence is missing, stale, or insufficient.
- DEGRADED — a known external or infrastructure condition prevents expected behavior.
- NOT OBSERVABLE — the available instrumentation cannot establish the result.

For each production claim, record the timestamp, commit/deployment identifier, endpoint or test, expected result, observed result, and link to logs/checks. A queued or pending check is not a pass. A stale report is historical, not current verification. A configured credential is not proof of successful use; HTTP 200 is not enough when the response body/content type is wrong.

## Merge and post-merge protocol

1. Review the diff and current required-check policy.
2. Wait for all required CI/security/review gates; do not merge merely because a PR is technically mergeable.
3. Use auto-merge only when GitHub enforces the required gates.
4. After merge, inspect the merge commit's checks and verify the production target independently.
5. Report each result as passed, failed, pending, degraded, or not observable. Never report all green when a required check is pending or failed.

## Current known facts (2026-10-16)

- PR #331 removed the Vercel routing probe from the 24/7 system health guardian.
- PR #332 changed full-stack smoke and Playwright defaults to Cloudflare Workers and was merged as 9074959e515056bdbfa0f6268598b759338a5898. The Pages public-interface migration is now moving those defaults to `glorifier.pages.dev`.
- The merged commit still shows a Vercel external failure status. This is a posted status, not proof that it blocks merging.
- The available GitHub integration was denied access to read main branch protection (HTTP 403), so the current required-check ruleset could not be authoritatively inspected here. Do not claim the Vercel context has been removed from branch protection until the settings are checked by an authorized repository admin.
- The latest queried merge-commit status also showed a Railway service check pending. Therefore overall production verification is not yet all-green.
