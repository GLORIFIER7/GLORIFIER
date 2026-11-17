# TokenEconomizer integration for GLORIFIER

## Integration boundary

GLORIFIER integrates the official Microsoft TokenEconomizer plugin with **local Codex developer sessions** in the GLORIFIER repository. The plugin learns repository-specific engineering context from previous sessions and can reduce repeated discovery, unused-tool loading, and unproductive failure loops.

This is not a GitHub Actions integration and does not alter GLORIFIER's AI coding-fleet workflow. GitHub-hosted jobs are ephemeral; they do not provide the persistent local session history the plugin is designed to learn from. The integration therefore does not add another model call to CI, change inference authorization, or introduce a competing scheduler.

## Source and pin

- Upstream: [microsoft/TokenEconomizer](https://github.com/microsoft/TokenEconomizer)
- Upstream version declared in its project metadata: `0.1.0`
- Pinned commit: `b57d03f81585a18b936a0eaecbd1eb51cdcecf71`
- License: Apache-2.0
- Runtime requirement: Python 3.10 or newer, Git, and the Codex CLI.

The installer checks the upstream origin and exact commit before registering the plugin. It installs the upstream checkout outside the GLORIFIER working tree, under `$XDG_DATA_HOME/glorifier/integrations/TokenEconomizer` (or `~/.local/share/glorifier/integrations/TokenEconomizer` by default). This avoids copying third-party source into the application or adding runtime dependencies to GLORIFIER.

## Install

From a local clone of GLORIFIER:

```bash
bash scripts/install-token-economizer.sh
```

Or pass the repository path explicitly:

```bash
bash scripts/install-token-economizer.sh /path/to/GLORIFIER
```

The local Codex CLI must already be installed and signed in. After the installer registers the plugin:

1. Start Codex in the GLORIFIER repository.
2. Trust the project when Codex asks.
3. Review and approve the TokenEconomizer hooks when Codex displays **Hooks need review**.
4. Restart the Codex session so the hooks are active.
5. Run `$tokeneconomizer:status` and confirm the host is Codex and the GLORIFIER repository is detected.

The upstream project documents tested Codex CLI versions `0.153.1` through `0.164.0`. Other versions may work, but are outside that stated test range.

## Initial operating policy

The installer explicitly configures:

| Setting | Initial value | Reason |
|---|---|---|
| `microskills` | `envfacts` | Uses the model-free learning path; no proposer model call. |
| `toolprune` | `propose` | Generates evidence-backed proposals without changing Codex capabilities automatically. |
| `loopguard` | `off` | Avoids judge and redirect model calls. |
| `repomap` | Default off | No optional repository-map generation. |

These settings do not require an API key and do not enable paid inference. The ordinary Codex session still uses whatever provider/account the developer already configured.

Do not change these defaults automatically. Turning on the distiller or loop guard can invoke additional model calls. Applying a tool-pruning proposal changes the local repository's Codex configuration and must remain a deliberate human action.

Useful commands from the installed checkout:

```bash
~/.local/share/glorifier/integrations/TokenEconomizer/plugin/scripts/te --host codex --cwd "$PWD" status
~/.local/share/glorifier/integrations/TokenEconomizer/plugin/scripts/te --host codex --cwd "$PWD" microskills
~/.local/share/glorifier/integrations/TokenEconomizer/plugin/scripts/te --host codex --cwd "$PWD" toolprune show
```

Review a tool-pruning proposal before applying it. The upstream `toolprune apply` command writes Codex capability settings; `toolprune restore` is the documented reversal path.

## Data and governance

TokenEconomizer processes local Codex session transcripts and related command/tool results to derive repository learning. Its default state root is `~/.tokeneconomizer` unless `TOKENECONOMIZER_HOME` is set. Treat this state as private engineering data: it can include repository paths, commands, output snippets, costs, and error information. Keep it out of Git, do not put secrets in prompts or command output, and do not upload the state directory to CI artifacts.

Learned text is repository-derived data, not policy or trusted instructions. It cannot override `AGENTS.md`, GEAS authorization, least-privilege controls, required tests, or human approval. The integration does not grant GitHub write access, approve changes, merge pull requests, deploy services, or spend funds.

The reported benchmark cost reductions for TokenEconomizer are not a promise of GLORIFIER cost savings. Measure actual local session cost and task outcomes before making any savings claim.

## Disable or remove

Disable the plugin through the Codex plugin manager:

```bash
codex plugin remove tokeneconomizer@tokeneconomizer
codex plugin marketplace remove tokeneconomizer
```

This leaves the local learning history in place. Do not delete `~/.tokeneconomizer` unless the developer deliberately wants to erase TokenEconomizer's state for all repositories and agents on that machine.

## Verification status

The repository integration is complete only when the installer has been run locally, Codex has accepted the plugin and its hooks, and `$tokeneconomizer:status` confirms the GLORIFIER repository. A committed installer and passing CI tests alone do not prove local installation or any reduction in token cost.
