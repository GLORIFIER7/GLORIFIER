# GEAS upstream ecosystem discovery and selective integration

**Observed:** 2026-11-21. **Scope:** An extensible source registry and a **read-only** repository discovery tool. **Status:** Proposed implementation in a review branch; NOT VERIFIED in GLORIFIER production.

## Outcome and limitations

The committed registry identifies **17 GitHub organizations** spanning OpenAI, NVIDIA, Google/Gemini, Microsoft/GitHub Copilot, Meta Llama/Meta Research, Anthropic, Hugging Face, MCP, A2A, LangChain, vLLM and Ollama, with **35 curated review-only candidates**.

This is **not** an inventory of every public repository on the internet. Public repositories can be created, deleted, moved, archived, made private, or restricted at any time. GitHub is not the entire internet, and official organizations are not automatically exhaustive of a vendor's projects. No attempt was made to scrape private or restricted content, download model weights, mirror source, or bypass rate limits.

**Core design:** discover → normalize provenance → evaluate applicability → verify licenses/dependencies → test a scoped adaptation → GEAS authorization → human-approved pull request. Discovery alone never grants permission to import or execute.

## Command-line interface

Requires Node.js 24.12.0 or later, consistent with GLORIFIER's root `package.json`. The script uses no additional npm packages.

```bash
# Offline: list exactly the configured upstream sources and curated review candidates
node scripts/geas-upstream-discovery.mjs --list

# Online, read only: fetch every available public page for one approved GitHub org
node scripts/geas-upstream-discovery.mjs --org openai > /tmp/geas-openai-inventory.json

# Online, read only: fetch every page for all 17 orgs (can require many requests)
node scripts/geas-upstream-discovery.mjs --all > /tmp/geas-upstream-inventory.json

# Focused offline tests
node --test scripts/geas-upstream-discovery.test.mjs
```

GitHub public REST access may be rate-limited. An optional `GITHUB_TOKEN` can increase applicable rate limits but does **not** authorize source import, GitHub writes, model inference, subscriptions or bypasses. The tool targets only `api.github.com`, validates the repository owner and canonical URL, pages conservatively, and **fails without producing a purportedly complete output** if GitHub returns an error or the 100-page/100-items-per-page cap is hit for any configured organization. The `--all` operation stops on the first incomplete organization instead of silently certifying a partial catalog. Outputs are JSON to stdout; no automatic commit, install, merge, execution, or deployment.

**Privacy/security:** GitHub responses are untrusted; repository descriptions and URLs must never be executed as instructions, shell commands, package names, or workflow steps. Do not commit access tokens, private records, downloaded sources, or private API responses.

## Candidate refinement and GLORIFIER destinations

| Upstream group and priority | Refined GLORIFIER use | Strict boundary |
| --- | --- | --- |
| OpenAI Codex, Agents SDK, Symphony: P1 | Agentic repairs, mission worktrees, durable progress checks, Council role delegation | Existing Autopilot/AI CEO own mission state; don't duplicate control planes or pretend ChatGPT Plus grants API spend |
| NVIDIA NeMo Agent Toolkit and Guardrails: P1; TensorRT-LLM and NemoClaw: P2 | GEAS verifiable work-per-cost, agent evaluation, policy/sandbox architecture | No GPU provisioning, third-party daemon, or billed inference without explicit authorization |
| Google Gemini CLI, Google ADK: P1; cookbook: P2 | Specialist Council and NEURAL adapters, deterministic provider regression tests | Keep model-specific credentials/quota separate; no implied Google Cloud entitlement |
| Microsoft Semantic Kernel, GitHub Copilot examples/spec-kit/MCP: P1 | Multi-agent handoffs, issue-to-PR review, GitHub tool authorization | Microsoft's `autogen` and `vscode-copilot-chat` upstream repositories were observed **archived**; use as historical references, not preferred live production dependencies |
| Meta Llama models and recipes: P1/P2 | Model provenance, policy registry and provider-neutral evaluation | Llama model licenses and use policies are separate from many code licenses; **no weights imported** |
| MCP TypeScript SDK/servers, A2A spec/SDKs: P1/P2 | Existing MCP and A2A conformance and least-privilege tools | Conformance requires external tests and identity/security evidence, not just copied sample code |
| Hugging Face, vLLM, Ollama and LangGraph: P1/P2 | Optional local inference, workflow patterns, model/runtime performance | Local inference still needs hardware/resources; never assert zero financial or compute cost from repository availability |
| Anthropic Claude Code/SDK/action: P1/P2 | Existing pinned Claude workflow and specialist review | Continue the separate Anthropic assessment in draft [PR #955](https://github.com/GLORIFIER7/GLORIFIER/pull/955); don't overwrite or duplicate that PR |

Priorities are **engineering triage judgments**, not benchmark scores or endorsements. All 35 records remain REVIEW_ONLY. Existing GLORIFIER components, such as `src/lib/ai/registry.ts`, `src/lib/autopilot-orchestrator.ts`, `services/neural/`, GEAS policy tests, and `.github/workflows/claude-development.yml`, should be assessed before introducing any overlapping framework.

## Representative first-party license spot-checks (2026-11-21)

- [OpenAI Codex](https://github.com/openai/codex/blob/main/LICENSE): Apache-2.0 license file observed.
- [OpenAI Python Agents SDK](https://github.com/openai/openai-agents-python/blob/main/LICENSE): MIT license file observed.
- [Google Gemini CLI](https://github.com/google-gemini/gemini-cli/blob/main/LICENSE): Apache-2.0 license file observed.
- [Google ADK Python](https://github.com/google/adk-python/blob/main/LICENSE): Apache-2.0 license file observed.
- [Microsoft Semantic Kernel](https://github.com/microsoft/semantic-kernel/blob/main/LICENSE): MIT license file observed.
- [NVIDIA TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM/blob/main/LICENSE): Apache-2.0 main license with additional third-party notices/files.
- [GitHub awesome-copilot](https://github.com/github/awesome-copilot/blob/main/LICENSE): MIT license file observed.
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/LICENSE): license-transition terms require **per-contribution** review.
- [A2A specification](https://github.com/a2aproject/A2A/blob/main/LICENSE): Apache-2.0 license file observed.
- [Meta Llama model catalog](https://github.com/meta-llama/llama-models): review model-specific notices, access conditions, and use policies before any weights/model redistribution.

These spot checks are **not** blanket clearance of the 17 organizations, the remaining candidates, copied documentation, linked datasets, or transitive dependencies. Source licenses do not grant API access or compute.

## Non-negotiable GEAS adoption gates

1. Record exact source repository, immutable commit/package digest, maintainer authenticity, relevant file and dataset/model licenses, and notices.
2. Compare candidates against existing GLORIFIER features; reject duplication, abandoned/archived production dependencies, unmeasured costs, and excessive privilege.
3. For behavior changes, first reproduce missing functionality with a failing test, then run focused tests, build/typecheck, security scans and relevant end-to-end conformance.
4. Keep model output and downloaded repository content untrusted. Explicitly deny network egress, shell execution, credential access and repository writes unless authorized.
5. Enforce budget = zero for paid model calls by default. No automatic provider connection, third-party plugin activation, GPU purchase, production deployment, high-impact action or automatic merge.
6. Each adoptable capability gets a separate, reviewable PR with measured outcomes and CI proof. Report local CI, external integration, production and economic verification as separate evidence states.

## Next implementation experiments (not performed in this PR)

- A2A/MCP negative authorization and conformance regression harnesses.
- GEAS benchmark using verified-task success rate, latency, token spend and retry cost under the same test corpus.
- Provider adapters or GitHub coding agents only after proven gap, approved credentials and no-cost operation.
- Optional future sources: additional **verified** GitHub organizations, upstream GitLab/GitForge metadata, official model registries and public standards—each requires its own adapter and legal/security review. Never infer that an arbitrary internet repository is authoritative.
