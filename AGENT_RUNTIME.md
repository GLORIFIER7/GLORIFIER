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

Mission records are requester-scoped and idempotent. Mission state changes use optimistic version checks. Workers claim queued missions with bounded leases. A lease that expires while work is planning or executing is changed to `reconciliation-required`; it is never automatically replayed. A step marked `irreversible` requires an explicit approval record before it can be claimed. Completion requires at least one evidence reference.

The current implementation provides the durable mission ledger, state machine, lease/claim primitives, and recovery boundary. It does **not yet** provide provider-backed autonomous planning, automatic step execution, event-driven triggers, or a production executor. The status endpoint reports those capabilities as disabled. These are subsequent implementation stages, not claims of completed functionality.
