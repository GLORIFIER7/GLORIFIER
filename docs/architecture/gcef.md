# GLORIFIER Computer Execution Fabric (GCEF)

Status: Phase 1 merged; Phase 2A bounded session candidate. Local CLI only. No remote endpoint, provider inference, credential vault, paid services or expansion of the Linux diagnostic-agent allowlist. This does not establish #471 acceptance or Kernel/TinyFish parity.

## Implemented scope

- Static public HTTPS inspection: exact approved hostname, direct public IPv4 pinning, TLS 1.2 minimum and certificate validation, GET only, no redirects, queries, fragments, userinfo, cookies, proxies or credentials. Strict UTF-8 and bounded identity-encoded HTML/plain text. Require explicit Content-Length or chunked transfer framing, reject conflicting/unknown framing and incomplete declared bodies. Public GET is not a guarantee of zero server-side effects: approve only known read-only public pages.
- Evidence integrity: exclude omitted HTML content; self-closing SVG/Math elements do not suppress later text; unclosed omission state fails closed. This is conservative text extraction, not a full browser HTML parser. SHA-256 identifies fetched bytes, not a signed attestation. Receipt includes UTC observation time, response status/type/size/hash, bounded title/text and up to 32 validated links; truncation is indicated. Relative links resolve against the requested URL, not page-supplied base tags. Untrusted content is data, not instructions.
- Offline Chromium view: escaped static evidence, CSP, fresh browser context, JavaScript/service workers/downloads disabled, offline mode and aborted routes. The PNG depicts the evidence view, not the original site; oversized views fail closed. Run unprivileged with the browser sandbox enabled.
- Phase 2A session: one ephemeral browser page; up to eight explicit plan actions (navigate, follow by displayed link index, screenshot). Following a generated offline button invokes the pinned inspector on an approved URL; Chromium itself never contacts the website. Failed navigation invalidates prior links/receipt. No form submissions, script execution, live page DOM interaction, session persistence, authentication or arbitrary selectors. Private output directory with exclusive creation of receipts and PNGs. A failed plan can leave earlier receipts; it must not be interpreted as a successful complete plan.

## Local usage (Linux)

```sh
python3 -m unittest discover -s agents/gcef -p 'test_*.py' -v
umask 077
timeout 25s python3 agents/gcef/gcef.py https://example.com/ --allow-host example.com > receipt.json
timeout 30s python3 agents/gcef/browser_view.py receipt.json evidence.png --system-chromium
```

Use an existing compatible Playwright Python installation and Chromium, or administrator-installed Debian Chromium. Verify versions and security updates before use. No dependencies automatically downloaded by this change. Example plan.json:

```json
[{"action":"navigate","url":"https://example.com/"},{"action":"screenshot"}]
```

```sh
timeout 100s python3 agents/gcef/browser_session.py plan.json new-private-output --allow-host example.com --system-chromium
```

Output directory must not exist. For follow use `{"action":"follow","index":0}` only if the previous receipt lists a link at index 0. CLI is Linux-only and owner-operated; use an external supervisor deadline in addition to the process alarm. Treat receipts/PNGs as untrusted and potentially sensitive. Do not expose as a remote or multi-tenant service.

## Acceptance and next steps

1. Signed publication, review and exact-head CI; real HTTPS behavior from authorized Linux host; verify cost and resource limits.
2. Dedicated execution worker with deny-by-default network egress, session isolation, resource limits, per-mission authorization, expiry and cleanup. Preserve the diagnostic-only Linux agent.
3. Actual active site interaction after sandbox, origin, request and action policy tests. Do not expose raw CDP/Playwright to agents. Require explicit approval for sensitive/state-changing actions.
4. Human-mediated sign-in, encrypted scoped profile storage, expiry and revocation; no credentials in model context or logs.
5. GEAS, Digital Me, persistent mission control and scoped MCP/A2A contracts. Advertise only verified capabilities. Keep external providers optional and budgets fail-closed.

Current limitations: static UTF-8, explicit HTTP framing, public IPv4, no redirects/query URLs, no original site rendering or active external-site actions, no persistent profiles, no deployed session service. Unit tests use controlled doubles; offline browser tests do not prove live network reachability or multi-tenant isolation.
