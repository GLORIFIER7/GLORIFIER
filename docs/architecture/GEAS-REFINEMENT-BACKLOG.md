# GEAS architecture refinement backlog

Status: source and policy refinements; this document does not claim runtime controls or production outcomes are verified.

## Evidence rules
1. Source availability proves only that a URL responded.
2. Content matching is discovery evidence, not claim verification.
3. Each source-backed pattern should cite a stable URL, retrieval time, content hash, and exact supporting excerpt.
4. Source guidance does not prove GLORIFIER has implemented the pattern.
5. Runtime or deployment claims require independent runtime/deployment evidence.
6. Missing, stale, contradictory, or inaccessible evidence remains UNKNOWN.
7. No source scan or recommendation authorizes irreversible production changes.

## Five-state reconciliation
Record desired, declared, deployed, observed, and verified states separately. Each state's evidence must include nonempty references, observation/expiry timestamps, and a SHA-256 hash of that state's canonicalized snapshot. The reconciler recomputes the hash; evidence for an earlier or different snapshot must yield UNKNOWN, not ALIGNED or DRIFT. Hash binding proves integrity linkage only: it does not authenticate the referenced artifact or establish semantic truth. Deployment records do not prove observed health; health telemetry does not prove a security control works.

The outcome vocabulary is **VERIFIED, ALIGNED, PARTIALLY_VERIFIED, DRIFT, UNKNOWN**. The reconciler emits `VERIFIED` only when all five state snapshots have fresh, matching evidence and an injected trusted authenticator accepts a fresh independent-test attestation bound to the `verified` snapshot. The attestation records verifier ID/version and a `passed` or `failed` result. An authenticated pass yields `VERIFIED`; an authenticated failure yields `DRIFT`. A malformed, stale, snapshot-mismatched, rejected, or unauthenticated supplied attestation yields `UNKNOWN`. Without an attestation, matching states yield `ALIGNED`; without a trusted authenticator, a supplied but unauthenticated attestation never upgrades `ALIGNED` to `VERIFIED`. `PARTIALLY_VERIFIED` remains reserved until explicitly scoped optional checks are represented; it is not currently emitted.

Apply the precedence rules in order:
1. **UNKNOWN** — any required state evidence is missing, stale, unavailable, contradictory, or cannot be authenticated when supplied.
2. **DRIFT** — current snapshot-bound state evidence demonstrates a policy-relevant mismatch, or an authenticated independent verification attestation reports failure.
3. **VERIFIED** — all five states are evidenced and match, and the trusted authenticator accepts a fresh independent verification attestation as passed.
4. **ALIGNED** — all five states are evidenced and match, but independent behavioral verification is absent or has not been authenticated.
5. **PARTIALLY_VERIFIED** — reserved for explicitly scoped optional checks; never use it to conceal missing or stale required evidence.

Each result retains state evidence references and rationale; verifier ID/version and the attestation reference are returned only after authentication succeeds.

## Implementation sequence
### P0 — evidence integrity
- Replace keyword-only verification with claim-level checks tied to exact excerpts.
- Record retrieval timestamp, content hash, final URL, and source version where available.
- Keep content-matched classified as analysis; never emit claim-supported without a separate validation record.
### P0 — FOCUS 1.4 source-to-pattern alignment
- Bind the dedicated `finops-focus-1-4` scanner source to an invoice-reconciliation pattern and the matching registry claim type; do not leave an active source with an orphaned pattern declaration.
- Keep the resulting source match classified as analysis. Invoice authenticity, payable status, settlement, GLORIFIER's actual spend, and verified economic outcomes remain separate evidence requirements.
### P0 — live drift reconciliation
- Add adapters for repository declarations, deployment metadata, runtime health, and independent tests.
- Store timestamps and evidence references per state; stale evidence is UNKNOWN, not aligned.
- Keep production mutations out of the scanner.
### P1 — protocol and identity
- Track MCP 2026-07-28 and legacy compatibility separately; track A2A against its official released specification.
- Test identity, audience/scope, delegated authority, expiry/revocation, replay protection, and least privilege.
- Do not infer conformance from adapter presence.
### P1 — reliability, security, provenance
- Correlate request, policy, model, tool, settlement, delivery, and outcome evidence with trace identifiers.
- Use the proposed W3C PROV-O crosswalk in `docs/architecture/geas-provenance-crosswalk.md` to model entity/activity/agent lineage; the crosswalk and discovery-only registry entry do not claim runtime conformance.
- Add SLOs, synthetic end-to-end checks, incident recovery tests, artifact digests, and build provenance.
- Test resource-level API authorization, rate limits, idempotency, and safe failure behavior.
### P1 — business outcomes
- Distinguish payment intent, independently verified settlement, delivered service, reconciled ledger, and recognized revenue.
- Report cost per verified outcome only when billing and outcome records reconcile.
- Never treat quotes, balances, or unconfirmed notifications as revenue.
### P2 — broad architecture coverage
- Maintain authoritative sources across cloud, data, networking, platform engineering, IoT, edge, blockchain, governance, and emerging technology.
- Require a named control, test, owner, freshness policy, and acceptance evidence for each promoted pattern.
- Avoid adding infrastructure without a documented requirement and measurable benefit.
## Safety invariant
GEAS may observe, test within approved boundaries, compare, prioritize, and recommend. It must not autonomously perform irreversible production changes, transfer assets, trade, or rotate credentials. Controlled automation requires separately approved policy, bounded permissions, rollback plans, and human authorization where applicable.


## Source URL and cadence consistency — 2026-11-10

The GEAS scan artifact from run `42711324957` tested main commit `0163c45a9ef007e7f6cf0b47c6326431a6d32308` and recorded the `nist-ai-agents` source as `unavailable` because its former NIST path redirected outside the source-specific curated redirect allowlist. NIST's current canonical page is `https://www.nist.gov/super-intelligence/si-agent-standards-initiative` (page updated 2026-11-09). The registry and scanner catalog now use that canonical URL.

The source-registry consistency validator now compares the exact canonical URL as well as the source ID and review cadence. This prevents an active source from silently using different URLs in the registry and scanner catalog. URL equality is a catalog-integrity check only; it does not verify source claims or GLORIFIER implementation.

The same scan recorded `google-architecture` as unavailable due to a rejected redirect and `iso-42001` as not observed after HTTP 403. A subsequent PR scan (run `42748771833`, tested merge SHA `8d6ac58ca942de45ded16e20474b6a1e75710e7a`, source head `2808cba5060466a993beeef1d35e43f4085d75cd`) observed Google Cloud at HTTP 200 with `content-matched` status; the earlier redirect failure therefore recovered without broadening the redirect policy. ISO 42001 remains not observed after HTTP 403. Source availability and keyword matching remain discovery evidence only.


## Follow-up scan observation — 2026-11-10T03:22:14.980Z

The latest exact-head GEAS Architecture Science Scan is run `42748920898` (PR #782). Its provenance binds tested merge SHA `0b088038c08e507a6883058b1491c1dc1a97d927`, source head `180557a13ac2895f2b0b9e693d456c8ff8c53138`, and base SHA `4b93d61cfb91ca979923d6acf614f2f42dd6c2e5`. The uploaded artifact is `geas-architecture-scan-42748920898`; the downloaded ZIP SHA-256 is `9bfa2dff08eef49194e0e3541be22adc38775c983daea71e802fe51e3d362199`.

Observed result: 41 discovered patterns, all 41 classified as analysis, zero claim-supported patterns, zero recommendations, 39 evidence records, and eight drift findings. All eight drift findings remain `UNKNOWN` with no evidence references. The artifact records `irreversibleChangesExecuted=false`.

Source observations: 39 `content-matched`, two `source-available` (`microsoft-architecture` and `mitre-atlas`), one `unavailable` (`google-architecture`, rejected because the redirect target was outside its source-specific curated allowlist), and one `not-observed` (`iso-42001`, HTTP 403). The two `source-available` records are not content evidence. All 39 content matches remain discovery/analysis evidence, not claim verification.

This later observation supersedes any inference that Google Cloud was durably recovered by the earlier run `42748771833`: one scan observed HTTP 200/content-matched, while this exact-head scan rejected a redirect. The public Google Cloud Well-Architected page is reachable at the configured canonical documentation path, but this artifact does not expose the rejected redirect target. Keep the source unavailable for this run and do not broaden the redirect allowlist until the exact target and its canonical ownership/path are independently captured. Source availability, content matching, and URL/cadence consistency do not establish GLORIFIER implementation or runtime conformance.


## Durable agent messaging source — 2026-11-11

Observed public-source facts:
- NATS JetStream documentation describes persistent streams, stateful consumers, acknowledgements, replay, and at-least-once delivery semantics: https://docs.nats.io/concepts/jetstream
- CNCF announced NATS graduation on 2026-11-10 and described messaging and streaming across cloud, on-premises, and edge environments: https://www.cncf.io/announcements/2026/11/10/cncf-announces-nats-graduation-solidifying-a-production-ready-foundation-for-messaging-across-cloud-and-edge/

GEAS refinement:
- Register `nats-jetstream` as an active 14-day technical source and `cncf-nats-graduation` as a discovery-only 30-day maturity source.
- Add `durable-agent-messaging` as an integration-domain analysis pattern covering asynchronous decoupling, persistence, acknowledgements, redelivery, replay, retention, replication, and idempotent consumers.
- Keep the pattern explicitly analysis-only. Neither source proves that NATS is deployed, configured, or used by GLORIFIER; no messaging infrastructure is added by this refinement.
- Add exact-URL trust, registry/cadence, source-to-pattern, and no-deployment-claim regression assertions.

## HTTP cache validation and source-pattern evidence linkage — 2026-11-12

Observed public-source facts:
- IETF RFC 9111 is an Internet Standards Track document published in June 2022: https://www.rfc-editor.org/rfc/rfc9111.html
- Section 4.3.1 describes entity-tag validation with If-None-Match and Last-Modified validation with If-Modified-Since; Section 4.3.2 gives If-None-Match precedence when both are present; Sections 4.3.3–4.3.4 describe reuse and freshening of suitable stored responses after a 304 response.
- NIST's SI Agent Standards Initiative page was updated 2026-11-09 and identifies agent authentication/identity infrastructure and security evaluation as research areas: https://www.nist.gov/super-intelligence/si-agent-standards-initiative
- OWASP ACS v0.1.4 uses mandatory ACS-Core plus independently declared optional profiles; its profile declarations are self-claims and the current release has no independent conformance test suite: https://owaspacs.org/docs/spec/conformance/
- OpenTelemetry GenAI agent-span conventions remain marked Development: https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md
- FOCUS 1.4 remains the published specification; FOCUS 1.5 is a working draft with ratification scheduled for 2026-12-03: https://focus.finops.org/docs/specification/v1-4/ and https://focus.finops.org/focus-1-5-release-scope/
- SLSA v1.2 provenance is marked Approved; W3C PROV-O remains a W3C Recommendation: https://slsa.dev/spec/v1.2/provenance and https://www.w3.org/TR/prov-o/

Observed repository facts:
- Main SHA: `fe773d2dd806650e3baf34883a8b8be6ed76c60c`.
- Latest main GEAS Architecture Science Scan: run `43088845063`, tested SHA `fe773d2dd806650e3baf34883a8b8be6ed76c60c`.
- Artifact ZIP SHA-256: `a208ce763d5753103d8d292760f03c580254001ff65908a30647c0faa4620d3a`.
- The artifact records 59 registry sources, 44 active scanner sources, coverage across 17 domains, 41 content-matched sources, two source-available sources, one not-observed source, 43 analysis patterns, zero claim-supported patterns, and eight UNKNOWN drift findings.
- The artifact's AWS Well-Architected evidence record linked only `cross-cutting-cloud-controls`, although the scanner source catalog declared both `cross-cutting-cloud-controls` and `durable-agent-execution` for that source. The evidence builder had derived associations only from each pattern's primary `sourceId`, ignoring the source's declared `patternIds`.

Analysis:
- The missing secondary association is a traceability defect, not a claim-verification defect. Source-declared associations may link evidence to candidate patterns, but the evidence class must remain `analysis` unless a separate claim-level validation record exists.
- The existing conditional-fetch implementation already requires exact configured-URL identity, admissible cached evidence, matching final URL for 304 reuse, and monotonic observation timestamps. The new RFC source documents the protocol basis; it does not certify production cache behavior.

GEAS refinements:
- Evidence construction now uses the curated source's declared `patternIds`, preserving primary and secondary source-to-pattern links.
- Regression tests require every source pattern reference to resolve, require each pattern's primary source to declare it, preserve secondary associations, and prove that content matching remains `analysis` while source availability produces no evidence record.
- Registered `ietf-rfc9111-http-caching` as an active IETF source with a 14-day review cadence and added `conditional-http-cache-validation` as an integration-domain analysis pattern.
- The exact RFC 9111 URL is admitted; an unregistered RFC path on the same host remains rejected. No conditional-fetch runtime behavior or production data was changed.
- The RFC-derived pattern is guidance only. It does not prove that any production cache is deployed or compliant.

