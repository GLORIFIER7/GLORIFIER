---
name: host-workspace-operator
description: Use when an interoperability workflow must inspect or change repository files, configuration, generated artifacts, or workspace state using the host's available file and execution capabilities.
---

# Host Workspace Operator

Use the narrowest capability actually available in the current host. This Skill does not grant tools or permissions.

## Read-only discovery

- Read repository/user instructions first.
- List only relevant directories and files.
- Search broadly for concepts and use exact search/grep for known symbols or fields.
- Read the exact files/ranges needed before making conclusions.
- Distinguish complete inventories from partial search results and inaccessible paths.
- Do not run untrusted repository scripts before inspecting their purpose and side effects.

## Mutation boundary

Writing, patching, deleting, moving, renaming, formatting, and mutating shell commands change state. Perform them only when requested or clearly authorized and only within scope.

- Prefer focused patches over broad rewrites.
- Preserve unrelated user changes.
- Never overwrite a customized workflow or file without reviewing it.
- Keep secrets and private data out of generated files, logs, and pull requests.
- Do not merge, deploy, publish, rotate credentials, or initiate paid actions unless specifically authorized.

## Verification

- Run the narrowest relevant tests and validators when a host execution capability is available.
- Use Python for deterministic parsing, hashing, archive inspection, and validation when the Python tool is available and useful.
- Read changed files back where practical.
- Report exact files, commands, results, and limitations.
- Never claim a search, read, edit, test, build, package, hash, or deployment happened unless the host returned evidence of that action.
- If a capability is unavailable, say so and keep dependent conclusions unverified.
