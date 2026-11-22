---
name: repository-audit
description: Audit repository health, architecture, security, CI, provider configuration and evidence without changing production state.
---

# Repository audit

1. Read `AGENTS.md`, `AGENT_RUNTIME.md`, `GEMINI.md`, `SECURITY.md`, and relevant architecture documents.
2. Record the branch, commit, working-tree state, scope and observation time.
3. Inventory open pull requests, relevant workflow runs, recent failures, required checks and protected branch policy.
4. Trace code paths rather than inferring behavior from names, comments or workflow declarations.
5. Run only safe, read-only checks. Do not invoke paid inference, external prompt egress, deployments, migrations, secret access or financial actions.
6. Report each finding with severity, exact evidence, impact, recommended repair and verification needed.
7. Use `NOT VERIFIED` where direct evidence is absent. Never fabricate revenue, provider execution, production health or interoperability.
