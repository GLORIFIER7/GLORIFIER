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

The mission ledger provides durable state, requester scoping, idempotent creation, optimistic concurrency, bounded leases, evidence references, and crash reconciliation. Provider-backed planning, bounded read-only inspection, and optional branch-scoped GitHub maintenance are described in the following section. Event-driven triggers and non-GitHub external action adapters are not implemented.


## Governed Autopilot orchestration

The persistent mission engine is connected to the GLORIFIER AI CEO policy, Specialist Council, provider orchestrator/registry, persistent A2A task runtime, capability authorization, GEAS policy engine, and GitHub adapters. Long-running provider and A2A operations now run under a renewable mission lease. Compare-and-swap state transitions pause and drain the heartbeat before updating the mission version. Planning failures are recorded immediately; uncertain execution is moved to `reconciliation-required`.

With no write credential, the AI CEO can plan only four bounded read operations on the public `GLORIFIER7/GLORIFIER` repository:

- `github.get_repository` — repository metadata.
- `github.list_pull_requests` — bounded pull-request listing.
- `github.list_workflow_runs` — bounded workflow-run listing.
- `github.read_file` — bounded text-file reads at an explicit branch, tag, or commit.

A server-side `GLORIFIER_GITHUB_WRITE_TOKEN` enables three additional, narrowly scoped repository operations. The token is never sent to a model or browser. The adapter is fixed to this repository and the GitHub HTTPS API origin. It can create a branch in the `autopilot/mission-*` namespace from `main`, update at most two previously inspected source files on that branch, and open one draft pull request back to `main`. File paths are restricted to `src/`, `scripts/`, `tests/`, `docs/`, `.github/workflows/`, `AGENT_RUNTIME.md`, and `README.md`; secrets, environment files, dependency manifests, lockfiles, generated files, and out-of-scope paths are rejected. The current file must still match the SHA-256 captured during preflight inspection or the update is refused. A new or uninspected file cannot be created by this adapter.

The write credential should be a fine-grained token scoped only to `GLORIFIER7/GLORIFIER`, with the minimum repository permissions required for Contents read/write and Pull requests read/write. Because workflow files are within the allowlist, GitHub may additionally require the Workflows permission for updates under `.github/workflows/`; omit that permission when workflow-file maintenance is not required. Store the token only as a backend/server secret. Never place it in a `VITE_*` variable, client bundle, public Worker variable, source file, issue, log, or prompt. No GitHub Administration, Actions dispatch, secrets, deployments, package publishing, merge, wallet, billing, or financial permission is used.

Each plan is bounded to six steps. A repair plan must create its exact mission-scoped branch first, re-read each target file on that branch, update only the inspected paths with their preflight content hash, and create a draft PR last. Each step is checked by capability authorization and GEAS before dispatch. A second verifier makes a fresh GitHub REST read and compares the resulting branch reference, file SHA, or pull-request metadata with the adapter result. SHA-256 evidence, verifier identity, timestamp, and source URL are stored with the completed step. The A2A analysis artifact is supplementary, not external proof. The verifier is a separate code path but shares GitHub as its trust domain; it is not independent third-party attestation.

Recovery quarantines expired leases first. Only unfinished, explicitly read-only, idempotent GitHub operations may be requeued for one bounded retry. Any interrupted branch/file/PR mutation remains in `reconciliation-required`; write operations are never replayed automatically because a commit may already have been created. The adapter cannot merge a PR or deploy a production release. Draft PRs require human review, successful CI, and a separate human-controlled merge. High-impact, irreversible, financial, legal, security, production, credential, and destructive actions remain outside autonomous authority.

The daemon processes at most one due mission per cycle. Runtime readiness still requires durable mission storage, persistent A2A storage, an A2A signing secret, an active configured provider, and all three owner-controlled inference flags. The write adapter is configured only when the server-side token is present; the code cannot prove that the deployed secret has valid repository permissions without a live runtime write-and-readback check. Event-driven triggers, non-GitHub external adapters, a second trust domain, and production deployment automation are not claimed as implemented.

**Inference cost gate:** Autopilot does not invoke any provider by default. Before the daemon may claim a mission or call the Specialist Council/provider orchestrator, all three owner-controlled environment flags must be explicitly set to `true`: `GLORIFIER_ENABLE_INFERENCE`, `GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS`, and `GLORIFIER_PAID_INFERENCE_AUTHORIZED`. Missing or false values leave queued missions untouched. This is intentional under GLORIFIER's zero-budget default; configuration and credentials alone do not authorize billable inference or external prompt transmission.
