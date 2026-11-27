# GLORIFIER GitHub coding agent — phase 1

Retain the existing owner-controlled Digital Me GitHub App (5876036) as the sole repository-write identity. This additive phase implements read-only, owner-bound command intake through GitHub Actions; it is not a new registered GitHub App, model integration, or autonomous coder.

On an open issue or PR, the owner can use an exact comment `/glorifier plan`, `/glorifier explain`, or `/glorifier fix`; `/glorifier review` applies only to a PR. The workflow revalidates the command and target using read-only GitHub API calls, checks that signed main still matches the event snapshot, rejects edited/deleted comments and closed targets, and pins same-repository PR heads targeting main. It emits deterministic evidence in the job summary without copying the comment body, invoking inference, fetching PR code, or writing to GitHub. Fork PRs are deliberately unsupported in this phase. Evidence is a point-in-time observation, not a durable lease or permission to execute. Revalidate again immediately before any future execution. Reruns by a different triggering actor are denied. Identical comment IDs map to identical proposal IDs; durable deduplication is required before any execution consumer is enabled. Reruns may emit the same proposal again.

Install only via an App-signed, reviewed PR; verify the issue_comment workflow is allowed by repository Actions policy. No App key is needed for this phase. Validate an owner command and a denied non-owner command after merging. Preserve signed commits, required CI, independent review, and the zero-budget constraint.

## Subsequent acceptance gates (not implemented here)

1. Attach proposals to the existing GEAS mission ledger using an atomic unique comment-ID constraint, authorization recheck, source-SHA pinning, cancellation and lease/retry limits.
2. Route repository inspection, architecture planning, diff generation and review through the existing provider-neutral agent harness; free-tier or explicitly funded execution only. Never assume a consumer chat subscription grants API credits. Fail closed when provider access is unavailable.
3. Validate generated patches in disposable isolated runners with no signing keys, production credentials or unrestricted network. Add failing regression tests before fixes; run focused and full required checks. Treat issue content, source files, test output and model responses as untrusted input.
4. Publish only approved, bounded changes via Digital Me's existing scoped App token, expected-head checks and GitHub-signed commits. Read back signature and signer. Independent eligible review, protected checks, and human high-risk decisions remain mandatory. Never self-approve.
5. Add authenticated webhook intake only if needed; verify raw-body signatures, installation and repository scope, replay protection and durable idempotency. Use GitHub events for CI triage without creating unbounded repair loops.
6. Prove end-to-end against an isolated harmless issue; no deployment, paid calls, secret mutation or repository-wide verification claims from phase 1.

## Collaborator registry (phase 1 of the multi-AI capability map)

`digital-me/src/agent-capabilities.mjs` lists the AI collaborators Digital Me can route a `/glorifier` intent to: Claude, Codex, GPT, Gemini and Nemotron (source-integrated adapters or workflows), GitHub Copilot (not integrated; never selected), Devin (advisory Devin Review links only, per #1070), and Neon (mission ledger store, not an AI). Every entry has `writeAuthority: 'none'` and starts as `NOT VERIFIED`; Digital Me App 5876036 remains the only write identity.

`selectCollaborators(intent, observations)` returns a routing proposal only. A collaborator is eligible only when it supports the intent, is source-integrated, and the caller supplies an own-property observation with `credentialConfigured: true`, `paidInferenceRequired: false` and `evidence: 'VERIFIED'`. Missing or partial observations fail closed with a specific denial reason. Execution, paid inference, approval and merge are always `false`.

`devinReviewLink()` builds the fixed `https://devinreview.com/GLORIFIER7/GLORIFIER/pull/<number>` URL bound to an exact head SHA. It performs no fetch, holds no credentials, and its findings are untrusted advisory input, never a GitHub approval.

Next gates: feed observations from provider discovery and live inference verification, attach routing proposals to the mission ledger, and route through the specialist council. Each needs its own reviewed PR and evidence.
