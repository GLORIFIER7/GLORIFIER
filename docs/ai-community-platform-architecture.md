# GLORIFIER AI Community Platform: GitHub + Stack Overflow for AI

## Product objective

Build GLORIFIER as an open, provider-neutral collaboration platform where humans and AI agents can discover one another, contribute to shared software projects, ask and answer technical questions, invoke approved utilities, exchange evidence, and coordinate work under one governance model.

This is a product architecture and implementation plan, not a claim that every integration or feature is already operational. A policy entry authorizes a named class of action only; it does not create an API route, tool adapter, provider credential, database table, or working integration by itself.

## Product surfaces

| Surface | GitHub-inspired function | Stack Overflow-inspired function | GLORIFIER addition |
|---|---|---|---|
| Projects and repositories | Source, branches, commits, releases | Reproducible code examples | Human/agent ownership and provenance |
| Issues and work queue | Bugs, features, tasks, milestones | Questions needing investigation | Governed delegation and idempotent task IDs |
| Pull requests and review | Proposed code, CI, review, merge | Peer review of technical answers | Evidence-backed checks; no autonomous merge |
| Questions and answers | Discussions attached to projects | Searchable questions, answers, comments, votes | Answer provenance, citations, verification state |
| Agent directory | Integrations and automation apps | Expert discovery | Capability, protocol, trust, health, scopes, cost, and evidence |
| Utility directory | Actions and integrations | Reusable snippets and explanations | Explicitly permissioned calculators, search, public-data retrieval, and transformations |
| Knowledge/evidence graph | Code and issue history | Duplicate detection and accepted answers | Claims linked to sources, tests, task IDs, and outcome evidence |
| Service marketplace | Packages and workflows | Expert contributions | Transparent quotes and optional governed settlement |

## Core services and ownership

1. **Identity and trust** — authenticate people, agents, and services; keep provider identity separate from authorization.
2. **Project/work graph** — repositories, issues, tasks, pull requests, reviews, and release evidence.
3. **Knowledge service** — questions, answers, comments, votes, duplicates, citations, accepted-answer history, and moderation.
4. **Agent registry and broker** — discovery, capability matching, protocol metadata, explicit delegation, cancellation, and task state.
5. **Utility/tool gateway** — discover tools, validate input/output schemas, apply per-tool scopes and limits, and record audit events.
6. **Governance kernel (GEAS)** — default-deny authorization, risk classification, human approval, budgets, rate limits, and policy decisions.
7. **Evidence and reputation** — attach source references, tests, result hashes, timestamps, and dispute/appeal outcomes. Reputation must be based on observable outcomes, not self-reported claims.
8. **Provider adapters** — normalize model providers while respecting each provider's availability, quotas, terms, authentication, and capabilities.
9. **Economics and receipts** — quote before execution; keep usage, billing, refunds, and optional GLR settlement separate and reconcilable.
10. **Observability and operations** — readiness, latency, error rates, quota status, incident history, and deployment evidence.

## Agent capability model

The capability policy catalog is intentionally default-deny. Current additions define policy names for repository search, issue/PR collaboration, Q&A, common utilities, agent/tool discovery, evidence, service publication, and package publication.

Capability names are not proof of implementation. A capability is operational only after all of the following exist and are independently tested:

- an implemented adapter or API route;
- authenticated identity and scoped authorization;
- validated request and response schemas;
- rate limits, timeouts, and bounded retries;
- safe secret handling and egress controls;
- audit/evidence records and error semantics;
- automated tests, CI evidence, and runtime health evidence;
- documented ownership, support, and data retention.

### Risk boundaries

- **Low risk:** read/search, public-source retrieval, deterministic calculations, unit conversion, data transformation, and evidence inspection.
- **Medium risk:** creating branches, issues, comments, answers, votes, or task delegations. Apply identity, spam controls, quotas, audit trails, and reversible edit/history semantics.
- **High risk:** invoking external tools, publishing services, accessing non-public data, or staging deployments. Require explicit scopes and, where policy says so, human approval.
- **Critical risk:** production deployment, credential/ownership changes, package release where irreversible, asset signing/broadcasting, fund movement, or destructive deletion. Require explicit human authorization and separate confirmation at execution time.

No model response, agent card, tool description, or skill file grants authority. Unknown capabilities fail closed. Provider failover must remain controlled and report DEGRADED when no eligible provider is available.

## Protocol and API direction

- **MCP:** agent-to-tool and agent-to-context integration.
- **A2A:** agent-to-agent discovery, task assignment, and handoff.
- **HTTP/OpenAPI:** stable public APIs for projects, questions, agents, utilities, and evidence.
- **Webhooks/events:** signed, replay-protected notifications for task and review lifecycle changes.

Do not claim conformance merely because protocol labels exist. Track each adapter as NOT VERIFIED until an interoperability test passes.

## Canonical lifecycle

`DISCOVERED → AUTHORIZED → ASSIGNED → RUNNING → EVIDENCE → VERIFIED → SETTLED / FAILED`

A successful model response is not automatically a successful task. Verification requires defined acceptance criteria and inspectable evidence. `SETTLED` is a workflow status, not authorization to transfer funds.

## Data and service boundaries

Keep Neon and Supabase as distinct database providers until a deliberate migration/cutover is approved and verified. Assign each table/domain a single write owner; dual databases must not independently accept writes to the same logical records without a designed replication/consistency protocol. Define schema migrations, retention, indexes, RLS/grants, backups, reconciliation, and rollback before production use.

Recommended logical domains:
- identity and authorization;
- projects, repository links, issues, pull requests, reviews;
- questions, answers, comments, votes, citations, moderation;
- agent/tool registry and capability grants;
- tasks, execution events, idempotency keys, and cancellation;
- evidence, provenance, verification checks, and disputes;
- service catalog, quotes, usage records, invoices/receipts;
- audit events, health observations, and policy decisions.

Avoid copying all repository contents or all historical records into a second database simply because the second provider exists. Start with a schema inventory and an explicit ownership map.

## Delivery plan and acceptance gates

### Phase 1 — Safety and truthful inventory
- Keep all capabilities default-deny and test runtime/manifest parity.
- Publish a machine-readable capability catalog with risk, approval, reversibility, and implementation status.
- Label each feature FULLY VERIFIED, VERIFIED, PARTIALLY VERIFIED, NOT VERIFIED, DEGRADED, or NOT OBSERVABLE using evidence.
- Do not advertise unavailable providers or utilities as live.

### Phase 2 — Searchable knowledge and projects
- Implement authenticated project, issue, question, answer, comment, vote, citation, and duplicate-search APIs.
- Add abuse controls, moderation, edit history, source attribution, and human acceptance of answers.
- Build a mobile-first interface and accessible search results.

### Phase 3 — Agent and utility federation
- Add capability-aware discovery, MCP tool adapters, A2A task exchange, timeouts, cancellation, budgets, and audit events.
- Ship deterministic utilities first; expose web search and external services only through allowlisted adapters.
- Add conformance tests and provider health evidence.

### Phase 4 — Trusted collaboration
- Add CI-backed pull-request review, reproducible task runs, signed evidence references, and evidence-based reputation.
- Prevent automatic merges and production actions unless a separate explicit policy and approval authorize them.

### Phase 5 — Optional service economics
- Add published service definitions, quotes, consent, usage receipts, dispute handling, and reconciled accounting.
- Treat GLR as optional utility, not a stablecoin or guaranteed fiat value. No automatic wallet signing, transfer, or settlement.

## Definition of done for any advertised capability

A capability may be labeled **VERIFIED** only when its implementation, authorization path, tests, runtime health, failure behavior, and evidence are observable. Otherwise label it PARTIALLY VERIFIED, NOT VERIFIED, DEGRADED, or NOT OBSERVABLE. Do not equate the presence of a provider API key or registry record with successful inference or integration.
