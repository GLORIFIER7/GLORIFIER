# Antinuous research architecture: selective adoption for GLORIFIER

**Assessment:** 2026-11-21 (Asia/Vientiane)
**Decision:** selectively adopt architectural ideas, not Antinuous's closed-source software or branded assets.
**Scope of this PR:** original evidence-gated research-round selector, focused unit tests, and this architecture record. No live Antinuous connection, runtime swarm, scientific simulation, deployment, or provider reconfiguration.

## Verified description of public product materials

Antinuous documents four infrastructure layers: elastic compute, agent-swarm orchestration, scientific simulation, and source-linked artifacts. Its research flow splits questions into independent tasks, runs experiments in parallel, reviews results in rounds, prunes weaker branches, and provides documents, notebooks, charts, tables, and other artifacts with source or code links. It advertises MCP and A2A access for signed-in agents.

Antinuous reports 3.5x median agent-swarm speed and 13x median parallel-compute speed from September-November 2026 runs. These are **vendor-reported claims**, not independently reproduced results or guarantees for GLORIFIER.

At the time of inspection, Antinuous's Free plan lists $0/month, $20/month of AI usage released weekly, open-weights models, and **no included compute/GPUs**. A first-month Pro-limit trial is described with verified mobile registration. Prepaid credit and automatic-recharge options exist, but GLORIFIER must never opt into them under its $0 paid budget.

Official source pages, inspected 2026-11-21:
- https://antinuous.com/
- https://antinuous.com/platform
- https://antinuous.com/pricing
- https://antinuous.com/terms

Antinuous's public terms retain ownership of its software and branding. This change copies no proprietary code, content, or assets.

## What GLORIFIER already has

- src/lib/autopilot-graph.ts: validated, deterministic, bounded DAGs; six-node default maximum; parallel read-only execution waves; serialized mutations.
- src/lib/autopilot-orchestrator.ts and src/lib/autopilot-execution-fabric.ts: AI CEO, Specialist Council, provider policy, capability controls, and evidence-backed GitHub actions.
- src/lib/governance/geas-architecture-scientist.ts: evidence classification and provenance.
- docs/operations/AUTOPILOT-CLOUDFLARE-MIGRATION.md: documents the current Worker path's missing capabilities and disabled inference pending free-plan attestation.

Repository implementation is not evidence of deployed, connected, or independently verified external operation.

## New narrowly scoped primitive

src/lib/research-experiment-rounds.ts exposes selectNextResearchRound, a **pure, read-only deterministic shortlisting** function, not an executor or verifier. It requires:
- One to six candidates; at most two candidates advance by default.
- A completed outcome, read-only effects, and zero paid cost.
- Input/output SHA-256 digests, method reference, and one or more source references.
- A reviewer distinct from the producing agent; review content bound to the exact output hash.
- An injected trusted authentication callback accepting the review. Missing, throwing, or asynchronous authentication fails closed.
- Finite scores in the interval [0,1], used only for candidate ordering, not scientific validation.

Every nonselected candidate has an explicit reason. No inference, network calls, compute, persistence, payments, merges, approvals, or deployments are performed. The function cannot independently establish the correctness of citations or experiments; the external trusted verifier must do that, and a selected candidate is only **eligible for another round**.

Focused test command using the repository's existing TypeScript runner:

    node --import tsx/esm --test src/lib/research-experiment-rounds.test.ts

## Implementation roadmap (not included in this change)

1. Build a scoped question-to-task planner using the existing Autopilot graph and its read-only concurrency limits. Do not create a second mission or policy authority.
2. Allow reproducible experiments only on separately approved sandboxed, genuinely free compute. Record deterministic inputs, method, resource ceilings, source hashes, and result artifacts. No GPU or new infrastructure purchase.
3. Bind independent GEAS claim and artifact verification to a trusted authentication adapter and exact hashes. Preserve separate fact-verification and score/ranking states.
4. Emit evidence-linked notebooks, datasets, and reports with explicit UNKNOWN/NOT VERIFIED states for missing, stale, or conflicting evidence.
5. Optionally evaluate Antinuous MCP/A2A as a distinct scoped connector only after account authentication, endpoint documentation, permission review, privacy assessment, and hard zero-spend controls. No guessed API endpoint or ambient repository-writer privileges.

## Required follow-up gates

- Evidence schema tests for authenticity, reviewer independence, tampering, and tenant/mission isolation.
- Independent results verification against original sources and rerunnable experiments.
- Bounded concurrency, quota reservations, cancellation, retries, idempotency, and failure-state reconciliation before live orchestration.
- Compare verified tasks per second, wall time, compute cost, and verified cost per successful task against a sequential baseline before asserting speed gains.
- CI, lint, code scanning, dependency checks, branch protection, and code-owner approval on exact commits. No automatic production deployment or uncontrolled spending.

**Status:** initial selection primitive and tests are proposed in this PR. Actual Antinuous integration, live agent swarms, compute clusters, simulation kernels, and artifact publication are **NOT IMPLEMENTED**.
