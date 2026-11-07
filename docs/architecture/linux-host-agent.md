# GLORIFIER Linux Host-Agent Integration

**Implementation status:** Source implementation on a feature branch; live operation remains **NOT VERIFIED**.

## Boundary

The backend is the governance and authorization control plane. A Linux host agent initiates outbound HTTPS requests to the backend (directly or through the reviewed Cloudflare Worker backend proxy). No inbound listener, SSH daemon, reverse shell, or generic remote-command executor is introduced.

## Enrollment and trust

1. An authenticated owner calls `POST /api/linux/runtimes/enroll`.
2. The backend generates a 256-bit random bearer token and returns it once.
3. Only its SHA-256 digest is stored in `linux_agent_credentials`; token plaintext must be held in the host's root-owned environment file.
4. The host agent authenticates every heartbeat, task claim, and result request with that host-scoped token over HTTPS.
5. Owner revocation marks the runtime revoked, revokes its credential and cancels pending/claimed tasks.

TLS certificate validation is enabled. The agent refuses HTTP, URL credentials, non-origin URLs and redirects. The token must never be committed to the repository, added to logs, or pasted into source control.

## Execution model

The owner must have a verified GLORIFIER owner identity to enroll a host, request a task, inspect task history, or revoke a host. Task creation is the approval boundary. Task payloads carry a fixed action name and an empty parameter object; arbitrary command strings and caller-controlled executable arguments are not accepted.

Supported actions are intentionally read-only:

- `host.info`: distribution, kernel, architecture, hostname and Python version.
- `memory.info`: total, available and used memory from `/proc/meminfo`.
- `disk.info`: root filesystem capacity from the standard-library disk usage API.

Tasks expire after two minutes. Each claim has a 45-second lease and a distinct random 256-bit lease token; only its SHA-256 digest is persisted, and the token must accompany the result receipt. An expired claim is returned to the approved queue only while its two-minute task lifetime remains. Reclaims rotate the lease token, and the backend rejects stale/replayed results and stores a bounded JSON result with a canonical JSON SHA-256 digest. Heartbeat freshness is 90 seconds; stale hosts are shown as offline and cannot be issued new tasks.

## API surface

| Principal | Method and path | Purpose |
|---|---|---|
| Owner | `POST /api/linux/runtimes/enroll` | Enroll a Linux agent and return one-time token |
| Owner | `GET /api/linux/runtimes` | View runtime status and last heartbeat |
| Owner | `POST /api/linux/runtimes/{runtimeId}/tasks` | Approve one fixed diagnostic |
| Owner | `GET /api/linux/runtimes/{runtimeId}/tasks` | Inspect task receipts |
| Owner | `POST /api/linux/runtimes/{runtimeId}/revoke` | Revoke host credential and tasks |
| Agent | `POST /api/linux/agent/{runtimeId}/heartbeat` | Prove possession of host credential and report bounded facts |
| Agent | `POST /api/linux/agent/{runtimeId}/tasks/claim` | Claim one approved task |
| Agent | `POST /api/linux/agent/{runtimeId}/tasks/{taskId}/result` | Submit bounded result receipt |

## Host hardening

The supplied systemd unit runs as the dedicated unprivileged `glorifier-agent` user with no Linux capabilities, a read-only system view, private temporary directory, protected kernel/control-group settings, no new privileges and a restrictive umask. It does not require root after installation.

## Verification gates

The following must all pass before this can be promoted beyond source-level status:

1. Exact-head Node contract tests, Python unit tests, type-check and Linux workflow jobs pass.
2. A human reviews and approves the implementation; required repository protections remain enabled.
3. The backend is deployed with the database schema initialized and its URL correctly configured in the Worker exact-host allowlist, where applicable.
4. An owner enrolls an authorized non-production Linux host and installs the agent using the root-owned environment file.
5. A fresh authenticated heartbeat is observed and the runtime transitions to online.
6. An owner issues `host.info`, `memory.info` and `disk.info` tasks; each is claimed and a matching result receipt is read back.
7. Credential revocation is tested; the revoked agent receives 401 and cannot claim or complete further tasks.
8. Logs and receipts are reviewed for secret redaction, bounded output, tenant/host isolation, expiry, lease handling and safe failure.

A green CI run is not a live host. A registered token is not a heartbeat. A heartbeat is not a completed task. Keep the capability **NOT VERIFIED** until the real-host acceptance checks are evidenced.
