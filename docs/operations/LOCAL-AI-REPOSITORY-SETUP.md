# Local AI coding agents for GLORIFIER

This repository now carries a shared project setup for Codex, Claude Code, Gemini CLI, and OpenCode. Each local agent works against the same checked-out source tree and reads the repository's governance instructions. No provider is pinned in the project configuration; each tool uses the provider/model authenticated on the user's machine.

## 1. Get the repository onto the machine running the coding agent

If the repository has not been cloned:

```bash
git clone https://github.com/GLORIFIER7/GLORIFIER.git
cd GLORIFIER
```

For an existing clone:

```bash
cd GLORIFIER
git switch main
git pull --ff-only
```

Before a task, create a dedicated branch:

```bash
git switch -c ai/<agent>/<short-task>
```

Replace the placeholders with a unique agent name and task. For simultaneous agents, use one separate Git worktree and branch per agent; do not let several agents edit one working directory concurrently.

## 2. Run the local coding tools in this repository

- **Codex:** reads the root `AGENTS.md`.
- **Claude Code:** reads the root `CLAUDE.md`, which directs it to the shared repository contract.
- **Gemini CLI:** reads the existing root `GEMINI.md`.
- **OpenCode:** reads `opencode.json`, the shared instruction files, and the project agents under `.opencode/agents/`.

Start each tool from the repository directory so it operates on this checkout rather than an unrelated folder.

### Optional OpenCode Console setup for Codex

On the machine where Codex is installed, run:

```bash
npx @opencode/console setup codex --keep-provider
```

Approve the browser sign-in and workspace selection when prompted, then run `codex` from the GLORIFIER repository directory. The `--keep-provider` option keeps Codex's own provider sign-in/models while adding the selected Console workspace's supported policies, MCP servers, skills, and instructions. Omit `--keep-provider` only when you deliberately want model requests routed through the Console workspace and its model budgets.

For Claude Code, the equivalent optional connection is:

```bash
npx @opencode/console setup claude-code --keep-provider
```

These commands require an OpenCode Console workspace and a browser sign-in. They are local account setup steps; a repository commit cannot authenticate a machine or approve a workspace on the owner's behalf.

## 3. Use the project agents in OpenCode

The default OpenCode `build` agent can edit the checked-out worktree. The named subagents are available for focused review:

- `@architecture-reviewer` — read-only system and GEAS review.
- `@security-reviewer` — read-only security review.
- `@qa-verifier` — run existing tests and report verification without editing files.

The build agent can edit files and run the repository's existing lint, test, and build scripts. Remote pushes require approval; merge, deployment, package publication, secret-writing, and destructive Git commands are denied by this project configuration.

## 4. Keep provider credentials and costs outside the repository

Do not add API keys, tokens, Console keys, GitHub App private keys, or account credentials to source files, local commits, prompts, or issue comments. Authenticate each tool through its own supported local sign-in or a machine-level secret store.

A ChatGPT or Claude application subscription is not automatically an API credit grant for a GitHub Actions workflow. The repository's hosted provider workflows still require their own eligible credentials, owner authorization, and any applicable free-tier attestation. Do not enable paid inference or external repository-data egress just to make a workflow appear active.

The repository already contains separate GitHub Actions paths for AI maintenance and review. Those jobs run in isolated runners and publish through their existing reviewed branch/PR boundary. A workflow being present does not prove that its provider secret is configured or that a live model run has succeeded.

## 5. Verify and submit work

Discover commands in `package.json`. For typical TypeScript changes:

```bash
npm run lint
npm run test:<relevant-existing-script>
npm run build
```

Run the exact focused test that covers the change; do not literally run the placeholder shown above. Check `git diff --check` and review the full diff before committing. Keep the branch focused and open a pull request for human review. Do not merge or deploy autonomously.

See `AGENTS.md`, `AGENT_RUNTIME.md`, `GEMINI.md`, and `CONTRIBUTING.md` for the governing project rules.
