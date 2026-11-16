# GitHub Agentic Workflows (gh-aw): GLORIFIER adoption assessment

**Decision:** Adopt selected design patterns as repository policy; defer installing or activating the gh-aw runtime.  
**Assessed:** 2026-11-17 (Asia/Vientiane)  
**GLORIFIER baseline:** `main` at `eb82672ee5fa44cb863178a8670efd3dcf02c431`  
**Upstream reviewed:** [github/gh-aw](https://github.com/github/gh-aw), release [v1.2.2](https://github.com/github/gh-aw/releases/tag/v1.2.2), immutable tag commit `399a445fe2d8926c616b54b1b82a16b5b2be4445`. The upstream `main` ref at review was `3e58ff9a8b82ea2e52498861bf31782e1d3952ae`.

## Executive decision

Use gh-aw as a **complementary agent-workflow specification and control pattern**, not as a replacement for GLORIFIER's AI CEO, GEAS, Autopilot, provider registry, or existing GitHub Actions.

The most useful ideas are:

1. Markdown workflow specifications with YAML frontmatter for triggers, permissions, tools, and bounded agent instructions.
2. Compilation into generated, reviewable GitHub Actions lock workflows rather than hand-maintained generated YAML.
3. Read-only agent jobs by default, with any permitted writes separated into narrowly scoped and validated jobs.
4. Sandboxed execution, minimal network allowlists, strict workflow validation, explicit no-op behavior, and bounded output counts.
5. Cost visibility that treats runner minutes and model inference as separate expenses.

**Runtime activation is deliberately deferred.** No gh-aw CLI extension, model engine, API credential, new workflow trigger, generated lock file, secret, provider call, or paid inference path is introduced by this change. The repository policy overlay added alongside this assessment is dormant until gh-aw is installed and a workflow is compiled.

## Why selective adoption is the right fit

GLORIFIER already has relevant infrastructure on the reviewed baseline:

| Existing GLORIFIER control | Evidence in repository | gh-aw relationship |
|---|---|---|
| Governed AI maintenance | `.github/workflows/ai-coding-fleet.yml` | Retain the existing authorized coding-fleet path; do not create a competing scheduler. |
| NVIDIA-assisted repair | `.github/workflows/nvidia-assisted-maintenance-pr.yml` | Preserve owner-only explicit paid-inference authorization and patch validation. |
| Workflow syntax checks | `.github/workflows/workflow-syntax-validation.yml` | Extend validation to generated lock workflows only if gh-aw is later enabled. |
| GEAS controls | `.github/workflows/geas-enterprise-controls.yml` and `src/lib/governance/` | GEAS remains the policy and authorization authority; an agent workflow cannot grant itself authority. |
| Official repository writer | GLORIFIER GitHub App writer path and its existing authorization tests | Keep the single owner-controlled App as the approved repository-writing identity. |
| Evidence-first claims | Repository README and governance contracts | Report VERIFIED only from observed evidence; otherwise use UNKNOWN / NOT VERIFIED. |

The overlap is substantial. Importing a second autonomous coding fleet now would duplicate scheduling, provider routing, authorization, patch verification, and reporting. A narrowly controlled gh-aw layer may be useful later for tasks that genuinely benefit from natural-language reasoning, such as read-only CI failure investigation, repository posture summaries, or issue classification.

## Patterns to adopt

### 1. Declarative source and compiler-generated workflow

When a future pilot is approved, store its source as a Markdown file under `.github/workflows/`, with explicit YAML frontmatter and a bounded task prompt. Compile it using the pinned gh-aw CLI. Commit the generated `.lock.yml` together with its source; never hand-edit the generated lock file. The compile step and generated-file integrity check must run in CI.

### 2. Read-only agent boundary

The agent job should have only the read permissions needed for its task, such as `contents: read`, `actions: read`, `issues: read`, and/or `pull-requests: read`. It must not receive a personal access token, GitHub App private key, installation token, signing key, deployment credential, or broad write permission.

If any later workflow needs to publish a result, separate the proposal from the write. The write must pass GEAS policy, the existing GLORIFIER authorization path, operation-specific validation, and audit logging. Do not give a gh-aw agent direct repository-write authority.

### 3. No implicit safe outputs

The gh-aw reference documents that issue creation can be enabled by default when a workflow omits a `safe-outputs` section. A read-only GLORIFIER pilot must therefore explicitly disable issue creation (for example, `safe-outputs: create-issue: false`) and must not configure PR creation, labels, comments, merges, releases, deployment, or other writes.

Any later exception needs a separate reviewed change with a narrow output type, explicit limits, and GEAS approval. Automatic PR merging is prohibited.

### 4. Sandbox and network controls

Keep the supported agent sandbox enabled. Set `strict: true`. Grant only the tools necessary for the task; do not copy broad `bash: ["*"]` examples into GLORIFIER by default. Deny network access unless a task has a documented need, then allow only exact required hosts. Treat issue text, PR descriptions, comments, logs, and retrieved web content as untrusted data, never as instructions that override this policy.

### 5. Deterministic checks before agent reasoning

Keep builds, tests, type checks, linting, dependency scans, release gates, and reconciliation in ordinary deterministic Actions workflows. Use an agent only after deterministic evidence establishes that interpretation is needed. An agent's conclusion is advisory and cannot replace a failing required check.

### 6. Cost and quota controls

gh-aw documents two independent cost components: GitHub Actions runner minutes and model inference. Its AI Credits reporting is a best-effort estimate, not the provider's authoritative invoice. A green workflow or a configured credit counter does not establish zero cost.

Before any runtime activation:
- Verify the selected engine's account-specific billing path and free quota.
- Preserve GLORIFIER's owner-attested free-provider policy and durable per-provider request/token limits.
- Do not add `copilot-requests: write`, paid provider credentials, automatic top-ups, or external data egress without separate explicit owner authorization.
- Add finite run time, concurrency, trigger frequency, and output limits.
- Confirm GitHub Actions minutes are within the owner's zero-budget constraint.

No AI inference is authorized by this assessment.

## Explicitly excluded

- Replacing GEAS, Autopilot, the Specialist Council, provider registry, or existing AI coding fleet.
- Wholesale copying or vendoring of gh-aw source code, runtime actions, lock files, example workflows, or its large workflow catalog.
- Automatically enabling schedules, issue/comment triggers, or pull-request event handlers.
- Giving agents `contents: write`, direct commits, branch-protection bypass, merge permission, or unrestricted shell/network access.
- Using gh-aw safe outputs to merge PRs, deploy production, publish packages, rotate credentials, mutate databases, move assets, sign wallets, or perform financial actions.
- Sending private source, logs, prompts, secrets, or customer data to an external model without explicit authorization.
- Claiming that gh-aw, model inference, or Actions execution is free merely because the extension is open source.

## Activation gate

A separate implementation review is required before runtime activation. It must:

1. Confirm the exact pinned gh-aw release and review its release notes, advisories, integrity metadata, and generated workflow.
2. Start with one manual, read-only, no-write pilot in the main GLORIFIER repository.
3. Compile with gh-aw itself and inspect the complete generated `.lock.yml`; never synthesize the generated workflow by hand.
4. Validate the source and lock workflow with gh-aw's compiler/audit tools, Actionlint, and repository security-contract tests.
5. Prove that no write output, paid inference, unapproved egress, or production action is possible on the pilot path.
6. Verify run cost and provider quota from authoritative account-side evidence before any recurring trigger is considered.
7. Extend to the separately maintained `GLORIFIER7/GLORIFIER-NEURAL` repository only after its own permissions, rules, and required checks are reviewed.

## Upstream release and security note

The upstream README reviewed for this assessment reports a retired vulnerable release range of `>=0.83.3, <0.85.4`. The assessed release is v1.2.2, pinned above by its immutable tag commit. Re-check upstream advisories before installing or upgrading; this note is not a substitute for that check.

## Verification boundary

This assessment is a source review of the upstream repository and the GLORIFIER `main` baseline listed above. It is not evidence that gh-aw is installed, compiled, configured, executed, or deployed in GLORIFIER. It does not verify account billing, Copilot entitlement, provider free quota, or Actions minute availability.

## References

- [GitHub Agentic Workflows source repository](https://github.com/github/gh-aw)
- [v1.2.2 release](https://github.com/github/gh-aw/releases/tag/v1.2.2)
- [How agentic workflows work](https://github.github.com/gh-aw/introduction/how-they-work/)
- [Security architecture](https://github.github.com/gh-aw/introduction/architecture/)
- [Permissions](https://github.github.com/gh-aw/reference/permissions/)
- [Safe outputs](https://github.github.com/gh-aw/reference/safe-outputs/)
- [Billing](https://github.github.com/gh-aw/reference/billing/)
- [Cost management](https://github.github.com/gh-aw/reference/cost-management/)
- [Upstream security advisory GHSA-8h78-hpm7-29gg](https://github.com/github/gh-aw/security/advisories/GHSA-8h78-hpm7-29gg)
