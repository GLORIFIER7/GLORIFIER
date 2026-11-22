# Issue #471 — Governed multi-AI workstream distribution

**Repository:** [GLORIFIER7/GLORIFIER](https://github.com/GLORIFIER7/GLORIFIER)  
**Parent:** [#471](https://github.com/GLORIFIER7/GLORIFIER/issues/471)  
**Snapshot:** 2026-11-21; **four open issues** (#471, #615, #616, #432), **33 open PRs** on the observed GitHub search. These are snapshots, not completion claims.  
**Execution status:** **ROUTING DEFINED — NOT DISPATCHED.** The companion [machine-readable manifest](./issue-471-workstream-packets.json) is a proposed ownership map, not evidence that any external model was called.

## Purpose and source of truth

#471 is **one interoperability epic**, not 471 open issues. Divide its acceptance criteria into reviewable packets using existing work and avoid creating duplicate GitHub issues or rebuilding fixes already under review. The live GitHub issue body, each linked PR at its latest head SHA, and current required checks supersede this snapshot when conditions change.

| Packet | Priority | Proposed lead | Independent reviewers | Existing work | Required evidence |
| --- | --- | --- | --- | --- | --- |
| 471-01: CodeQL scanning + protected merge verification | P0 | openai | anthropic, google | #471; #615; PR #953 | Evidence table with analysis category, tool status, head SHA, merge rule outcome and a minimal tested remediation PR only if a reproducible defect exists. |
| 471-02: SonarCloud findings + regression coverage | P0 | google | openai, qwen | #471; #616; PR #949 | Keyed Sonar issue inventory and focused test-backed remediation; report unavailable dashboard access as BLOCKED. |
| 471-03: MCP JSON-RPC + independent conformance | P1 | google | openai, anthropic | #471; PR #941 | Exact versioned protocol transcript, tests, and distinction between mock, CI and authenticated external MCP evidence. |
| 471-04: A2A agent-card + task lifecycle | P1 | openai | anthropic, google | #471; PR #951; PR #950 | Deterministic A2A test report; separate verified staging results from source-only validations. |
| 471-05: Linux host lifecycle + least privilege | P1 | nvidia | meta-local, anthropic | #471; PR #952 | Reproducible Linux/container regression suite plus separately authorized real-host evidence. |
| 471-06: Read-only GLR / EVM / BNB / Solana truth | P1 | google | nvidia, anthropic | #471; PR #947 | Per-chain registry status and test vectors; no signing, mint, transfer, smart-contract write or paid RPC. |
| 471-07: Cloudflare Worker, identity, Neural readiness, Neon/Supabase parity | P2 | openai | google, anthropic | #471; #432 | Environment-specific evidence matrix and plan separating non-observable components from verified paths. |
| 471-08: GEAS / AI CEO / Specialist Council authorization | P2 | anthropic | openai, google | #471; PR #942; PR #944; PR #940 | Governance contract and focused tests for denial-by-default routing and evidence attribution. |
| 471-09: Zero-inference backlog triage + independent review | P2 | meta-local | deepseek, mistral, xai, openrouter, huggingface, groq, ollama | #471; #615; #616; #432; PR #954; PR #946 | Diff-free issue/PR routing report with status NOT_DISPATCHED until real invocation receipt exists. |

## Detailed task boundaries

### 471-01 — CodeQL scanning + protected merge verification

- **Lead candidate:** openai; **review candidates:** anthropic, google. **Not invoked or authenticated by this routing document.**
- **Scope:** Reconcile CodeQL analysis identity on main versus the PR head, verify protected-merge Code scanning requirements without relaxing rulesets, and produce exact SHA/check evidence.
- **Acceptance artifact:** Evidence table with analysis category, tool status, head SHA, merge rule outcome and a minimal tested remediation PR only if a reproducible defect exists.
- **Prerequisites / blockers:** GitHub read access; administrator for ruleset edits.
- **Existing links:** [Issue #471](https://github.com/GLORIFIER7/GLORIFIER/issues/471) · [Issue #615](https://github.com/GLORIFIER7/GLORIFIER/issues/615) · [PR #953](https://github.com/GLORIFIER7/GLORIFIER/pull/953).

### 471-02 — SonarCloud findings + regression coverage

- **Lead candidate:** google; **review candidates:** openai, qwen. **Not invoked or authenticated by this routing document.**
- **Scope:** Enumerate real SonarCloud issue keys/severity/rules/locations, triage blockers first, write minimal regression tests for confirmed findings and measure new-code coverage.
- **Acceptance artifact:** Keyed Sonar issue inventory and focused test-backed remediation; report unavailable dashboard access as BLOCKED.
- **Prerequisites / blockers:** Authorized SonarCloud issue export for complete triage.
- **Existing links:** [Issue #471](https://github.com/GLORIFIER7/GLORIFIER/issues/471) · [Issue #616](https://github.com/GLORIFIER7/GLORIFIER/issues/616) · [PR #949](https://github.com/GLORIFIER7/GLORIFIER/pull/949).

### 471-03 — MCP JSON-RPC + independent conformance

- **Lead candidate:** google; **review candidates:** openai, anthropic. **Not invoked or authenticated by this routing document.**
- **Scope:** Review JSON-RPC error-envelope and metadata corrections; execute bounded protocol-negative tests and independently authenticated conformance only when staging is approved.
- **Acceptance artifact:** Exact versioned protocol transcript, tests, and distinction between mock, CI and authenticated external MCP evidence.
- **Prerequisites / blockers:** Authorized authenticated staging MCP endpoint.
- **Existing links:** [Issue #471](https://github.com/GLORIFIER7/GLORIFIER/issues/471) · [PR #941](https://github.com/GLORIFIER7/GLORIFIER/pull/941).

### 471-04 — A2A agent-card + task lifecycle

- **Lead candidate:** openai; **review candidates:** anthropic, google. **Not invoked or authenticated by this routing document.**
- **Scope:** Review Agent Card preflight and locked-runner changes; verify schema, bounded bodies, invalid token, task lifecycle and replay with isolated test fixtures.
- **Acceptance artifact:** Deterministic A2A test report; separate verified staging results from source-only validations.
- **Prerequisites / blockers:** Authorized A2A staging service and test credentials.
- **Existing links:** [Issue #471](https://github.com/GLORIFIER7/GLORIFIER/issues/471) · [PR #951](https://github.com/GLORIFIER7/GLORIFIER/pull/951) · [PR #950](https://github.com/GLORIFIER7/GLORIFIER/pull/950).

### 471-05 — Linux host lifecycle + least privilege

- **Lead candidate:** nvidia; **review candidates:** meta-local, anthropic. **Not invoked or authenticated by this routing document.**
- **Scope:** Evaluate claim/lease deadline, receipts, revocation, termination, distro/container test matrix and least privilege. No host enrollment or command execution without authorization.
- **Acceptance artifact:** Reproducible Linux/container regression suite plus separately authorized real-host evidence.
- **Prerequisites / blockers:** Authorized Linux test host for live lifecycle checks.
- **Existing links:** [Issue #471](https://github.com/GLORIFIER7/GLORIFIER/issues/471) · [PR #952](https://github.com/GLORIFIER7/GLORIFIER/pull/952).

### 471-06 — Read-only GLR / EVM / BNB / Solana truth

- **Lead candidate:** google; **review candidates:** nvidia, anthropic. **Not invoked or authenticated by this routing document.**
- **Scope:** Validate source-to-registry contract identifiers and read-only chain/RPC evidence per network. Flag missing RPC reachability and payment proof rather than implying settlement.
- **Acceptance artifact:** Per-chain registry status and test vectors; no signing, mint, transfer, smart-contract write or paid RPC.
- **Prerequisites / blockers:** Free read-only RPC access for independent live probes.
- **Existing links:** [Issue #471](https://github.com/GLORIFIER7/GLORIFIER/issues/471) · [PR #947](https://github.com/GLORIFIER7/GLORIFIER/pull/947).

### 471-07 — Cloudflare Worker, identity, Neural readiness, Neon/Supabase parity

- **Lead candidate:** openai; **review candidates:** google, anthropic. **Not invoked or authenticated by this routing document.**
- **Scope:** Compare public status to verified Worker health, identity readiness and exact database/data ownership evidence. Prepare read-only parity and rollback plans without changing production.
- **Acceptance artifact:** Environment-specific evidence matrix and plan separating non-observable components from verified paths.
- **Prerequisites / blockers:** Owner-confirmed domain values and approved staging secrets only for later live steps.
- **Existing links:** [Issue #471](https://github.com/GLORIFIER7/GLORIFIER/issues/471) · [Issue #432](https://github.com/GLORIFIER7/GLORIFIER/issues/432).

### 471-08 — GEAS / AI CEO / Specialist Council authorization

- **Lead candidate:** anthropic; **review candidates:** openai, google. **Not invoked or authenticated by this routing document.**
- **Scope:** Review deterministic specialist routing, mission provenance, GEAS authorization, bounded graph execution, and human control. Avoid conflating planned architecture with live provider inference.
- **Acceptance artifact:** Governance contract and focused tests for denial-by-default routing and evidence attribution.
- **Prerequisites / blockers:** No external model call until attested and owner-approved.
- **Existing links:** [Issue #471](https://github.com/GLORIFIER7/GLORIFIER/issues/471) · [PR #942](https://github.com/GLORIFIER7/GLORIFIER/pull/942) · [PR #944](https://github.com/GLORIFIER7/GLORIFIER/pull/944) · [PR #940](https://github.com/GLORIFIER7/GLORIFIER/pull/940).

### 471-09 — Zero-inference backlog triage + independent review

- **Lead candidate:** meta-local; **review candidates:** deepseek, mistral, xai, openrouter, huggingface, groq, ollama. **Not invoked or authenticated by this routing document.**
- **Scope:** Validate deterministic issue/PR snapshot, deduplicate work and produce bounded review packets. Alternative models may review public text only if each is independently authorized.
- **Acceptance artifact:** Diff-free issue/PR routing report with status NOT_DISPATCHED until real invocation receipt exists.
- **Prerequisites / blockers:** Existing local free runtime, or exact owner-attested no-cost provider and approved mission.
- **Existing links:** [Issue #471](https://github.com/GLORIFIER7/GLORIFIER/issues/471) · [Issue #615](https://github.com/GLORIFIER7/GLORIFIER/issues/615) · [Issue #616](https://github.com/GLORIFIER7/GLORIFIER/issues/616) · [Issue #432](https://github.com/GLORIFIER7/GLORIFIER/issues/432) · [PR #954](https://github.com/GLORIFIER7/GLORIFIER/pull/954) · [PR #946](https://github.com/GLORIFIER7/GLORIFIER/pull/946).


## Dispatch protocol — fail closed

1. **Collect evidence first:** fetch current issue content, relevant PR latest head SHA, CI check runs and implementation paths. Do not assume a passed action means protected-merge CodeQL clearance or live external conformance.
2. **Eligibility:** check the exact provider and model, current no-cost entitlement/credit, disabled invoicing/top-up/fallback, quota reserve, server-side credential availability, exact public-content mission approval and GEAS authorization against [REPOSITORY-AI-CONTRIBUTOR-FREE-TIER.md](./REPOSITORY-AI-CONTRIBUTOR-FREE-TIER.md). A ChatGPT or Claude subscription alone is not API credit.
3. **Dispatch:** only the authenticated GLORIFIER mission runtime may turn a packet into a model call, after recording a mission ID, target, model, authorization evidence, source scope and bounded context. This document deliberately does not issue provider API calls or bypass workflow restrictions. If no eligible free provider exists, status remains **BLOCKED / NOT DISPATCHED**, not success.
4. **Isolation:** one code-changing packet per feature branch / worktree; no overlapping edits to the same files without explicit dependency ordering. Providers never receive GitHub write tokens. Use the single owner-scoped GitHub App for proposed branches and **draft** PRs after trusted validation; coordinate via AI CEO / GEAS.
5. **Verification:** focused regression tests, lint/build where applicable, current per-PR head checks, security scan, independent peer review, and external read-only conformance when authorized. Record timestamps, target environment, exact commit and links.
6. **Authority:** never auto-merge, bypass main protections, deploy, write secrets, enroll a host, migrate databases, sign blockchain operations, or incur provider charges. #615 settings work and production/staging changes retain owner/admin approval.
7. **Reconcile:** publish links to evidence and PRs back to the parent issue only through an authorized operator. No issue closes until its written acceptance criteria are proven.

## Important existing limitations

- [PR #954](https://github.com/GLORIFIER7/GLORIFIER/pull/954) prepares **read-only zero-inference intake**, not AI execution.
- [PR #946](https://github.com/GLORIFIER7/GLORIFIER/pull/946) prepares **shared local agent instructions**, not proof that remote accounts are authenticated.
- [PR #942](https://github.com/GLORIFIER7/GLORIFIER/pull/942) proposes **Claude architecture-role selection when eligible**, not evidence of a successful Claude request.
- The existing [AI Coding Fleet workflow](https://github.com/GLORIFIER7/GLORIFIER/blob/main/.github/workflows/ai-coding-fleet.yml) is **Codex-focused and gated**: scheduled paid inference is disabled and manual provider use requires explicit authorization. Do not trigger it merely because a packet appears here.
- The [Cloudflare Autopilot migration](./AUTOPILOT-CLOUDFLARE-MIGRATION.md) documents a bounded read-only path, **not** multi-provider mission execution.
- Candidate providers outside the principal leads (Grok, Qwen, DeepSeek, Mistral, OpenRouter, Hugging Face, Groq, local Llama/Ollama) are **optional independent reviewers when eligible**, not guaranteed concurrent workers.

**Result of this PR:** A traceable task allocation specification for #471. **No models dispatched; no existing PR merged or modified; no permissions, credentials, deployments or costs changed.**
