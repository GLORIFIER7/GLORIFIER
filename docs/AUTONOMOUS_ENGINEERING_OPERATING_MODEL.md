# Autonomous engineering operating model

Routine repository maintenance, code analysis, issue triage, implementation, regression testing, branch creation, and pull-request creation are intended to run autonomously on a recurring schedule. Routine code changes do not require individual human approval when the repository's trusted validation and merge rules pass.

The repository owner retains authority over production deployment, release publication, secret and credential changes, signing, financial transfers, wallet operations, ownership changes, destructive resource deletion, and security-policy changes. These remain explicit-authorization operations.

Autonomous changes must be limited to reviewable source, tests, and documentation. The trusted diff policy, required CI, CodeQL, dependency and code-quality checks, required signed-commit rules, zero-bypass rulesets, and evidence requirements must not be weakened by an autonomous agent.

Recurring model execution is controlled by the repository-level AI_MAINTENANCE_AUTORUN setting because provider calls may incur cost. This is a one-time operating-cost control, not per-change approval.
