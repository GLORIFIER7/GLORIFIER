# REA Reverse-Intelligence Capability Assessment

**Reviewed:** 2026-11-17  
**Upstream:** [morluto/rea](https://github.com/morluto/rea)  
**Package:** [rea-agents](https://www.npmjs.com/package/rea-agents)  
**Upstream license:** MIT (verified from the upstream `LICENSE`)  
**GLORIFIER adoption status:** proposed / documentation-only; no REA package, MCP server, native engine, or production integration is installed by this assessment.

## Decision

Adopt REA as an **optional, owner-authorized, host-side reverse-intelligence source** for GEAS and the engineering fleet. Do not vendor the repository, add `rea-agents` to GLORIFIER's runtime dependencies, or deploy its analysis runtime inside the Cloudflare Worker.

REA's useful contribution is a local MCP/CLI workflow that inspects software artifacts and returns structured, traceable findings. It complements GLORIFIER's existing architecture scanner, evidence model, Autopilot mission controls, and fixed-scope read-only GitHub MCP endpoint. It does not replace any of them.

This is an assessment and design boundary, not evidence that REA is installed, running, connected, or verified in GLORIFIER.

## What was inspected

The upstream default-branch README, `package.json`, `LICENSE`, and MCP runtime-contract reference were inspected.

The upstream README describes local MCP/CLI analysis of native binaries, JavaScript/Electron applications, websites, .NET assemblies, Android APKs, model artifacts, WASM, EVM bytecode, SQLite databases, recorded network captures, and other formats. Depending on the target, REA uses built-in static inspection or optional third-party engines such as Hopper, Ghidra, IDA, or Kuna. Runtime/browser and device observations have separate host/tool requirements.

The inspected upstream package metadata reports `rea-agents` version `6.9.0`, MIT licensing, and Node.js support `^22.23.4 || ^24.22.1 || >=26.12.1`. GLORIFIER's root package currently declares Node.js `>=24.12.0`. Therefore, the root engine range alone does **not** guarantee a compatible Node 24 runtime for REA. Any future REA sidecar must check the actual runtime and must not silently change GLORIFIER's global Node requirement.

The upstream MCP contract emphasizes complete Evidence records, stable evidence IDs, normalized results, raw provider results when available, retained session bundles, parent-evidence references, and explicit coverage/unknown handling. These are useful design patterns; they are not evidence that GLORIFIER currently implements REA's contracts.

## GLORIFIER capability mapping

| REA capability | Potential GLORIFIER use | Initial boundary |
|---|---|---|
| JavaScript / Electron application analysis | Inspect owned GLORIFIER frontend bundles, source maps, module graphs, IPC boundaries, and release exposure | Analyze build artifacts or owner-supplied copies; do not infer production runtime health |
| Native binary and binary-hardening inspection | Review approved release artifacts for format metadata and mitigation indicators | Static analysis first; do not execute unknown binaries |
| Android APK and signature inspection | Inspect GLORIFIER APK manifests, signing metadata, and package contents | Use only owner-controlled builds and explicitly supplied artifacts |
| WASM / EVM bytecode inspection | Examine deployed or candidate artifacts and compare observed interfaces with declared manifests | Read-only; chain state and ownership require separate trusted RPC/explorer evidence |
| Model-artifact metadata | Inventory approved GGUF / Safetensors files and tensor metadata | No model execution, weight upload, or automatic provider activation |
| HAR / recorded network-capture inspection | Investigate owner-supplied captures for routes, requests, responses, and exposed payloads | Redact credentials and personal data before retention; never capture secrets by default |
| Website/browser observation | Investigate an explicitly authorized test target | Test/staging first; no unapproved probing of third-party systems |
| .NET, firmware, crash, and desktop artifact analysis | Specialized incident and compatibility investigations | Enable per-tool only after host prerequisites and isolation are verified |

## Proposed integration boundary

1. **Execution location:** run REA as an optional local or isolated host-side process connected to an authorized agent through MCP stdio. Keep it outside the Cloudflare Worker, public API, production request path, and the fixed-scope GitHub MCP server.
2. **Discovery only by default:** register the REA server as unavailable until the owner has installed it, checked the package origin/version, reviewed setup changes, and explicitly enabled the integration. Do not run `npx`, download binaries, install native engines, or modify agent configuration automatically.
3. **Narrow target scope:** accept only caller-supplied artifacts or paths under an explicit, owner-approved workspace allowlist. Resolve paths, reject traversal and symlink escapes, bound file size, archive expansion, output size, runtime, and concurrency. Reject arbitrary URLs and unapproved live targets.
4. **Read-only analysis:** do not enable artifact modification, application control, package installation, shell execution, device mutation, credential access, deployment, or GitHub writes through the REA adapter. Analyze untrusted files in a disposable, unprivileged sandbox with no production secrets and no network egress by default.
5. **Evidence normalization:** preserve REA's original evidence ID and tool/version metadata. Map observations into GLORIFIER's evidence contract with source identity, artifact digest, observation timestamp, analysis profile, coverage, limitations, and redacted excerpts. Keep raw reports as bounded, access-controlled artifacts; do not store whole binaries or sensitive captures in the ordinary mission ledger.
6. **GEAS classification:** label direct parser facts as `observed-fact`; label inferred behavior as `analysis`; label proposed remediations as `recommendation`. A REA output is not by itself independent verification, security certification, source-code equivalence, production-state proof, or authorization to change code.
7. **Governed workflow:** Autopilot may create an investigation mission from a finding. It must not execute a recommended repair merely because REA reported it. Any implementation follows the existing capability authorization, least-privilege, budget, branch-scoped maintenance, test, CI, review, and approval requirements. No automatic merge.

## Evidence contract for a future adapter

A future adapter should emit a versioned envelope containing at least:

- `schemaVersion`, `producer`, `producerVersion`, `toolName`, and `analysisProfile`;
- `evidenceId` from REA, plus a GLORIFIER evidence reference;
- an opaque artifact reference, artifact type, SHA-256 digest, and byte size;
- `observedAt`, execution environment, and applicable tool/engine versions;
- normalized facts, analysis findings, and recommendations as separate classes;
- coverage state (`complete`, `partial`, or `unknown`), omitted/unavailable facets, and explicit limitations;
- bounded, redacted excerpts and integrity metadata for any retained report.

The adapter must reject malformed or mismatched evidence identities, missing artifact digests, invalid timestamps, unsupported schema versions, and findings that claim broader coverage than the producer reported. Re-reading or paging retained evidence does not turn an old observation into a current live-state check.

## Cost, runtime, and licensing

- The inspected upstream source declares MIT. If GLORIFIER later copies any substantial upstream code, retain the upstream copyright and MIT license notice and review the exact copied files.
- The inspected upstream package requires Node.js `^22.23.4 || ^24.22.1 || >=26.12.1`. Use a separately pinned compatible runtime for a sidecar; do not assume every GLORIFIER deployment runtime satisfies it.
- The npm package's MIT license does not make optional native analysis engines, hosted compute, device hardware, or other third-party services free. Review each prerequisite and its license/cost before enabling it.
- Do not add a package dependency or increase baseline install/build size until a concrete use case, dependency audit, supply-chain review, budget impact, and test plan are approved.

## Rollout gates

### Gate 0 — assessment (this change)

- Record upstream purpose, license, runtime requirements, capability mapping, and non-adoption boundaries.
- Keep runtime behavior, dependencies, secrets, production routes, and deployment configuration unchanged.

### Gate 1 — isolated proof of capability

- Use one owner-controlled sample artifact (for example, a GLORIFIER test APK or JavaScript build artifact).
- Run REA manually in a disposable, unprivileged environment with no secrets and no network egress.
- Capture the exact package version, command/tool, host runtime, artifact digest, output digest, and limitations.
- Compare the reported facts with an independent existing tool or direct source inspection.
- Record cost, resource use, false positives, and whether the output is useful to GEAS.

### Gate 2 — optional MCP adapter

Proceed only after Gate 1 passes and a separate reviewed change defines the adapter schema, path allowlist, process supervision, timeouts, output bounds, cancellation, data redaction, sandbox profile, observability, and failure behavior. Add focused tests before implementation and run the repository's required checks.

### Gate 3 — bounded Autopilot use

Allow only read-only investigation missions by default. Any proposed source edit remains a separate governed change with exact file preflight, tests, CI, review, and the existing explicit approval boundary.

## Acceptance criteria for future implementation

- REA is disabled and absent from production runtime paths unless explicitly enabled by the owner.
- The adapter can analyze only caller-authorized local artifacts within canonical allowed roots.
- Traversal, symlink escape, oversized files/archives, malformed output, timeouts, cancellation, and subprocess failure are covered by tests.
- No credentials, environment files, private keys, or unrestricted network access are exposed to the analysis process.
- Every normalized finding links to immutable artifact/evidence digests and reports its coverage and limitations.
- Findings never directly authorize code changes, production actions, merges, spending, or deployments.
- No claim of REA integration or verification is made until an isolated end-to-end test passes with inspectable evidence.

## Non-goals

- Replacing GEAS, GATS, the existing evidence ledger, the GitHub adapter, or MCP conformance tests.
- Running an arbitrary reverse-engineering service in the Cloudflare Worker.
- Installing Hopper, Ghidra, IDA, Kuna, JADX, ADB, Frida, or other optional tooling automatically.
- Analyzing software, accounts, networks, devices, or services without authorization.
- Executing unknown binaries or malware, bypassing access controls, extracting secrets, or modifying third-party systems.
- Claiming that a source-code or binary analysis proves the current deployed production state.

## Sources

- [REA repository and upstream README](https://github.com/morluto/rea)
- [REA package metadata](https://github.com/morluto/rea/blob/main/package.json)
- [REA MIT license](https://github.com/morluto/rea/blob/main/LICENSE)
- [REA MCP runtime contracts](https://github.com/morluto/rea/blob/main/docs/reference/mcp-contracts.md)
- [GLORIFIER architecture scanner policy](geas-scan-operations.md)
- [GLORIFIER GEAS reconciliation model](../GEAS-ARCHITECTURE-RECONCILIATION.md)
- [GLORIFIER MCP endpoint assessment](mcp-reference-conformance.md)
- [GLORIFIER Autopilot runtime and execution contract](../../AGENT_RUNTIME.md)
