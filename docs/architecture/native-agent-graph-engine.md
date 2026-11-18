# GLORIFIER Native Agent Graph Engine

**Implementation branch:** `research/open-source-agent-orchestration-2026-11-18`  
**Base:** current repository `main` at `48b5ad60e34974d925e27a407571402a28ec00db`  
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

The graph is limited to six steps, consistent with the Autopilot mission-plan limit. Validation rejects invalid/duplicate IDs, malformed dependency lists, duplicate dependencies, self-dependencies, unknown nodes, cycles, and unsupported effect values. A stable topological order is produced for reproducible planning and audit traces.

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

Tests cover stable topological ordering, legacy linear normalization, unknown/self/duplicate dependencies, cycle rejection, bounded graph size, read-only concurrency waves, serialized writes, blocked downstream work, durable dependency persistence, and safe repository-write fan-in.

**Evidence status:** source implementation and tests have been added on the research branch. A local test/build run was not available in the editing environment; successful GitHub CI and runtime execution must be observed before marking this engine verified or enabling it in production.
