# GLORIFIER Agent-to-Agent Runtime

GLORIFIER is an AI-to-AI application first. The browser is an optional observability client, not the system of record.

## Runtime
- Agent discovery: `GET /api/agents`
- Submit task: `POST /api/agents/tasks`
- Task status: `GET /api/agents/tasks/:id`
- Protocol manifest: `GET /.well-known/glorifier-agent.json`

## Protocol
GLORIFIER-A2A-v1 uses task-oriented JSON over HTTP. It is intentionally compatible with the same conceptual model used by modern agent interoperability protocols: capability discovery, delegation, task lifecycle, artifacts, and explicit authorization boundaries. A2A is an open protocol for agent collaboration, while MCP focuses on agent-to-tool/context integration. citeturn0search0turn0search9

## Design
AI CEO -> delegates -> GPT/Gemini/specialists -> evidence/artifact -> synthesis -> human approval boundary.

No agent may autonomously merge code, deploy production, expose secrets, or make financial/legal commitments.


## Persistent Autopilot mission control

The authenticated mission-control API is available at:

- `GET /api/autopilot/status` — reports durable persistence and explicitly reports which autonomy capabilities are and are not enabled.
- `POST /api/autopilot/missions` — creates a durable mission. Supply an `Idempotency-Key` header and an `objective` field. This only records the mission; it does not claim that planning or execution has started.
- `GET /api/autopilot/missions` — lists missions visible to the authorized owner/internal service.
- `GET /api/autopilot/missions/:id` — retrieves an authorized mission.

Mission records are requester-scoped and idempotent. Mission state changes use optimistic version checks. Workers claim queued missions with bounded leases. An expired lease first moves to `reconciliation-required`. The recovery policy may requeue only an explicitly allowlisted, idempotent read-only GitHub step, and only for one bounded retry; other work remains quarantined. A step marked `irreversible` requires an explicit approval record before it can be claimed. Completion requires evidence references and records verification separately from completion.

The mission ledger provides durable state, requester scoping, idempotent creation, optimistic concurrency, bounded leases, evidence references, and crash reconciliation. Provider-backed planning and bounded read-only tool execution are described in the following section. Event-driven triggers and write-capable external action adapters are not implemented.


## Governed Autopilot orchestration

The persistent mission engine is connected to the existing GLORIFIER AI CEO policy, Specialist Council, provider orchestrator/registry, persistent A2A task runtime, capability authorization, GEAS policy engine, and the existing GitHub MCP read adapter.

The AI CEO may propose at most six steps, each bound to one of four real operations on the public `GLORIFIER7/GLORIFIER` repository:

- `github.get_repository` — repository metadata.
- `github.list_pull_requests` — bounded pull-request listing.
- `github.list_workflow_runs` — bounded workflow-run listing.
- `github.read_file` — bounded text-file reads at an explicit branch, tag, or commit.

The mission planner normalizes each tool name and its arguments against a strict allowlist. It rejects path traversal, unknown arguments, write-capable capabilities, and any tool not exposed by the existing adapter. The adapter remains restricted to the one public repository and the fixed GitHub API origin. No write, merge, push, issue creation, workflow dispatch, deployment, secret, credential, billing, or wallet operation is exposed.

Each step is checked by capability authorization and GEAS before dispatch and again immediately before invocation. The existing GitHub read adapter performs the tool request. A second verifier then performs a fresh direct HTTPS GitHub REST read and compares a normalized source projection with the adapter result. A SHA-256 digest and verifier identity, timestamp, and source URL are persisted with the completed step. The A2A model-generated analysis artifact is supplementary; it is not accepted as external proof. A tool response is never enough by itself to mark the step verified.

Recovery first quarantines expired leases. It may requeue only unfinished steps that are explicitly read-only, map to one of the four supported GitHub capabilities, and have fewer than two attempts. Already completed steps must have valid verification evidence. Unknown capabilities, write-capable work, legacy steps, exhausted retries, and planning failures remain in `reconciliation-required` for human intervention; there is no general automatic replay.

This is a meaningful execution-fabric increment, not a claim that the full autonomous enterprise is operational. The adapter and independent verifier use separate code paths but the same GitHub source and provider; this is not a second trust domain. The current adapter can observe public repository state but cannot repair it. Write-capable repository operations, other external service adapters, event-driven triggers, and independent verification from a separate trust domain remain unimplemented. The human owner remains the final authority for high-impact, irreversible, financial, legal, security, production, and destructive actions.

The daemon processes at most one due mission per cycle. It requires durable mission storage, persistent A2A storage, an A2A signing secret, an active configured provider, and the three owner-controlled inference flags. The Specialist Council supplies advisory engineering, architecture, cybersecurity, and operations findings. A2A workers analyze the verified read-only tool output; they do not mutate external state.

**Inference cost gate:** Autopilot does not invoke any provider by default. Before the daemon may claim a mission or call the Specialist Council/provider orchestrator, all three owner-controlled environment flags must be explicitly set to `true`: `GLORIFIER_ENABLE_INFERENCE`, `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS`, and `GLORIFIER_PAID_INFERENCE_AUTHORIZED`. Missing or false values leave queued missions untouched. This is intentional under GLORIFIER's zero-budget default; configuration and credentials alone do not authorize billable inference or external prompt transmission.
