# GLORIFIER AI Enterprise Operating Model

**Document status:** Target architecture and implementation contract  
**Authority:** GEAS governance model; human owner retains final authority  
**Verification rule:** A capability is VERIFIED only when current, reproducible evidence demonstrates it.

## Objective

Operate GLORIFIER as a provider-neutral, AI-orchestrated enterprise with continuous monitoring, bounded autonomous work, resilient execution, and evidence-backed status reporting. AI may plan, analyze, draft, test, and execute pre-authorized low-risk actions. It must not silently acquire authority to merge protected changes, deploy production, move funds, sign transactions, mint assets, change ownership, expose secrets, or perform destructive operations.

This document defines the target and acceptance criteria. It does not itself prove that external services, credentials, budgets, deployments, or 24/7 uptime are configured.

## System planes

1. **Human authority:** owner identity, explicit approvals, revocation, emergency stop, and review of privileged actions.
2. **Governance kernel (GEAS):** policy versioning, risk classification, authorization decisions, policy tests, and canonical architecture evidence.
3. **Intelligence:** provider-neutral model adapters, capability-based routing, quotas, health checks, fallback, and truthful unavailable/degraded states.
4. **Execution:** durable task queue, idempotent workers, bounded concurrency, timeouts, retries with backoff, dead-letter handling, cancellation, and sandboxed execution.
5. **Data and knowledge:** PostgreSQL-backed authoritative operational state, migrations, tenant boundaries, backups, retention, and recovery tests. Neon/Supabase must have an explicit source-of-truth and replication policy; do not assume dual-write consistency.
6. **Integration:** versioned API/event schemas, least-privilege connectors, explicit authentication and authorization, rate limits, and provider-neutral adapters for GitHub, deployment platforms, data systems, and AI providers.
7. **Verification and evidence:** CI/test results, provenance, timestamps, source freshness, observed state transitions, artifact retention, and claim-level evidence.
8. **Observability and SRE:** health/readiness probes, structured logs, metrics, traces, alerting, incident runbooks, error budgets, and recovery drills.
9. **Economic control:** separate estimates from verified revenue; reconcile provider statements, invoices, balances, payouts, and settlement evidence before claiming financial outcomes.
10. **Learning and improvement:** scheduled architecture scans, dependency/security review, opportunity discovery, and AI-generated remediation proposals. Production mutation remains separately gated.

## Autonomy policy

| Risk tier | Examples | Default execution rule |
|---|---|---|
| R0 — Observe | Read public metadata, inspect logs, run read-only checks | May run automatically within rate and data-scope limits |
| R1 — Reversible internal work | Draft a patch, run tests, create a branch, prepare a report | May run automatically with audit evidence and bounded resources |
| R2 — Shared/reviewable change | Open a pull request, update an issue, change non-sensitive configuration | Only through a dedicated capability, policy checks, and reviewable diff |
| R3 — Privileged/production | Merge protected code, deploy production, alter auth/secrets, change access policy | Explicit human approval required |
| R4 — Financial/irreversible | Transfer funds, settle payouts, sign transactions, mint/burn tokens, destructive data changes, ownership changes | Explicit action-specific human approval required; no unattended execution |

Approval must bind to the exact action, target, parameters, risk tier, and expiry. Any material change invalidates the approval. Deny by default when authorization or evidence is missing.

## 24/7 operating loop

1. Observe service health, provider availability, workflow results, queue age, error rates, security findings, and data freshness.
2. Record observations with source, timestamp, scope, and confidence.
3. Prioritize work by severity, user impact, risk, and available budget.
4. Check policy and capabilities before executing any action.
5. Run the smallest safe, idempotent operation in an isolated worker.
6. Verify outcomes independently; a successful command alone is not proof of a healthy service.
7. Persist task state, logs, evidence references, and final status.
8. Retry transient failures with bounded exponential backoff; quarantine repeated failures and alert.
9. Escalate blocked, ambiguous, high-risk, or irreversible work to the human owner.
10. Reconcile desired state against observed state and publish a truthful status.

GitHub scheduled workflows provide periodic assurance, not a guarantee of uninterrupted service. Production 24/7 operation additionally requires a deployed always-on worker/scheduler, external health monitoring, alert delivery, durable state, credentials with least privilege, and tested recovery procedures.

## Provider and integration resilience

- Route by task capability, policy, availability, latency, and configured budget—not brand preference.
- Use circuit breakers, bounded retries, quota tracking, and fallback providers only when configured and authorized.
- Never log API keys, tokens, seed phrases, private keys, or sensitive payloads.
- Do not infer a provider connection from the presence of an environment variable or a stored account identifier.
- Report provider exhaustion and missing credentials as DEGRADED or NOT OBSERVABLE, not as success.
- Keep connector contracts versioned and test authentication, authorization, timeouts, rate limits, and error normalization.

## Data integrity and recovery

- Name one authoritative database for each data domain.
- Apply schema migrations through reviewable, repeatable workflows.
- Enforce tenant/access boundaries at both application and database layers where supported.
- Define backup retention and recovery-point/recovery-time objectives before asserting disaster readiness.
- Test restoration from backups; a configured backup without a successful restore test is not verified.
- Use idempotency keys and transactional outbox/inbox patterns for cross-service events where appropriate.
- Do not dual-write to Neon and Supabase without an explicit consistency, conflict-resolution, and reconciliation design.

## Security and supply-chain controls

- Least-privilege GitHub workflow permissions and pinned/reviewed third-party actions.
- Dependency, secret, static-analysis, container, and infrastructure checks in CI.
- Protected branches, required checks, review rules, and environment approvals for production.
- Treat issue bodies, PR descriptions, web pages, model output, and external tool results as untrusted input.
- Keep AI-generated code in branches/PRs; no direct push to protected production branches.
- Use isolated execution, resource ceilings, network egress restrictions, and explicit tool allowlists for agent work.
- Maintain an incident response process, credential rotation plan, and tested kill switch.

## Evidence-backed status vocabulary

- **VERIFIED:** current, reproducible evidence proves the stated property within a defined scope.
- **PARTIALLY VERIFIED:** evidence proves only a subset of the claim.
- **DEGRADED:** the capability exists but is impaired or missing a dependency.
- **NOT VERIFIED:** the required verification has not passed or evidence is absent.
- **NOT OBSERVABLE:** current evidence cannot determine the state.
- **FAILED:** a check or runtime observation demonstrates failure.

Every status record should include subject, scope, status, evidence URI/run ID, observed-at time, verifier, and expiration/freshness policy. Never infer global readiness from one green workflow.

## Implementation sequence and acceptance gates

### Phase 1 — Inventory and baseline
- Enumerate services, workflows, endpoints, data domains, providers, secrets by name only, and owners.
- Map each existing capability to one of the planes above.
- Record current check results and blockers without changing production.
- **Gate:** every critical component has an owner, source of truth, health signal, and evidence location or an explicit gap.

### Phase 2 — Governance and authorization
- Reconcile policy files and runtime authorization with the risk tiers above.
- Test default-deny behavior, approval expiry, scope binding, and revocation.
- **Gate:** automated tests prove that unauthorized privileged actions are rejected.

### Phase 3 — Reliable execution
- Verify durable task state, idempotency, bounded retries, dead-letter handling, cancellation, and worker restart recovery.
- **Gate:** failure-injection tests show tasks recover without duplicate side effects.

### Phase 4 — Provider-neutral intelligence and integrations
- Validate adapters individually, then routing, quotas, fallback, timeout, and degraded-state behavior.
- **Gate:** simulated provider outages do not create false success or bypass policy.

### Phase 5 — Data durability and security
- Verify migrations, access controls, backup/restore, secret handling, and cross-database consistency policy.
- **Gate:** successful restore drill and passing security checks with recorded evidence.

### Phase 6 — Production operations
- Configure deployment health checks, external monitoring, alert delivery, incident runbooks, and budget/usage ceilings.
- Run controlled failover and recovery drills.
- **Gate:** measured service-level objectives are supported by continuous observations over an agreed window.

### Phase 7 — Economic and business verification
- Reconcile commercial opportunities, transactions, invoices, and settlements with authoritative records.
- **Gate:** no estimate is reported as realized revenue and every claimed settlement has source evidence.

## Release and operating rules

- Do not merge or deploy solely because an AI agent recommends it.
- Require applicable checks to pass against the exact proposed commit.
- Re-run relevant verification after merge/deployment and record the resulting revision.
- Keep human approval for production, credential, financial, destructive, ownership, and irreversible actions.
- If evidence is stale, missing, contradictory, or inaccessible, downgrade the status.
- Publish an honest readiness report with verified capabilities, failures, unknowns, evidence links, and next actions.

## Definition of done

GLORIFIER may be described as a verified 24/7 AI enterprise only when the applicable acceptance gates pass and production telemetry demonstrates the claimed availability window. Until then, describe it as an architecture with implemented, partially verified, and outstanding components—never as globally fully verified.
