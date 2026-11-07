# GLORIFIER Linux Host Agent

This is a pull-based, least-privilege Linux agent. It establishes an outbound HTTPS connection to the configured GLORIFIER API, sends a heartbeat, claims owner-approved tasks, executes a fixed read-only diagnostic, and returns a bounded JSON receipt.

## Supported actions

- `host.info`: hostname, Linux distribution, kernel release, CPU architecture and Python version.
- `memory.info`: total, available and used memory from `/proc/meminfo`.
- `disk.info`: total, used and free bytes for the root filesystem.

There is deliberately no shell, SSH server, command string, arbitrary executable, package manager, file-write, sudo, service-control, or privilege-escalation interface. Task payloads contain no caller-controlled executable arguments.

## Backend requirements

The API routes are implemented in the GLORIFIER backend:

- Owner: `POST /api/linux/runtimes/enroll`
- Owner: `GET /api/linux/runtimes`
- Owner: `POST /api/linux/runtimes/{runtimeId}/tasks` (create an approved read-only diagnostic task)
- Owner: `GET /api/linux/runtimes/{runtimeId}/tasks` (inspect task receipts)
- Owner: `POST /api/linux/runtimes/{runtimeId}/revoke`
- Agent: `POST /api/linux/agent/{runtimeId}/heartbeat`
- Agent: `POST /api/linux/agent/{runtimeId}/tasks/claim`
- Agent: `POST /api/linux/agent/{runtimeId}/tasks/{taskId}/result`

The owner routes require a verified GLORIFIER owner identity. Enrollment creates a random 256-bit bearer token; only its SHA-256 hash is stored. The plaintext token is returned once. Agent routes use the per-host token and fail closed for invalid, unknown or revoked credentials. Every task is created through an owner-authenticated route and limited to the three actions above. Claimed work has a 45-second lease; unclaimed tasks expire after two minutes.

The API is reachable through the Cloudflare Worker only when the backend origin and exact-host allowlist are configured correctly. The Worker does not bypass authentication or provide a backend fallback.

## Host installation

Use an authorized host and an account controlled by its administrator. First ensure the GLORIFIER backend is deployed with its database migration/table-creation permissions, then call the owner enrollment route with:

```json
{
  "displayName": "linux-node-01",
  "architecture": "x86_64"
}
```

Record the returned `runtimeId` and one-time `token`. Do not paste the token into source control or a chat.

Create a dedicated unprivileged service account and install the files:

```sh
sudo useradd --system --home-dir /nonexistent --shell /usr/sbin/nologin glorifier-agent
sudo install -d -o root -g glorifier-agent -m 0750 /opt/glorifier-linux-agent
sudo install -o root -g root -m 0644 agent.py /opt/glorifier-linux-agent/agent.py
sudo install -d -o root -g root -m 0750 /etc/glorifier
sudo install -o root -g root -m 0600 /dev/null /etc/glorifier/linux-host-agent.env
```

Edit the environment file locally on the host (never commit it):

```ini
GLORIFIER_API_ORIGIN=https://YOUR-APPROVED-GLORIFIER-API-ORIGIN
GLORIFIER_LINUX_RUNTIME_ID=linux-REPLACE-WITH-ENROLLED-ID
GLORIFIER_LINUX_AGENT_TOKEN=REPLACE-WITH-ONE-TIME-TOKEN
```

Install the supplied unit file as `/etc/systemd/system/glorifier-linux-host-agent.service`, then:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now glorifier-linux-host-agent.service
sudo systemctl status glorifier-linux-host-agent.service
```

The process runs as `glorifier-agent`, with a read-only system view and no Linux capabilities. Validate a new heartbeat by checking `GET /api/linux/runtimes` through the owner-authenticated API. Then create a read-only task, for example `{"action":"host.info"}`, and verify the resulting task receipt in the backend database/audit view.

## Local test

```sh
python3 -m unittest discover -s agents/linux-host-agent -p 'test_*.py' -v
```

## Operational limits

- TLS certificate verification is enabled; the agent rejects non-HTTPS origins and redirects.
- The bearer token is sent only to the configured HTTPS origin and must be protected as a secret.
- Heartbeats and task polling are outbound-only. No inbound listener or network shell is opened.
- The service has no root privileges and cannot perform consequential changes.
- Revocation disables the credential and cancels pending/claimed tasks.
- A successful CI test does not prove a real host is enrolled or online. Live status requires an actual authorized host heartbeat and a completed task receipt.
