---
name: pull-request-review
description: Review a pull request's complete diff, checks and governance evidence without merging it.
---

# Pull request review

1. Read PR metadata, full changed-file list, all patches, comments and current-head check results.
2. Compare the changes with repository instructions and applicable GEAS, security and release contracts.
3. Check correctness, regressions, untrusted input handling, authentication, authorization, data boundaries and evidence quality.
4. Verify that test claims match the exact head SHA and actual completed checks.
5. Report blocking findings before suggestions, with file paths, symbols/lines, impact and concrete fixes.
6. Do not approve, merge, close, force-push or alter branch protection. Human review and merge authority remain with the owner.
