# Ruflo capability assessment and GLORIFIER adoption boundary

**Status:** Design accepted for selective reuse; no Ruflo runtime dependency is approved by this assessment.  
**Assessment date:** 2026-11-17 (Asia/Vientiane).  
**GLORIFIER baseline:** `main` at `eb82672ee5fa44cb863178a8670efd3dcf02c431` (PR #899).  
**Upstream baseline:** `ruvnet/ruflo` `main` at `8cb2fbc7a1e9e08f20fc5fc6a45e1046ad0369b9`.

## Decision

Extract Ruflo's useful orchestration patterns into GLORIFIER's existing architecture. Do **not** install Ruflo's CLI, vendor its source tree, add its packages, enable its Claude Code hooks/mods, or run its daemon as part of this change.

GLORIFIER remains the system of authority for identity, governance, provider selection, mission state, budgets, repository writes, evidence, and approvals. Ruflo is an external reference implementation and potential future adapter—not a second control plane.

This assessment changes documentation only. It does not claim that a Ruflo adapter, runtime swarm, shared memory layer, or external federation has been implemented or tested.

## What Ruflo provides

At the inspected upstream revision, Ruflo describes itself as an agent meta-harness primarily for Claude Code and Codex. Its project includes agent/swarm coordination, CLI and MCP surfaces, plugins, memory and retrieval components, workflow definitions, recurring workers, a console, and federation components.

The upstream documentation is useful as an architecture reference, but feature descriptions and offline smoke scripts are not proof that a capability is deployed, connected to GLORIFIER, or suitable for GLORIFIER's production environment.

## Capability extraction

| Ruflo pattern | GLORIFIER destination | Adoption rule |
|---|---|---|
| Hierarchical and specialized swarms | AI CEO and Specialist Council | Keep one accountable coordinator. Delegate explicit, non-overlapping roles. Derive fan-out and concurrency from the owner's free-provider quotas and mission budget; never copy a fixed agent count as a universal default. |
| Shared task tracking and workflow lifecycles | Persistent Autopilot mission ledger | Represent dependencies and checkpoints as durable mission steps. Preserve idempotency, optimistic version checks, bounded leases, cancellation, and evidence-backed completion. |
| Per-agent worktree isolation | Mission-scoped GitHub branch and review pipeline | Agents may independently inspect and propose patches. Keep repository mutation behind the owner-controlled GLORIFIER GitHub App writer. Do not permit concurrent agents to write the same branch or bypass the existing path/hash preflight. |
| Namespaced memory and semantic retrieval | Existing durable GLORIFIER storage and future scoped-memory adapter | Use tenant-, mission-, and role-scoped records. Persist provenance, source hash, classification, retention/expiry, and validation state. Do not add AgentDB/RuVector until a measured gap justifies a separately reviewed storage decision. |
| Learning from completed tasks | Evidence-backed engineering knowledge | Promote only validated outcomes into reusable patterns. Store the test/evidence reference and applicability limits. Treat retrieved text as untrusted data, never as executable instructions or policy. |
| Live swarm/workflow monitoring | GLORIFIER observability and Autopilot status | Expose read-only state from durable records. Distinguish queued, claimed, running, blocked, failed, completed, and verified. Missing telemetry must be reported as unknown, not zero or healthy. |
| Recurring workers and wake-ups | GLORIFIER daemon and due-mission scheduler | Prefer event-driven or due-work scheduling, lease expiry, cancellation, and bounded retries. Do not adopt Ruflo's cache-oriented 270-second prompt wake-up as a GLORIFIER default; it is tied to Ruflo's documented host/session assumptions and can cause unnecessary inference. |
| Cross-installation federation | Existing A2A and interoperability controls | Reuse protocol and trust concepts only. Keep remote peers disabled until identity, signing, authorization, replay protection, data classification, and independent conformance tests pass. |
| Plugin and hook trust controls | GEAS capability authorization and integration registry | Require immutable source/version provenance, explicit capability scopes, reviewed code, and sandbox boundaries. Never grant an external plugin the ambient permissions of the owner or server process. |

## Existing GLORIFIER components to reuse

The inspected GLORIFIER baseline already contains the core building blocks required for a selective implementation:

- `AGENT_RUNTIME.md` documents the A2A interface, durable Autopilot mission APIs, requester scoping, idempotency, optimistic state transitions, bounded leases, reconciliation, evidence references, and the human merge/deployment boundary.
- `src/lib/autopilot-orchestrator.ts` connects mission execution to the AI CEO policy, Specialist Council, provider registry, A2A runtime, capability authorization, GEAS policy, the execution fabric, and the GitHub App writer. It includes provider endpoint attestation and durable quota reservation for free-tier repository contributions.
- `docs/PLUGIN-INTEROPERABILITY-PLAN.md` already defines discovery, canonical capability descriptors, MCP/A2A/provider adapter boundaries, governance, execution controls, evidence, and lifecycle monitoring.
- `package.json` registers focused tests for the agent runtime, A2A runtime, agent state store, Autopilot, capability authorization, provider routing, and GEAS controls.

These source files show repository implementation and test contracts. They do not establish that every external provider, production service, or interoperability claim is live or fully verified.

## Explicitly not adopted

1. **No wholesale Ruflo installation or vendoring.** This would add a large, independently evolving runtime and duplicate GLORIFIER's mission, policy, provider, and storage layers.
2. **No ambient in-process mods or unreviewed hooks.** Ruflo's own installation guidance says its mods run with the invoking account's permissions and are not sandboxed. Any future integration must be isolated and capability-scoped.
3. **No AgentDB/RuVector dependency by default.** GLORIFIER should first use and measure its existing durable stores. A second database creates another backup, retention, tenant-isolation, migration, and incident-response surface.
4. **No fixed 270-second heartbeat.** The upstream's recommendation is tied to particular prompt-cache/session TTL assumptions. GLORIFIER must not spend inference merely to keep a prompt cache warm.
5. **No imported Raft, Byzantine, or CRDT state authority.** GLORIFIER's persistent mission store and guarded state transitions remain authoritative. Distributed consensus is a separate design decision, not a prerequisite for multi-agent task delegation.
6. **No silent model/provider routing changes.** All provider calls remain subject to the current owner-approved endpoint/model attestation, free-tier quota reservation, egress approval, and zero-paid-cost policy.
7. **No automatic merge, deployment, credential changes, financial action, or production mutation.** Agent consensus or a successful tool response cannot replace GEAS authorization and required human approval.

## Incremental implementation sequence

### Stage 1 — Architecture alignment

This assessment records the reusable patterns and the non-adoption boundaries. No runtime behavior changes in this stage.

### Stage 2 — Bounded task decomposition

Where an observed engineering bottleneck justifies it, extend the existing Specialist Council/Autopilot contracts to represent a small, explicit task graph: coordinator, role-specific assignments, prerequisites, deadlines, cancellation, and per-step evidence. Add focused tests before changing runtime behavior. Concurrency must be bounded by available free quotas and the mission's configured resource ceiling.

### Stage 3 — Scoped memory

Only after identifying a concrete retrieval gap, add a storage adapter over an existing GLORIFIER persistence boundary. Require tenant and mission isolation, input-size limits, secret/PII screening, provenance, expiry, deletion behavior, and poisoning tests. Do not treat raw conversation history or external content as trusted memory.

### Stage 4 — Operational visibility

Expose a read-only event stream or polling surface over persisted mission and worker state. Verify that displayed status is sourced from the server-side ledger and that stale/missing observations are explicit.

### Stage 5 — Federation, only after conformance

Evaluate remote agent collaboration separately. Require cryptographic identity and key rotation, signed messages, peer revocation, scoped capabilities, replay/expiry checks, data-loss controls, and independent interoperability evidence. A successful local mock is not external conformance.

## Acceptance criteria for any future runtime adoption

- A documented problem and measurable benefit justify the change over existing GLORIFIER components.
- A design review identifies the exact module and protocol boundary; no parallel source of truth is introduced.
- Tests cover bounded fan-out, task isolation, cancellation, lease expiry, idempotency, retry policy, and failure reconciliation.
- Memory tests cover tenant/mission isolation, prompt-injection or poisoning resistance, provenance, expiry, and secret redaction.
- Provider execution is blocked unless the exact provider/model/endpoint is owner-attested and quota has been reserved before the request.
- Repository writes use only the owner-controlled GLORIFIER GitHub App identity, the allowed mission-scoped branch/path rules, and draft PR creation. Agents do not merge.
- CI results are checked against the exact proposed commit. Production status is not inferred from source code or CI alone.
- No paid inference, automatic top-up, new secret, production deployment, or external egress is enabled by the integration.

## Upstream references inspected

All source links below are pinned to the inspected upstream commit:

- [Ruflo README and architecture overview](https://github.com/ruvnet/ruflo/blob/8cb2fbc7a1e9e08f20fc5fc6a45e1046ad0369b9/README.md)
- [Swarm coordination, topology and worktree isolation](https://github.com/ruvnet/ruflo/blob/8cb2fbc7a1e9e08f20fc5fc6a45e1046ad0369b9/plugins/ruflo-swarm/README.md)
- [Autopilot loops and learning](https://github.com/ruvnet/ruflo/blob/8cb2fbc7a1e9e08f20fc5fc6a45e1046ad0369b9/plugins/ruflo-autopilot/README.md)
- [AgentDB and namespace conventions](https://github.com/ruvnet/ruflo/blob/8cb2fbc7a1e9e08f20fc5fc6a45e1046ad0369b9/plugins/ruflo-agentdb/README.md)
- [Stateful workflow contracts](https://github.com/ruvnet/ruflo/blob/8cb2fbc7a1e9e08f20fc5fc6a45e1046ad0369b9/plugins/ruflo-workflows/README.md)
- [Recurring worker behavior](https://github.com/ruvnet/ruflo/blob/8cb2fbc7a1e9e08f20fc5fc6a45e1046ad0369b9/plugins/ruflo-loop-workers/README.md)
- [Federation trust and budget controls](https://github.com/ruvnet/ruflo/blob/8cb2fbc7a1e9e08f20fc5fc6a45e1046ad0369b9/plugins/ruflo-federation/README.md)
- [Ruflo MIT license](https://github.com/ruvnet/ruflo/blob/8cb2fbc7a1e9e08f20fc5fc6a45e1046ad0369b9/LICENSE)

Ruflo's upstream repository declares the MIT License. This assessment copies no upstream source code. If code is vendored or adapted in a later change, preserve the applicable copyright and license notice and complete the repository's dependency and supply-chain review.

## Change scope and verification status

This document is an architecture assessment and adoption boundary only. It introduces no npm dependency, source-code copy, provider request, inference, new secret, database migration, production configuration change, or deployment. Runtime adoption remains **NOT IMPLEMENTED** until a separately tested change passes the acceptance criteria above.
