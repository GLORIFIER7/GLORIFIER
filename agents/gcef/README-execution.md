# GCEF remaining-phase foundations (2B–5)

Additive local prototype following merged Phase 2A. Read the original architecture document for the inherited static-inspection policy. This is not a full Kernel/TinyFish replacement, production service, active external-site browser or repository-wide verification. Never report issue #471 fully verified from these tests.

| Phase | Candidate | Remaining boundary |
| --- | --- | --- |
| 2B | Actual Chromium DOM note input, readback, scroll and screenshot in an offline escaped evidence view | Original-site scripts and DOM, live-site egress isolation and authorized external actions not implemented |
| 3 | AES-256-GCM encrypted, exact-origin profile-state file store, expiry and local revoke | Human-mediated sign-in, browser restoration, key lifecycle, server-side session revocation not implemented |
| 4 | Owner-local explicit approval, SQLite transactional durable mission ledger, 45s leases, 120s task expiry, bounded fixed-action result receipts | GEAS/Digital Me adapters, policy identity and production persistence not connected |
| 5 | TLS-only worker claim/finish interface, owner-registered worker host scopes and bearer hashes, independent worker host allowlist, expiry/reclaim and revocation | Real multi-host execution, private network, fleet scheduler, resource quotas, independent evidence, MCP/A2A not verified |

No arbitrary execution, model inference, login automation, credential extraction, original-site form submission or modification to the existing Linux diagnostic agent. Worker results are authenticated claims, not independently verified remote observations. State-changing actions remain outside the contract. Owner operations are local CLI/file-system trust only; do not expose the ledger directory to workers or untrusted users. A worker can only process approved static GET plans and must independently allow the plan's hosts. Only approve known read-only public URLs; HTTP GET alone cannot guarantee absence of side effects.

## Tests

From repository root:

```sh
python3 -m unittest discover -s agents/gcef -p 'test_*.py' -v
# optional: existing trusted Playwright, cryptography, Debian Chromium, openssl
# run as an unprivileged user; no external services or real credentials
 timeout 60s python3 agents/gcef/local_smoke.py
```

The standard unit suite needs no new dependency. The optional smoke uses real AES-GCM, TLS and Chromium against synthetic fixtures; it does not install software or contact an external target. The vault imports cryptography only on construction. Use an audited, maintained installation; no automatic download. Do not run the smoke with Python assertions disabled.

## Local operator / isolated test network only

Run as an unprivileged dedicated account. Create private directories mode 0700, files mode 0600. Use an owner-controlled TLS certificate with matching hostname and securely installed trust anchor. Do not expose the prototype on the public internet: a private firewall, request deadlines, process resource limits, certificate management, monitoring, audit, backup and abuse protection are prerequisites for deployment. SQLite is a single-controller local file, not a shared network filesystem. TLS endpoint and trust roots are locally configured by the worker; never accept a URL from a mission as a controller endpoint. Store the one-time worker credential directly in a protected file, not chat or logs. Use a secure delivery channel to the worker.

```sh
umask 077
mkdir -m 700 "$HOME/gcef-private"
cd "$HOME/gcef-private"
# set GCEF to the absolute directory of the checked-out agents/gcef files
python3 "$GCEF/worker_transport.py" register ledger.db worker.json --allow-host www.example.com
# local TLS server (requires existing cert.pem and key.pem)
python3 "$GCEF/worker_transport.py" serve ledger.db --cert cert.pem --key key.pem
```

In a second trusted terminal, create an explicit owner-approved plan file (example target only; choose a known read-only page). The worker must explicitly approve the same hostname:

```sh
umask 077
printf '%s' '{"url":"https://www.example.com/","hosts":["www.example.com"]}' > plan.json
python3 "$GCEF/worker_transport.py" submit ledger.db plan.json
python3 "$GCEF/worker_transport.py" worker https://localhost:8443 worker.json --ca-file cert.pem --allow-host www.example.com
# status prints the private receipt; do not send it to public logs.
python3 "$GCEF/worker_transport.py" status JOB_ID
python3 "$GCEF/worker_transport.py" revoke WORKER_ID
```

The worker executes one mission per invocation; a supervisor can invoke periodically with a strict external deadline and bounded resources. Use no paid inference. A failure or stale receipt must remain a failure. Revocation is local and prevents further authenticated claim/result processing; it cannot recall data already received by a worker. Do not treat deletion of an encrypted profile as revocation of sessions at the original provider. Keep profiles on the local owner-controlled machine. The vault library is deliberately not connected to the worker API, AI or browser sign-in. No live user credentials are needed or requested by this candidate.

## Hardening and migration

Worker registration now requires an explicit owner-side `--allow-host` scope. Existing pre-scope worker registrations are revoked transactionally on first opening the ledger; re-enroll them through the local owner CLI and securely replace credentials. The controller filters compatible plans before leasing and the worker retains its independent allowlist. TLS handshake/request handling is bounded to eight concurrent peers with five-second socket inactivity limits and a ten-second connection deadline. Keep the service private; saturation of all slots can still deny service. The canonical JSON receipt bound is 1 MiB plus 4 KiB for the transport envelope, sufficient for the current static inspector limits. These are local prototype protections, not evidence of production readiness.

### Offline evidence viewing and safe diagnostics

The offline viewer accepts a direct static inspection receipt or the successful worker result envelope (`status: succeeded` and `receipt`) as a JSON file up to the shared 1 MiB encoded limit. This matches the ledger result ceiling; the existing title, text and screenshot pixel bounds still apply. A large receipt that cannot fit the bounded screenshot is preserved as JSON and the renderer fails closed. A rendered receipt is not independent evidence of the original website. Unexpected worker server faults emit only `GCEF_UNEXPECTED_SERVER_ERROR` and a trusted module label and numeric traceback location to stderr; no request bodies, exception messages, peer addresses or credentials are logged. Expected TLS negotiation and connection failures remain suppressed.
