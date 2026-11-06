# Autonomous engineering operating model

Routine repository maintenance, code analysis, issue triage, implementation, regression testing, branch creation, and pull-request creation are intended to run autonomously on a recurring schedule. The coding agent may select and implement one evidence-backed improvement per cycle, but does not receive GitHub write permissions.

The model-execution job runs with read-only repository permissions. It validates its proposed changes and exports only a patch artifact. A separate trusted publisher installs dependencies from the checked-in lockfile, applies the patch without executing proposed source, and re-runs the trusted capability and diff policy before it can push a branch and open a draft pull request. A separate least-privilege job dispatches CI. Generated pull requests are never auto-merged.

The repository owner retains authority over production deployment, release publication, secret and credential changes, signing, financial transfers, wallet operations, ownership changes, destructive resource deletion, and security-policy changes. These remain explicit-authorization operations.

Autonomous changes must be limited to reviewable source, tests, and documentation. The trusted diff policy, required CI, CodeQL, dependency and code-quality checks, signed-commit rules, zero-bypass rulesets, and evidence requirements must not be weakened by an autonomous agent.

Scheduled and manually dispatched model execution share the repository-level `AI_MAINTENANCE_AUTORUN=true` cost-control setting. The workflow checks this setting before it invokes the model. Provider calls may incur charges; keep the setting unset until the owner intentionally enables the recurring cost.
