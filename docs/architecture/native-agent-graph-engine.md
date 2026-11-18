# GLORIFIER Native Agent Graph Engine

**Implementation branch:** `fix/autopilot-graph-legacy-write-serialization-20261118`  
**Base:** repository `main` at `1dbd72cfa406b2c26bbb09e807380f0d0ca8aa1a`  
**Design:** native DAG execution inside the existing Autopilot mission ledger  
**Runtime verification:** pending branch CI and deployment/runtime observation

## Decision

GLORIFIER owns the durable mission graph and execution authority. Third-party frameworks remain optional adapters or architectural references. Do not add a second orchestration runtime, database, scheduler, or hosted control plane for capabilities the current mission store can provide.

## Contract

Each planned step has:

- a unique bounded `id`;
- an existing, authorized `capability`;
- a bounded `objective`;
- an effect classification (`read-only`, `reversible`, or `irreversible`);
- optional typed tool arguments validated by the existing concrete adapter;
- `dependsOn`, a list of prerequisite step IDs.

New dependency-graph plans are limited to six steps. This is intentionally stricter than the 30-step ceiling retained for pre-graph sequential mission records. Legacy records with no `dependsOn` fields remain a linear chain and must stay claimable up to 30 steps; the scheduler's legacy path validates that persisted ceiling separately. Validation rejects invalid/duplicate IDs, malformed dependency lists, duplicate dependencies, self-dependencies, unknown nodes, cycles, and unsupported effect values. A stable topological order is produced for reproducible planning and audit traces.

For backward compatibility, a mission plan with no `dependsOn` declarations is normalized as a linear chain in its original order. New AI CEO plans are prompted to declare dependencies explicitly. Once a plan contains explicit dependency declarations, omitted `dependsOn` values mean no prerequisites; the graph is still checked for cycles and unknown references.

## Dispatch policy

- A step is ready only when its state is pending and all prerequisites have completed with verified evidence.
- At most two independent `read-only` steps are dispatched in one wave.
- Mutating or irreversible work is dispatched one step at a time. Repository write plans must preserve branch creation, source inspection, path-matched update, and final draft-PR dependency edges.
- The existing capability authorization and GEAS policy are evaluated before each claim.
- Claims and durable completions are serialized through the existing optimistic-version mission store. Only external read-only work is concurrent.
- The scheduler waits for every operation in a wave to settle before entering failure reconciliation. Successful siblings are written to the ledger; failed or uncertain in-flight siblings remain subject to the existing reconciliation-required recovery path.
- Expired leases do not authorize replay of repository mutations. Existing recovery may retry only explicitly allowlisted read-only idempotent GitHub operations within the existing bounded retry policy.

A completed status without verified evidence cannot unlock a dependent step. Existing source-readback verification and A2A analysis artifacts remain distinct; model analysis is not a substitute for source verification.

## Persistence and compatibility

Dependencies are stored on each step in the current JSONB mission payload. The existing requester-scoped mission ID/idempotency key, optimistic version, lease owner/expiry, step status, evidence references, approvals, and recovery fields remain authoritative. No additional database, table, or schema migration is required for this graph feature.

Legacy records that have no dependency fields continue as sequential plans. A malformed legacy graph fails closed rather than being guessed into an executable plan.

## Security boundary

This graph engine is a scheduler, not a permission grant. It cannot create new capabilities. MCP and A2A actions still require their respective integration contracts and conformance checks. Remote framework output, agent cards, tool output, workflow source, and retrieved memory remain untrusted inputs.

The graph cannot autonomously merge pull requests, deploy production, sign transactions, mint or transfer assets, trade, rotate credentials, make financial/legal commitments, or perform destructive actions. The GitHub writer remains confined to the existing branch-scoped source update and draft-PR flow. Human owner authority remains final.

## Validation

Focused validation commands:

```bash
npm run test:autopilot-orchestrator
npm run test:autopilot-mission-control
npm run lint
```

Tests cover stable topological ordering, legacy linear normalization and claimability, unknown/self/duplicate dependencies, cycle rejection, bounded graph size, read-only concurrency limits, prevention of concurrent mutations, blocked downstream work, store-interface dependency persistence, and safe repository-write fan-in. The mission-control persistence tests use an in-memory store; database-backed persistence and production mission execution remain unverified.

**Evidence status:** the source implementation is on `main`; this repair branch adds regression coverage for legacy mission claimability and mutation serialization. Local execution is unavailable in the current editing environment because it provides Node 22.16.0 while the repository requires Node `>=24.12.0`, and dependencies cannot be installed without network access. Exact-head GitHub CI, code scanning, and code-quality results must pass before the repair can be considered validated. No production mission execution or inference is claimed.
