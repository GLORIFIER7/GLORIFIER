# AI-only pull request review policy

The **AI Review Policy** job in `.github/workflows/neural-ci.yml` evaluates two independently configured AI reviewer identities against the exact current pull request head SHA. It runs on `pull_request` events and re-evaluates on `pull_request_review` submissions, edits, and dismissals. The evaluator module is checked out from the event's target-branch base SHA into an isolated path, so the PR's version of `app.ai_review_policy.py` is not executed. **This is defense in depth, not a fully independent merge gate:** for `pull_request` events, the workflow definition itself is evaluated from the PR merge ref. A PR can therefore alter the job YAML unless workflow files are protected separately or a default-branch-pinned required-workflow rule is available and enabled.

- Amazon Q Developer: `amazon-q-developer[bot]`
- CodeAnt AI: `codeant-ai[bot]`

Human reviews never substitute for either bot, and no human approval count is required.

## Review outcome

- `APPROVED` and `COMMENTED` are accepted as completed formal reviews because the configured bots have submitted `COMMENTED` reviews in this repository.
- Missing or stale formal reviews fail. The latest current-head review must be `APPROVED` or `COMMENTED`; `CHANGES_REQUESTED` and dismissed/unknown states fail.
- An explicit `:stop_sign:` annotation from either AI reviewer blocks while its review thread is unresolved and current to the head commit. GitHub's formal-review and inline-thread login forms are normalized to the same configured bot identity.
- Resolved and outdated threads do not block. Ambiguous prose such as "critical" or "high severity" does not independently block.
- GitHub API errors and malformed review-thread responses fail closed. The policy uses a fixed GitHub.com API endpoint.
- The policy job is part of CI, waits up to 15 minutes for both reviewers, and has a 30-minute job timeout. Normal CI test jobs do not run for `pull_request_review` events. The policy checkout uses `persist-credentials: false`; the evaluator receives only the job-scoped read-only `GITHUB_TOKEN` needed to inspect reviews and review threads.
- CI concurrency groups include the event name so a review-event recheck cannot cancel the in-progress pull-request test run.

## Review-event check association

GitHub documents `pull_request_review` runs with `GITHUB_REF=refs/pull/PULL_REQUEST_NUMBER/merge` and `GITHUB_SHA` equal to the last merge commit on that PR merge branch. The observed review-event run `41995802337` for PR #61 produced an `AI Review Policy` check visible on its PR head SHA `e3a95d9950a9194528beb2eea6c571218ebd1053`; the check did not land on the default-branch commit. This evidence disproves a default-branch-only association claim for that run. It does not make the workflow trusted: GitHub also documents that `pull_request_review` workflow files are taken from the pull request merge commit.

## Workflow-definition trust boundary

The current repository ruleset requires the `AI Review Policy` status context, but a normal `pull_request` workflow check is not cryptographically pinned to a protected workflow definition. Do not treat this check as tamper-proof against a PR that changes `.github/workflows/neural-ci.yml` or adds another workflow that emits the same context. The repository owner must enable an independently pinned required workflow where the account supports it, or protect workflow-file changes using an appropriate repository-level control. The connected GitHub integration used for this remediation can inspect rulesets but cannot modify their administrative configuration.

## Required ruleset configuration

In repository ruleset **GLORIFIER-NEURAL** (ID `26492703`), preserve deletion protection, non-fast-forward protection, CodeQL code scanning, and code-quality rules. Keep required human approvals at **0** and bypass actors empty.

Target only `~DEFAULT_BRANCH`. Add **AI Review Policy** as a required status check from GitHub Actions with strict/latest-commit checking enabled. Do not add human or team reviewer requirements.

A successful Actions run is not a mandatory merge gate until the ruleset explicitly lists the exact **AI Review Policy** check context. Re-read the ruleset after editing to verify that it is active, targets the default branch, the check is required, human approvals remain 0, and bypass actors remain empty.
## Rechecking after a review-thread resolution

Resolving an inline review thread does not itself create a `pull_request_review` event. GitHub documents the `pull_request_review_thread` webhook event, but it is not a supported GitHub Actions workflow trigger. After resolving a current-head blocker, re-run the failed **AI Review Policy** job from the associated Actions run, or cause a new formal review submission/edit/dismissal event. Before relying on the result, confirm that the run's `PR_HEAD_SHA` equals the pull request's current `head.sha`; a run against an earlier commit is stale and does not satisfy the policy.

This is an operational recheck path, not an automatic thread-resolution trigger. Do not use `workflow_dispatch` for the required PR check: GitHub documents that checks created by workflow-dispatch jobs do not appear in the pull request checks section or satisfy required PR status checks.
