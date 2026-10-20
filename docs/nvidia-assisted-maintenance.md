# NVIDIA-assisted maintenance PR workflow

## Purpose
When main-branch GLORIFIER CI fails, this workflow asks the existing NVIDIA NIM/Nemotron endpoint for a minimal candidate patch. It can also be run manually against a failed CI run. A pull request is opened only if the proposal passes structural allowlist checks and deterministic gates.

## Mandatory safety boundaries
- Never merge a pull request or deploy.
- Never change secrets, provider credentials, payment flows, wallet logic, blockchain/token operations, authentication, governance, dependency manifests, GitHub workflows, or the server entrypoint automatically.
- Never provision paid GPU/Brev resources or perform financial actions.
- Treat logs, source code, and model output as untrusted. Send only bounded, filtered and redacted diagnostic lines plus limited eligible changed-file context to NVIDIA.
- Only existing files under src/, docs/, scripts/, or tests/ may be patched; a stricter denylist applies to sensitive areas. Maximum five files and 250 changed lines.
- Open a PR only after the patch applies cleanly and npm audit, lint/type-check, production build, and selected regression suites pass.
- If evidence is insufficient, no safe files are available, NVIDIA fails, or tests fail, do not open a PR.
- Redaction is best-effort and cannot prove every possible secret has been removed. Review log content and secret-handling policy before enabling this workflow with NVIDIA credentials.

## Required repository configuration
- Actions secret NVIDIA_API_KEY.
- Optional Actions secrets NVIDIA_MODEL and NVIDIA_BASE_URL; defaults are the existing Nemotron model and NVIDIA NIM OpenAI-compatible endpoint.
- GitHub Actions must permit GITHUB_TOKEN to create branches and pull requests. If repository settings prohibit that, the workflow should fail without merging or deploying.

## Evidence status
A created PR means only that a candidate patch passed the named deterministic gates on the workflow runner. It does not verify production frontend/backend/database health, live AI completion, payments, revenue, or 24/7 uptime. Human review and normal PR checks remain required.
