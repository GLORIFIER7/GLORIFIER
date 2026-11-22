# Anthropic upstream inventory and selective adoption

**Assessment:** 2026-11-21. **Status:** Catalog and discovery utility proposed for review; no upstream source imported, no new Anthropic inference enabled, and no runtime capability declared verified.

## Evidence and scope

- `anthropic-upstream-catalog-2026-11-21.json` contains **118 distinct repository names** returned by a paginated GitHub search of `org:anthropics` (100 + 18; third page empty), including 16 marked archived. This is an observation of publicly discoverable repositories, not a guarantee of future completeness or a supply-chain audit.
- `node scripts/anthropic-upstream-inventory.mjs > /tmp/anthropic-current.json` performs *read-only*, live paginated discovery using GitHub's public REST API. It emits metadata, not checked-out code. No new dependencies or provider keys are required; an optional `GITHUB_TOKEN` can be provided to increase GitHub API limits. The collector fails rather than silently accepting an incomplete response.
- `node --test scripts/anthropic-upstream-inventory.test.mjs` tests sorting/deduplication, pagination, provenance validation, unknown licenses, quota/error failures, and token handling.
- **Do not treat the two inventory methods as identical:** the dated catalog records the observed repository search; the script uses the official organization REST listing and may return different results over time.

## Existing GLORIFIER integrations: do not duplicate

- `src/lib/ai/providers/anthropic.ts`, `src/lib/ai/registry.ts`, and `services/neural/app/providers/anthropic.py`: existing provider adapters and runtime integration points; configuration is not evidence of a successful external inference.
- `.github/workflows/claude-development.yml` and `scripts/run-claude-workflow.mjs`: existing owner-triggered Claude CLI, patch artifact and isolated PR publisher. The workflow requires `ANTHROPIC_API_KEY` and must not be treated as cost-free or connected merely because it exists.
- Open PR [#942](https://github.com/GLORIFIER7/GLORIFIER/pull/942) already proposes a Claude architecture council specialist; open PR [#945](https://github.com/GLORIFIER7/GLORIFIER/pull/945) addresses free-tier workflow behavior. Review these before creating overlapping changes.

## Refinement queue

| Anthropic repository | License evidence at inspected main branch | GLORIFIER destination | Decision |
| --- | --- | --- | --- |
| [anthropic-sdk-typescript](https://github.com/anthropics/anthropic-sdk-typescript) | Apache-2.0 in `LICENSE` | Existing TypeScript provider adapter | **Evaluate later** as a maintained client dependency only if it reduces measured maintenance/security risk. Preserve permission and budget checks. |
| [claude-agent-sdk-python](https://github.com/anthropics/claude-agent-sdk-python) | MIT in `LICENSE` | `services/neural/` in a scoped adapter | **Evaluate later**. Separate sandbox/tool authorization from inference; no broad filesystem or network grants. |
| [claude-code-action](https://github.com/anthropics/claude-code-action) | MIT in `LICENSE` | GitHub Actions / Claude development | **Reference only for now**. Do not replace the deliberately pinned CLI runner without reproducing/fixing the existing Action-path failure. |
| [claude-code-security-review](https://github.com/anthropics/claude-code-security-review) | MIT in `LICENSE` | Security review pipeline | **Evaluate later**, read-only first, report evidence as findings rather than merging fixes. |
| [claude-cookbooks](https://github.com/anthropics/claude-cookbooks) | MIT in `LICENSE` | Eval and provider smoke tests | **Adapt patterns, not examples wholesale**. Add focused, deterministic tests to existing tests. |
| [sandbox-runtime](https://github.com/anthropics/sandbox-runtime) | Apache-2.0 in `LICENSE` | GEAS least-privilege sandbox | **Architecture evaluation only** until containment, platform support, and threat model are independently tested. |
| [claude-quickstarts](https://github.com/anthropics/claude-quickstarts) | MIT in `LICENSE` | Developer guides | **Reference only**; no extra production application. |
| [skills](https://github.com/anthropics/skills) | Item-specific licenses (example: `skills/pdf/LICENSE.txt` has separate terms) | Specialist Council skills | **Manual per-item review**. Do not assume a repository-wide permission to copy skill content. |
| [evals](https://github.com/anthropics/evals) | CC-BY-4.0 in `LICENSE` | GEAS evaluation methodology | **Review separately** before using data or materials; ensure attribution and applicable rights. |
| [claude-agent-sdk-typescript](https://github.com/anthropics/claude-agent-sdk-typescript) | `LICENSE.md` invokes Anthropic Commercial Terms | Autonomous engineering agents | **Do not vendor**; evaluate vendor terms and runtime authorization before any dependency decision. |
| [claude-code](https://github.com/anthropics/claude-code) | `LICENSE.md` invokes Anthropic Commercial Terms | Existing Claude CLI workflow | **Do not vendor or claim open-source reuse rights**; using the supported CLI is separate from copying its distribution. |

The remaining repositories in the catalog are **not reviewed or approved**. Archival status and GitHub's license metadata alone do not grant permission or establish fitness for production.

## Required gates for every future adoption

1. Record an immutable upstream commit or package version, per-file licensing and notices, maintainer status, dependencies, and a threat model. Record provenance in a new scoped PR.
2. Compare the capability with GLORIFIER's existing implementation; avoid redundant schedulers, agent governors, billing systems, plugins or control planes. Preserve provider neutrality.
3. Add a failing test for the missing behavior, then implement and re-run focused tests and the relevant CI/GEAS security checks. A published example or local unit test is not production verification.
4. Use the existing AI CEO / Specialist Council for planning and GEAS for authorization. Make all external data untrusted; deny ambient tools, secrets, spending, and arbitrary execution by default.
5. No automatic merges or deployments. Protect paid inference behind explicit authorization and a verified budget. Each addition needs a bounded task and independent PR approval.

**This inventory does not integrate or install 118 external codebases.** It establishes an inspectable, refreshable source list and a safe selection process for actual future implementation.
