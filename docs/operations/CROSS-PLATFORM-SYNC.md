# GLORIFIER cross-platform reconciliation — observed baseline

**Observed:** 2026-11-22. **Canonical source:** `GLORIFIER7/GLORIFIER` on `main`.

**Status: partial implementation.** This inventory and read-only monitoring do not prove that deployments, repositories, brand profiles, or databases have been synchronized. The target allowlist is at `config/platform-sync-targets.json`; evidence probing lives in `scripts/platform-sync-audit.mjs`.

| Platform | Direct account observation | Sync boundary |
| --- | --- | --- |
| GitHub | GLORIFIER application, GLORIFIER7 profile, and GLORIFIER-NEURAL repositories available | Only the application repository is the canonical codebase. The others have separate responsibilities; no blind mirror |
| Cloudflare Pages | Public GLORIFIER origin `https://glorifier.pages.dev` exists in repository configuration; direct Cloudflare account readback unavailable here | Worker health is not deployed-source SHA evidence and does not prove every API/auth route |
| GitHub Pages | `https://glorifier7.github.io/GLORIFIER/` is a designated static endpoint | Public HTML availability does not prove same-commit parity |
| Vercel | Connected GLORIFIER Hobby team returned zero projects and zero deployments | Unlinked; do not auto-deploy an unverified commit |
| Railway | Project `romantic-presence` found; latest deployments of `glorifier-artificial-intelligence` and `glorifier-permanent-orchestrator` each FAILED (2026-10-21) | Not a verified production mirror; do not create paid resources |
| Neon | `glorifier-ai` project found | Potential authoritative data store; no blanket data copying |
| Supabase | `GLORIFIER` project returned `ACTIVE_HEALTHY` | Healthy instance does not prove schema or row parity with Neon |
| WordPress | Two active Simple sites, one public and one private | Public content/profile is not code deployment; private content must not be published or copied |
| WordPress social connections | Active connections include Facebook and Instagram Business; several Google Drive, Google Photos, Instagram Basic, and LinkedIn integrations reported broken/invalid | These are not verified cross-post or repository synchronization channels |
| Zite | Existing `docs/architecture/github-zite-sync-workflow.md` is marked design-only | No real workspace or synchronization has been verified |

## Read-only audit behavior

The workflow `.github/workflows/platform-sync-audit.yml` runs local contract tests on pull requests and performs a daily/manual check of **two exact public GLORIFIER URLs** from the default branch. It uses a standard public GitHub-hosted Linux runner with a 10-minute job timeout and a read-only token. The probes use GET, an 8-second timeout, fail on redirects, and never send credentials, provider model prompts, user content, or secrets. The only stored result is the GitHub Actions run summary.

A healthy response is `PARTIALLY VERIFIED` with deployed release parity **NOT VERIFIED**, because a site being reachable does not prove it serves the approved source commit. Missing or failed evidence stays `NOT VERIFIED`, `NOT OBSERVABLE`, or `DEGRADED`. Private sites, databases, accounts, social networks and Cloudflare protected-origin endpoints are not probed.

## Required conditions before genuine cross-platform publication

1. Verify the exact Git commit SHA, required checks, designated target ownership, plan/free entitlements, and destination state.
2. Configure deployment targets with least-privilege authenticated Git integration, separated preview/production approvals, zero-budget limits, and rollback paths.
3. Deploy only via a reviewed release workflow after authorized production approval. Read back the **actual deployed SHA**; do not infer it from build success.
4. Confirm critical health, auth, runtime and static-asset contracts against the deployed version; record source, UTC observation timestamp, and evidence.
5. For Neon/Supabase or other storage, approve each dataset's source of truth, migration and conflict strategy, backup/recovery, and privacy scope before any write.
6. Keep user profiles, private WordPress content, wallets, NFT contracts, token supply and financial accounts separate. Never auto-cross-post, mint, move assets, rotate credentials, create paid subscriptions, or copy secrets.

**No write-back, production deployment, private-data replication, token movement, or paid inference is authorized by this audit.**
