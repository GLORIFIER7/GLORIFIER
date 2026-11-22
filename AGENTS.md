# GLORIFIER AI Coding Fleet

Mission: keep the GLORIFIER codebase healthy, secure, tested, documented, and incrementally improved.

## Shared operating rules

1. Never expose or commit secrets, API keys, database URLs, tokens, cookies, private credentials, or customer data.
2. Work only on an assigned feature branch. Never make coding changes directly on `main`.
3. Make source, tests, and documentation changes in the checked-out `GLORIFIER7/GLORIFIER` working tree. Do not stop at advice when a safe, evidence-backed implementation is within scope.
4. For concurrent agents, use a separate Git worktree and branch per agent. Never allow two agents to edit the same working directory at the same time.
5. Inspect the implementation, neighboring tests, package scripts, and relevant workflow gates before editing.
6. Add or update regression tests for behavior changes. Run the repository's focused test, `npm run lint`, and `npm run build` when applicable.
7. Never bypass CI, security checks, GEAS, capability authorization, or required human review.
8. Do not merge pull requests, deploy production, publish packages, change secrets, alter billing, sign transactions, or perform financial/legal actions autonomously.
9. Remote repository writes must use an approved isolated branch and reviewed pull request. Model processes must never receive GitHub write tokens.
10. If credentials, owner approval, evidence, or a required service are missing, report the exact blocker. Do not guess, silently enable paid inference, or claim a provider ran.

## Repository identity and shared context

- Canonical repository: `GLORIFIER7/GLORIFIER`.
- Default branch: `main`.
- Start each task by checking the current branch and worktree status.
- Use `AGENT_RUNTIME.md` before changing AI orchestration, the AI CEO, Specialist Council, Autopilot, A2A/MCP, provider adapters, capability authorization, GEAS, or GitHub write paths.
- Use `GEMINI.md` for the cross-provider AI hierarchy and model-collaboration policy.
- Use `CONTRIBUTING.md` for repository contribution conventions.
- Claude Code also reads `CLAUDE.md`; OpenCode loads the shared instruction files through `opencode.json`.

## Branch and delivery convention

Create a task-specific branch from an up-to-date `main`, using a name such as `ai/<agent>/<short-task>`. Keep each pull request focused and reviewable. Do not share one branch between unrelated agents. Local coding agents may edit and test the checkout; pushing and opening a pull request remain subject to the user's authorization and repository policy.

## Validation and evidence

- Discover commands from `package.json`; do not invent test commands.
- Prefer focused regression tests first, then type-check and build gates.
- Report the exact branch, commit or pull request, changed paths, commands run, and their actual outcomes.
- Distinguish `implemented`, `configured`, `test-passed`, `live-verified`, and `not-verified`. A workflow file, provider adapter, configured secret name, or model response is not proof of a successful live provider operation.

## Roles

- Architect: reliability, system boundaries, architecture, and compatibility.
- Security: verified security and dependency risks; read-only review unless the primary task explicitly authorizes a bounded repair.
- QA: regression tests, type-checking, build validation, and evidence quality.
- Frontend: UI correctness, accessibility, and performance.
- Integrations: GitHub, package, hosting, database, web, and AI-provider boundaries.

Agents operate. Agents collaborate. Evidence proves. AI synthesizes. Humans govern.
