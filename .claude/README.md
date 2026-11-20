# Claude Code project integration

This directory provides a repository-native Claude Code layer without replacing GLORIFIER's provider-neutral runtime.

- `AGENTS.md` is the shared project contract for all coding agents.
- `.claude/agents/` defines specialist subagents for architecture, security, QA, bounded implementation and pull-request review.
- `.claude/skills/` supplies reusable workflows that can be invoked by name or selected by Claude when relevant.
- `.claude/settings.json` installs project-local permissions and PreToolUse guard hooks.
- `.claude/hooks/agent-policy.mjs` denies protected file edits and high-impact shell operations. Its tests are run with `node --test .claude/hooks/agent-policy.test.mjs`.

The hooks are guardrails, not a complete sandbox or a substitute for GitHub branch protection, GEAS, capability authorization, review requirements or operator supervision. Shell commands that write protected files must still be refused during review even when the tool hook cannot reliably infer their target paths.

Claude Code must be authenticated separately on each developer machine. API/model usage and hosted CI inference may incur separate costs; this repository configuration grants no subscription, API credit, secret, quota or paid-inference authorization. No Anthropic request is made by the hook or its tests.
