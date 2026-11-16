# AI review status diagnostics and governance

## Purpose and authority boundary

GLORIFIER can use configured AI-reviewer feedback as an additional diagnostic signal:

- Amazon Q Developer: amazon-q-developer[bot]
- CodeAnt AI: codeant-ai[bot]

These signals are not human approval, do not grant execution or merge authority, and do not replace the repository's GitHub pull-request rules.

**The AI-review status is advisory only and is not a required merge status.** A passing diagnostic does not authorize a merge. A pending, failed, or unavailable diagnostic does not itself block a merge. Apply the active GitHub ruleset and normal human/code-owner review requirements independently.

## CI behavior

The blocking AI-review job is removed from .github/workflows/neural-ci.yml. The workflow no longer listens for pull_request_review or pull_request_review_comment events and no longer waits for two AI reviewers before completing CI.

NEURAL Service CI continues to validate code and supply-chain integrity on ordinary pull-request, main-branch push, manual, and scheduled runs. Its checks include the Python 3.11 and 3.12 matrix, Ruff, pytest, locked dependency audit, and a non-publishing container build. The test job uses read-only repository permissions and disables persisted checkout credentials.

The default-branch diagnostic publisher remains separate at .github/workflows/neural-ai-review-status.yml. It:

- Runs from the trusted main branch after completion of NEURAL Service CI, on relevant main-branch policy/workflow pushes, and on a 15-minute schedule.
- Checks out the main-branch implementation, not pull-request code.
- Reads open pull requests, their canonical head SHAs, formal reviews, and review threads through GitHub APIs.
- Publishes an AI Review Policy (diagnostic) commit status for each unique head SHA.
- Uses contents: read, pull-requests: read, and statuses: write. It does not write pull requests, checks, contents, or merge state.

The publisher accepts APPROVED or COMMENTED reviews from the configured bots when they apply to the exact current head. An unresolved current-head :stop_sign: review-thread annotation is reported as a blocker. Missing evidence can remain pending for up to 15 minutes from the commit timestamp before the diagnostic reports failure. Malformed or unavailable evidence is reported as unverifiable. These outcomes describe the diagnostic only; they are not merge decisions.

## Why the diagnostic is not a merge gate

The current status publisher is not a tamper-resistant, PR-specific authorization service:

1. GitHub commit statuses attach to commit SHAs rather than individual pull requests. Multiple open pull requests can share a head SHA, and a status can be observed before a later polling sweep evaluates newly opened pull requests.
2. The publisher uses the GitHub Actions identity. A separate workflow with suitable status-write permission may be able to publish the same context; the identity does not uniquely authenticate this publisher workflow.
3. Review-thread changes do not all produce an immediate publisher run. A previously published status can remain until the next scheduled or workflow-completion sweep.

Do not add AI Review Policy (diagnostic) to required status checks or describe it as tamper-resistant. A mandatory AI-review gate would need a separately authenticated verifier identity, a PR-specific merge-time decision, and reliable invalidation when review evidence changes. Those protections are not implemented by this diagnostic workflow.

## Live main-branch ruleset read-back — 2026-11-16

A read-only GitHub API read-back of the primary GLORIFIER repository reports:

- Ruleset: Protect main, ID 24038955; enforcement is active.
- Pull-request parameters: zero required approving reviews; code-owner review required; review-thread resolution required; merge, squash, and rebase are allowed.
- Code quality enforcement is enabled at all configured severities.
- Code scanning covers CodeQL and Dependabot, with the configured high-or-higher security-alert thresholds.
- Copilot code review is enabled on pushes and draft pull requests.
- The returned ruleset does not contain a required-status-checks rule. A successful workflow run must not be described as a required merge check unless a separate live ruleset read-back confirms that requirement.
- Bypass actors in the returned payload include a DeployKey and repository roles with actor IDs 2, 4, and 5; each has bypass mode always. The API reports current_user_can_bypass as always.

This is an observation of the remote ruleset, not a change made by this maintenance PR. It supersedes the older 2026-11-05 ruleset notes in this file. In particular, do not claim that the current main ruleset has zero bypass actors or that the connected principal cannot bypass it.

## Administrative boundary

This maintenance change changes workflow source and documentation only. It does not change the GitHub ruleset, bypass actors, repository permissions, secrets, environments, deployments, paid inference settings, or production configuration. Any future change to administrative ruleset settings must be authorized and verified separately.
