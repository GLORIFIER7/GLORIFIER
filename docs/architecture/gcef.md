# GLORIFIER Computer Execution Fabric (GCEF)

Status: phase 1 candidate. Local CLI only. No new remote endpoint, provider inference, credentials, paid services, or changes to the Linux host-agent allowlist. The candidate does not establish #471 acceptance or Kernel/TinyFish feature parity.

## Implemented scope

- Owner-operated static public web inspection: exact HTTPS host allowlist, no URL userinfo/query/fragment/non-default port, public DNS answers only, IPv4 socket pinned to the validated address, TLS validation using the original hostname, GET only, no redirects, cookies, proxy variables, credentials or active page content. Strict UTF-8 HTML/plain text, identity encoding, bounded response and output. No HTML attributes or subresources are fetched. Public content is untrusted data, not agent instructions. Public HTTP GET is not a guarantee that the remote server will have no side effects; restrict destinations to known read-only public pages.
- Evidence receipt: UTC observation timestamp, target, status, content type, byte count, SHA-256 of fetched bytes, bounded extracted text. The hash identifies the observed payload; this is not a signed attestation, independent witness, full page rendering, or proof of semantic correctness. Text extraction can omit visible content or include non-visible text. No original response is stored automatically.
- Optional sandboxed offline Chromium view: renders only escaped extracted text with CSP, fresh browser context, JavaScript/service workers/downloads disabled, offline mode, all routes aborted. Never visits the external page in Chromium. The screenshot depicts the evidence view, not the website. Run unprivileged; never disable the browser sandbox. No persistent browser sessions or arbitrary remote Playwright execution.

## Local usage (Linux)

```sh
python3 -m unittest discover -s agents/gcef -p 'test_*.py' -v
umask 077
timeout 25s python3 agents/gcef/gcef.py https://example.com/ --allow-host example.com > receipt.json
```

For the optional renderer, use an existing compatible Playwright Python installation and its Chromium installation, or an administrator-installed Debian Chromium (`--system-chromium`). Verify their versions and security updates before use. No dependencies are automatically downloaded or installed by this change.

```sh
timeout 30s python3 agents/gcef/browser_view.py receipt.json evidence.png --system-chromium
```

No overwrite of screenshot paths; permissions 0600. Treat receipt/screenshot contents as untrusted and potentially sensitive. Use private storage. This is a manually operated prototype, not a service that accepts remote user requests. Do not expose it to tenants, enable authenticated browsing or run as root. A sandboxed offline view is not a multi-tenant VM isolation boundary.

## Integration and acceptance gates

1. Independently review the implementation; obtain signed GitHub publication through the protected PR workflow; verify exact-head CI and real HTTPS behavior from the authorized Linux host. Verify existing hosting charges and resource limits first.
2. Add a dedicated isolated execution worker with deny-by-default egress at the network boundary, DNS and resource limits, explicit per-mission authorization, session expiry and cleanup, auditable structured action plans and receipts. Preserve the existing diagnostic-only Linux agent; no shell execution or browser commands are added to it.
3. Add authorized active browser navigation and controlled interaction only after sandbox, origin, request and action policy tests. Never expose raw CDP/Playwright to untrusted agents. Enforce approval for sensitive or state-changing actions.
4. Add human-mediated sign-in and encrypted profile storage with scoped access, retention and revocation; keep secrets out of model context and logs. Never extract browser credentials or bypass authentication.
5. Integrate GCEF with GEAS, Digital Me and persistent mission control via scoped contracts; only advertise capabilities proven in deployment. Keep external browser providers optional and budget gates fail-closed.

Current limitations: only static UTF-8 documents, direct IPv4 connection, no redirects or query URLs, no CSS/JS visual fidelity, no active web actions, no credential vault, no durable session controller, no production integration. Unit tests use controlled transport/context doubles and do not establish live connectivity or external sandbox isolation. No further infrastructure is provisioned.
