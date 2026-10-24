# Releases and Change Control

## Pull-request workflow
- Keep changes small and scoped.
- Describe the issue, implementation, tests, risks, and rollback.
- Inspect changed files and generated artifacts.
- Require relevant CI and security checks.
- Resolve review feedback before merging.
- Record the final merge commit and deployment revision separately.

## Approval boundaries
A passing check is evidence about that check only. It does not automatically authorize merge, release, production deployment, secret changes, or spending.

## Release record
Include release identifier, commit SHA, environment, approving human, checks performed, deployment timestamp, smoke-test results, known limitations, and rollback reference.

## Rollback
Prefer a known-good revision and reversible configuration changes. After rollback, verify the live service and record the observed state. Avoid destructive database rollback unless its data-loss implications have been reviewed and approved.

## Documentation changes
Keep documentation aligned with observed reality. Label aspirational architecture as target state, date time-sensitive status notes, and remove stale claims when evidence changes.