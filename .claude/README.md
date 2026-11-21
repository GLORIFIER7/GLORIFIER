# Claude Code project integration

This directory provides a repository-native Claude Code layer without replacing GLORIFIER's provider-neutral runtime.

- `AGENTS.md` is the shared project contract for all coding agents.
- `.claude/agents/` defines specialist subagents for architecture, security, QA, bounded implementation and pull-request review.
- `.claude/skills/` supplies reusable workflows that can be invoked by name or selected by Claude when relevant.
- `.claude/settings.json` installs project-local permissions and PreToolUse guard hooks for Bash and all supported file-edit tool variants.
- `.claude/hooks/agent-policy.mjs` blocks protected file edits, direct reads of sensitive files, force-push, git reset/clean, PR merge, recognized secret mutations, deployment and publishing. Unrestricted Grep is not given to the security reviewer. Its regression suite runs with `node --test .claude/hooks/agent-policy.test.mjs`.

The hooks are supplemental guardrails, not a complete sandbox or a substitute for GitHub branch protection, GEAS, capability authorization, review requirements or operator supervision. Shell indirection can make command intent difficult to infer, so protected-path shell writes and other high-impact commands still require human review.

Claude Code must be authenticated separately on each developer machine. API/model usage and hosted CI inference may incur separate costs; this repository configuration grants no subscription, API credit, secret, quota or paid-inference authorization. No Anthropic request is made by the hook or its tests.
