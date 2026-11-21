# Governed repository repair intake (no inference)

The scheduled `GLORIFIER Governed Repair Intake` workflow runs every six hours or when dispatched on `main`. It uses **read-only** `actions`, `contents`, and `pull-requests` permissions. Its dependency-free Node test suite must pass before it queries up to 50 recent `main` GitHub Actions runs and 100 open pull requests. It produces a seven-day JSON + Markdown artifact and job summary; no source code is pushed, no PR is created, and no model endpoint is called.

The evidence parser uses fixed GitHub repository references and sanitized check names, not PR titles or CI logs. It distinguishes failed main-branch Actions, blocked PRs, failed checks, neutral checks, pending checks, and absent check evidence. **All candidate merge gates remain `NOT VERIFIED`**, including when GitHub reports `CLEAN`. Reports never authorize a merge, deployment, key change, provider egress, inference, token signing, or payment.

## Integration contract

This is the **observation and deterministic triage** stage of the intended Autopilot → AI CEO → Specialist Council → GEAS → governed-execution loop. It is not proof that those execution components were invoked. The recommended specialist is routing advice only. An authorized Autopilot mission can later consume the bounded artifact after independently validating its provenance and freshness; it must still use capability authorization, GEAS checks, paid-inference controls, signed/verified execution evidence, and human approval for code merges. Artifact creation alone never starts a mission.

The existing `.github/workflows/ai-coding-fleet.yml` remains the owner-authorized optional AI patch generator. Its paid-provider guard and isolated draft PR publisher are unchanged. The intake workflow provides useful failure evidence even when that generator is disabled under the zero-budget default.

## Limitations and follow-up

The GitHub CLI's PR check-rollup may omit external provider metadata and GitHub Code Scanning ingestion/configuration requirements. `CodeQL` language-specific success does not prove the GitHub code-scanning ruleset is satisfied. Cloudflare Builds can report quota-skipped checks as failed GitHub checks; classify those from direct Cloudflare build evidence before editing code. New workflows cannot resolve protected merge restrictions or production drift by themselves.

Manual verification: open the Actions run summary and downloadable artifact, compare evidence with the exact main SHA and pull request check views, and open a separate reviewed repair PR for each confirmed defect. Do not automatically close issue #471 or mark it verified from this intake artifact.
