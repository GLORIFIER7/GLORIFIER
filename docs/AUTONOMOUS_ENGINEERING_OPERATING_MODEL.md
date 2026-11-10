# Autonomous engineering operating model

Routine repository maintenance, code analysis, issue triage, implementation, regression testing, branch creation, and pull-request creation are intended to run autonomously on a recurring schedule. The coding agent may select and implement one evidence-backed improvement per cycle, but does not receive GitHub write permissions.

The model-execution job runs with read-only repository permissions. It validates its proposed changes and exports only a patch artifact. A separate trusted publisher installs dependencies from the checked-in lockfile, applies the patch without executing proposed source, and re-runs the trusted capability and diff policy before it can push a branch and open a draft pull request. A separate least-privilege job dispatches CI. Generated pull requests are never auto-merged.

The repository owner retains authority over production deployment, release publication, secret and credential changes, signing, financial transfers, wallet operations, ownership changes, destructive resource deletion, and security-policy changes. These remain explicit-authorization operations.

Autonomous changes must be limited to reviewable source, tests, and documentation. The trusted diff policy, required CI, CodeQL, dependency and code-quality checks, signed-commit rules, zero-bypass rulesets, and evidence requirements must not be weakened by an autonomous agent.

Scheduled model inference is disabled. The retired `AI_MAINTENANCE_AUTORUN` variable does not authorize provider calls. A paid inference run is eligible only when the `GLORIFIER7` owner account starts a manual `workflow_dispatch` with `allow_paid_inference=true` on the first attempt (`github.run_attempt == 1`). Other actors, scheduled events, and reruns are denied. This is an authorization gate, not automated proof of funding: before dispatching, the owner must verify available sponsorship/monetization funds or obtain explicit provider confirmation that GLR is accepted for the service, and approve that individual run. Provider calls may incur charges.
