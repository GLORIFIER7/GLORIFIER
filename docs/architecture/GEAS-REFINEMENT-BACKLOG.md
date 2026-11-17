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



## 2026-11-13 — authenticated claim-support admission boundary

Observed repository facts:
- Current main at inspection: `5a4948f4c6eec37ba34bca1d5f39714948b36641`.
- Current main has 60 registered source records: 45 active scanner sources and 15 discovery-only sources across 17 domains. The scanner catalog contains 45 active sources.
- The latest main-branch GEAS artifact retrieved during this run is scheduled run `43088845063`, tested against older main SHA `fe773d2dd806650e3baf34883a8b8be6ed76c60c`, completed `2026-11-11T19:37:24.652Z`. Its ZIP digest was independently recomputed as `a208ce763d5753103d8d292760f03c580254001ff65908a30647c0faa4620d3a`.
- That older artifact reports 44 source observations, 41 content-matched, two source-available, one not-observed, 43 analysis patterns, zero claim-supported patterns, and eight UNKNOWN drift findings. It predates the RFC 9111 source now present on current main; its 44-source count must not be treated as the current 45-source catalog.
- The current main commit's combined status endpoint reports one successful CircleCI Cloudflare Worker validation. The available GitHub workflow-run wrapper filters to pull-request-triggered runs, so it does not provide a complete current scheduled-main workflow inventory.
- The separate open PR #833 addresses the Federated A2A verifier boundary. Its tested commit `250854353fba2573fb7100f8798c386c334d6896` has successful GEAS reconciliation and enterprise-control workflows; its npm validation job succeeded while the actual npm publish job was skipped. PR #833 is not a GEAS refinement PR and was not modified by this change.

Observed public-source facts:
- NIST's SI Agent Standards Initiative page was updated 2026-11-09 and identifies agent identity/authentication infrastructure and security evaluation as research areas: https://www.nist.gov/super-intelligence/si-agent-standards-initiative
- OWASP ACS describes an authenticated Guardian control channel and an observable, reconstructable audit trail. The current documentation labels v0.1.4 as the shipped release; conformance declarations and optional profiles must not be confused with independent implementation verification: https://owaspacs.org/docs/acs/
- OpenTelemetry GenAI agent-span conventions remain in Development: https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md
- FOCUS 1.4 remains the current published specification; the FOCUS 1.5 page states ratification is scheduled for 2026-12-03: https://focus.finops.org/docs/specification/v1-4/ and https://focus.finops.org/focus-1-5-release-scope/
- SLSA v1.2 provenance is marked Approved and describes verifiable information linking artifacts to where, when, and how they were produced: https://slsa.dev/spec/v1.2/provenance
- W3C PROV-O remains a W3C Recommendation for representing and exchanging provenance: https://www.w3.org/TR/prov-o/

Analysis:
- The source fetcher emits content-matched, source-available, or not-observed; the cache validator rejects claim-supported cache rows. However, the exported evidence builder and classifier previously accepted a caller-supplied `claim-supported` status as sufficient to label an observation `observed-fact`.
- The separate claim-review validator admits record integrity only. Its result explicitly reports `reviewerIdentityStatus: not-authenticated` and `semanticTruthStatus: not-verified`. A record hash and an asserted supported decision do not authenticate a reviewer or establish semantic truth.
- The previous source-fetch path did not emit claim-supported, so the gap was a trust-boundary weakness in the exported builder/classifier rather than an observed promotion in the latest scan artifact.
- No trusted reviewer-identity and independent semantic-verification adapter is currently configured for the GEAS source scan. Claim support must therefore fail closed by default.

GEAS refinement prepared on `fix/geas-authenticated-claim-support-gate-20261113`:
- Added a structured claim-support attestation binding the claim-review reference, claim ID, exact architecture pattern ID, source ID, registry version, source snapshot hash, exact excerpt hash, authenticated reviewer reference, independent semantic-verifier reference, observation time, expiry, and supported decision. A claim can promote only its attested pattern ID; it cannot promote every sibling pattern associated with the same source.
- Claim-supported classification now requires a successful 2xx source observation, exact canonical final URL, exact source and excerpt hashes, current source cadence, non-future RFC 3339 observation time, unexpired attestation, and an injected synchronous trusted authenticator returning literal `true`.
- Missing, stale, mismatched, rejected, throwing, or asynchronous authenticators fail closed. Ordinary content-matched evidence remains `analysis`; source availability remains insufficient.
- Added regression coverage for absent/rejected authenticators, source-hash mismatch, excerpt mismatch, and expired attestations. The evidence-policy CI validator now checks the authenticated admission boundary.
- The scheduled scan does not configure a claim-support authenticator. It must continue to report zero claim-supported patterns until a separately reviewed trusted adapter is deployed and its identity and semantic-verification evidence are independently established.

Unresolved:
- Reviewer authentication and semantic verification remain external dependencies; no claim has been promoted by this refinement.
- The latest retrieved scheduled-main artifact predates current main. A fresh current-main GEAS artifact is still required before claiming current-main scan success.
- OpenTelemetry collector/exporter probes, actual FOCUS invoice/settlement reconciliation, signed SLSA artifact verification, and runtime PROV export remain separate implementation/verification gaps.


## 2026-11-13 — enforce source-authorized claim types at observed-fact admission

Observed repository facts:
- Main remains `5a4948f4c6eec37ba34bca1d5f39714948b36641`; existing claim-support refinement PR #836 is based on that SHA.
- PR #836's source scan artifact (run 43360668506) is bound to head `ac1cc222b9e931e5d82993904f0fc928e643450f`, base `5a4948f4c6eec37ba34bca1d5f39714948b36641`, and tested merge SHA `f5aa8668e98b0bdb9802291d3239d0bbffe04fb8`.
- The authoritative JSON registry separates `claimsAllowed` (claim-type policy) from the scanner's `patternIds` (discovery associations).
- Example: AWS Well-Architected permits claim type `cross-cutting-cloud-controls`, while the scanner also associates the source with `durable-agent-execution` for discovery. Those identifiers are not interchangeable.
- The claim-support admission path checked pattern association but did not directly enforce the registry's `claimsAllowed` list on the attested claim type.

Analysis:
- A source's association with a candidate architecture pattern is not authorization to support every claim type associated with that pattern or source.
- The trusted claim-review validator already checks `claimType` against `claimsAllowed`; the later claim-support attestation must preserve and re-enforce that same policy before it can create an `observed-fact`.
- The trusted authenticator remains an external trust boundary: it must resolve the evidence reference to the exact record and authenticate reviewer identity and independent semantic verification. No production authenticator is configured.

Refinement:
- Add `claimType` to the claim-support attestation and require it to be explicitly present in the scanner source's registry-mirrored `claimsAllowed` list.
- Mirror each active source's `claimsAllowed` values in the scanner catalog and extend the source-catalog parser/CI validator to require exact parity with the authoritative JSON registry.
- Add regression coverage proving an AWS discovery association such as `durable-agent-execution` cannot bypass the source's narrower claim-type allowance, even when the test authenticator returns true.
- Preserve zero claim-supported patterns in scheduled scans until a separately reviewed trusted authenticator is configured.

Unresolved:
- This is a fail-closed admission refinement, not reviewer authentication or semantic verification.
- No source claim, runtime deployment, invoice, OpenTelemetry collector, or production state is promoted by this change.

## 2026-11-14 — NIST agent identity design tenets source registration

**Auto-approval classification:** low risk; reversible; source metadata and regression coverage only. No runtime or production behavior is changed.

**Observed public source:** NIST, *Design Tenets for Agent Identity Management Systems*, published October 27, 2026: https://www.nist.gov/blogs/cybersecurity-insights/design-tenets-agent-identity-management-systems

The article describes ten design tenets: distinct agent identification; linking, delegation and scope attenuation; least/zero standing privilege; short-lived, dynamic and revocable authorization; human-in-the-loop escalation triggers; signed mandates and constraints; separation of policy from reasoning; deterministic access decisions; continuous monitoring; and immutable evidence.

**Repository refinement:**
- Add the canonical NIST article as an active scanner source with a 14-day review cadence.
- Associate it with the existing `agent-identity-delegation` analysis pattern.
- Mirror the source metadata in the authoritative registry and enforce it through the existing scientist/catalogue tests.

**Evidence boundary:** source discovery or content matching is analysis only. This registration does not establish that GLORIFIER implements these tenets, has cryptographically verified agent identities, uses zero-standing privileges, or has an independently verified immutable audit pipeline. The scheduled scanner has no trusted claim-support authenticator configured; claim-supported evidence must remain zero until a separately reviewed authenticator exists.

**Verification targets:** `npm run test:geas-scientist`, authoritative source-registry validation, source-registry/cadence validation, and the exact-head GEAS architecture scan with its uploaded evidence artifact.



## 2026-11-14 — reject navigation-only source excerpts and stale cached matches

**Auto-approval classification:** LOW risk; reversible; source-evidence normalization and regression coverage only. No production runtime, data, policy authority, credential, or external integration behavior is changed. The change is fail-closed: questionable excerpts are excluded from analysis rather than promoted.

**Observed repository evidence:**
- Main commit: \`b7853ff6496b575727727e738150a8243809fa8a\`, containing merged PR #862.
- Latest available GEAS scan artifact: run #43550232979, tested synthetic merge SHA \`ca3fdd219547a0b08f463d55dc539d9a95d0292f\`, PR head \`efc2c1c2e5d12983e667783034c188e4fd4c04b1\`, event base \`6b4e8a36c5383173806c026cc37b09c347381d97\`, tested merge base \`4c15055e35ecfc40fb45e83da5699549c5a50b8d\`.
- Artifact SHA-256: \`cc29f77aee0c1a7d8c85e9bc6b85a64791bac38c04b0e3efa9f1e91ed77325c2\`.
- The artifact reported 44 content-matched sources and 44 analysis patterns, but several excerpts began with navigation, promotional, or interstitial text rather than the source's substantive architecture guidance. Examples included AWS "News and announcements / AWS blog / About AWS", NIST "Skip to main content", NIST CSRC unauthorized-frame interstitials, OpenTelemetry site navigation, CNCF project navigation, and Open Group HR/certification navigation.
- The scanner's previous \`stripHtml\` removed script/style and markup but retained semantic \`header\`, \`nav\`, \`footer\`, \`aside\` and navigation-role content. Keyword extraction selected the earliest matching phrase, allowing these regions to become content-matched excerpts.
- Cached content-matched excerpts were reusable based on URL/status/hash/non-empty text; known navigation-only excerpts could therefore survive a code-only extractor refinement until cadence expiry.

**Analysis:**
- HTTP 200 and keyword presence are insufficient to establish that the captured excerpt substantively supports an architecture pattern.
- Removing semantic page chrome before excerpt selection is a conservative quality improvement. Full-page content hashing remains unchanged.
- Known navigation/interstitial excerpts must be inadmissible both for pattern creation and for cache/conditional-request reuse, forcing a full refetch rather than preserving stale low-quality evidence.
- Content-matched excerpts remain analysis only. This refinement does not authorize or create claim-supported evidence.

**Auto-approved finding:** GEAS evidence excerpts can be contaminated by navigation, sidebar, footer, promotional and interstitial page chrome; stale cached excerpts can preserve the contamination. The finding is auto-approved for a narrow, reversible evidence-quality refinement.

**Implemented refinement:**
- Add semantic evidence extraction that prefers \`<main>\`, then \`<article>\`, and otherwise removes \`nav\`, \`header\`, \`footer\`, \`aside\`, SVG/template/noscript and \`role=navigation\` regions.
- Keep the existing full-page normalized content hash behavior unchanged.
- Reject known navigation/interstitial markers in content-matched excerpt admission.
- Make stale navigation-only cache entries inadmissible so they do not supply cached observations or conditional validators.
- Ensure navigation-only cached observations cannot instantiate analysis patterns.
- Preserve all claim-support authenticator and source-policy boundaries.

**Affected files:**
- \`src/lib/governance/geas-architecture-scientist.ts\`
- \`src/lib/governance/geas-architecture-scientist.test.ts\`
- \`docs/architecture/GEAS-REFINEMENT-BACKLOG.md\`

**Regression and CI gates:**
- Main/article extraction removes semantic header/footer navigation.
- Fallback extraction removes navigation-role, sidebar and semantic chrome.
- Substantive content remains available when semantic page regions are absent.
- Navigation-only cached observations are invalidated for full refetch.
- Navigation-only cache records cannot supply ETag/Last-Modified conditional headers.
- Navigation-only cached observations cannot create architecture patterns.
- Run \`npm run test:geas-scientist\`, source-registry validation, cadence validation, evidence-policy validation and the exact-SHA GEAS architecture scan with artifact provenance.

**Implementation commits:**
- \`58e023868a036809df15913c117238226ffad800\` — semantic evidence extraction and stale excerpt admission.
- \`5d995788b3d905f24d62862af40e58f55ae01402\` — correct semantic navigation matcher.
- \`2f771d2abb425c01251267c1f71d4d9983f57790\` — initial regression tests for semantic extraction, stale cache invalidation and pattern rejection.
- \`0e73fecfbd7404828d7edd97e7680002b67e5410\` — record the auto-approved finding and evidence.
- \`b1b4d06ff7a5c4eb8cf2c7d4b0e8be51e37d8a53\` — extend cache-invalidating markers to observed CNCF, OpenTelemetry, FinOps, NIST and Open Group page chrome.
- \`0d874f16806c204ae264f4dddaa9650b72f0c32e\` — correct the llms.txt marker literal.
- \`9c650d1fb53143df4042205259d5eae96b35d32c\` — verify 304 cannot revive stale navigation evidence and GitHub navigation cannot create an OTel pattern.

**Follow-up source correction:**
- The exact-SHA scan run \`43551806085\` showed that the OpenTelemetry agent-span GitHub HTML page still contributed repository navigation to \`genai-agent-telemetry\`, despite the semantic-region filter.
- The official raw Markdown endpoint was independently fetched and confirmed to contain the agent-span specification, its \`Development\` status, and the substantive phrase "Describes an in-process GenAI agent".
- Updated the scanner and authoritative registry to the exact raw GitHub content URL, which is on the already curated \`raw.githubusercontent.com\` host.
- Added a source-specific phrase override and regression coverage for the exact URL, trusted-source admission, and substantive excerpt selection.
- Follow-up commits: \`5fb0e01e961623bdc2eaf04c9bfd0354f8cd9f91\`, \`941e0ecd5f866b35d403a0b2f9949bff84a8769f\`, \`016cb83fce0b2bb299b05790ad6bc23c6add224d\`.

**Review hardening after automated static-review findings:**
- Review identified that a single lazy regex could stop at the first nested same-name closing tag and that the phrase \`news and announcements\` alone could reject legitimate architecture prose.
- Replaced single-pass chrome regexes with a balanced tag scanner that tracks nested same-name elements, accepts multiline \`role=navigation\` attributes, removes script/style and semantic chrome, and fails closed by discarding the remainder when a chrome region is unterminated.
- Replaced single-marker rejection with marker groups. The AWS navigation signature now requires the combined "news and announcements", "AWS blog", and "About AWS" cues; ordinary prose containing only "news and announcements" remains admissible.
- Added regression tests for nested navigation/header/aside, multiline role attributes, legitimate event-stream prose containing "news and announcements", and reuse of substantive cached evidence.
- Follow-up commits: \`143769b1d7597224d2e22288a73e431da97d40fb\` and \`585f4bc5f4edd524a857e7a4361d71fd8b39d76f\`.

**Exact-SHA failure correction:**
- The first run on head \`8c5a703083fe03ea95ec5e6cf677f77bffab928c\` exposed two test-only defects: a curated-source fixture still expected the previous GitHub HTML URL, and an optional \`SourceObservation.finalUrl\` was passed where a required URL string was expected.
- Updated the fixture to the canonical raw OpenTelemetry URL and introduced a required local URL constant for the legitimate-prose cache test.
- No production behavior or security policy was weakened. The failed runs remain recorded as failures; the new head must pass fresh exact-SHA checks.
- Corrective commit: \`61aa25ffb8ae606a3591a4fdb4735b78d09cfc3d\`.

**FOCUS 1.4 source-quality correction:**
- The exact-head scan showed \`finops-focus-1-4\` was only source-available after page-chrome filtering. The root specification page's first matching invoice phrase was a use-case/navigation entry, not the substantive supported-feature definition.
- The official FOCUS 1.4 Invoice Reconciliation page states that Invoice Detail is the definitive financial record of invoice charges, defines the join to Cost and Usage, documents \`PaymentCurrencyInvoiceDetailId\` lineage for divergent billing/payment currency grains, and provides reconciliation queries for invoice totals, multi-currency settlement, and tax variance.
- Updated the source registry and scanner to the exact feature page URL and added source-specific matching phrases from that page.
- Regression tests now require the exact URL, trusted-source admission, and selection of the substantive Invoice Detail definition.
- Follow-up commits: \`bb689f69624400014d429052b504b9bfffb3b6aa\`, \`c2760870a0acb33694403a375f9e0c6dca4f312d\`, \`7afe2af62ee81552aa64cdde0edbd536cc305175\`.

**FOCUS source-fixture correction:**
- The exact-head scan on \`868e90775d74eb7d503f90a5c98c7c45ccff3d24\` failed its curated-source trust fixture because the test's approved-URL list still contained the old FOCUS specification landing-page URL.
- Updated the fixture to the new exact FOCUS 1.4 Invoice Reconciliation feature URL. The registry and scanner URL already matched; this was a test fixture mismatch, not a source-policy failure.
- The failed scan remains recorded. A fresh exact-head scan is required.
- Corrective commit: \`ce00facddb770f35110712db95645b2404ad9e75\`.

**Raw-text parser hardening:**
- Automated review identified that nested-looking \`<script>\` or \`<style>\` strings inside JavaScript/CSS could increment the balanced-tag depth and cause the parser to discard valid later content.
- Updated the scanner to treat script/style bodies as raw text and close on the first matching end tag, consistent with HTML raw-text parsing behavior.
- Added regression coverage for nested-looking script/style strings followed by substantive architecture text.
- Follow-up commits: \`e5c917d953da0f7870d2e9327fb873d37c40f789\` and \`fc817d7b65d14c61ca97419acaaf479e9147b7ae\`.

**Raw-text tokenizer and article-isolation hardening:**
- Further review found that even after raw-text mode was recognized, tokenizing script/style contents could interpret JavaScript comparisons such as \`i < n\` as malformed tags and swallow the actual closing tag.
- Changed the parser to search directly for the literal closing \`</script>\` or \`</style>\` while in raw-text mode, without tokenizing the body. Nested raw-text elements inside a discarded navigation region are skipped the same way.
- Changed evidence-region precedence to prefer \`<article>\` over \`<main>\`, preventing page-level comments or reader-generated content outside the article from being treated as source evidence.
- Added tests for JavaScript less-than comparisons inside script, tag-like strings in script/style, and article-versus-comment isolation.
- Follow-up commits: \`1e6707193abf35f1b639ff017c156054e657516d\` and \`5bbb76fc8b2041ed7fc6d733aa2a0566a3670cb1\`.

**Article-region selection hardening:**
- Automated review identified that selecting the first \`<article>\` before removing page chrome could choose a sidebar card, and a lazy regex could truncate nested article elements or match custom \`article-card\` / \`main-nav\` components.
- The extractor now removes chrome first, tokenizes only exact \`article\` / \`main\` tag boundaries, tracks nested depth, prefers the longest substantive article candidate, and falls back to the longest main candidate only when no article exists.
- Added regression tests for sidebar article cards, nested article sections, multiple article candidates, custom tags, and article-vs-comments isolation.
- Follow-up commits: \`989f621394d30b94884ac86a257e1ca928e2d186\` and \`64cceaa2547e22cd4648464e2f29f7997ec14487\`.

**Deferred:** Full semantic relevance verification still requires source-specific evidence review or a trusted semantic verifier. This change only removes known page chrome and does not claim that every remaining keyword match substantively proves its pattern. No production/runtime, invoice, collector, deployment or external identity evidence is promoted.


## 2026-11-14 — preserve substantive NIST agent-identity evidence when article includes a skip link

**Auto-approval classification:** LOW risk; reversible; evidence-admission false-negative correction only. No production runtime, data, credentials, permissions, spending, or external integration behavior changes.

**Observed evidence:**
- Main SHA at inspection: `b7853ff6496b575727727e738150a8243809fa8a`.
- PR #863 exact-head scan run: `43553317023`, source head `b0eb8c137cca5f9c4618cdd3a879c814b2d1b6b1`, base `b7853ff6496b575727727e738150a8243809fa8a`, tested merge `b317b52fed7e878f8a7301c928df277d41721f63`.
- Artifact: `geas-architecture-scan-43553317023`, ID `14097047695`, SHA-256 `f3329a73ad0b0621edc592585cad3101653e486765287f7503e510a3a6c943e6`.
- The artifact classified `nist-agent-identity-design-tenets` as HTTP 200 / `source-available`, despite the official NIST article containing the exact registered phrase `Distinct Agent Identification` and substantive descriptions of all ten identity design tenets.
- The extractor's page-chrome marker set contained a standalone `skip to main content` rejection. A legitimate NIST article excerpt can include that accessible skip-link text immediately before substantive article content.
- NIST's article was published 2026-10-27 and explicitly describes distinct agent identity, delegated-scope attenuation, zero standing privilege, short-lived revocable authorization, human escalation, signed mandates, policy/reasoning separation, deterministic access decisions, continuous monitoring, and immutable evidence: https://www.nist.gov/blogs/cybersecurity-insights/design-tenets-agent-identity-management-systems

**Analysis:** A single accessibility skip-link marker does not make an excerpt navigation-only when the same excerpt contains source-specific substantive architecture text. Rejecting it causes a false negative and leaves the AI domain without a discovered pattern, even though the primary NIST agent initiative and the secondary design-tenets source are registered. Removing this standalone marker does not allow the skip-link text alone to match a pattern: extraction still requires a source-specific pattern keyword, and all content-matched records remain analysis.

**Implemented refinement:**
- Remove the standalone `skip to main content` marker from the reject list.
- Add a regression observation containing the NIST skip link plus the exact substantive `Distinct Agent Identification` passage.
- Require the existing secondary-source fallback to create only an `analysis` pattern, never an observed fact.
- Preserve all other navigation/interstitial marker groups, cache invalidation, source URL allowlists, claim-support authentication, and five-state verification requirements.

**Affected files:**
- `src/lib/governance/geas-architecture-scientist.ts`
- `src/lib/governance/geas-architecture-scientist.test.ts`
- `docs/architecture/GEAS-REFINEMENT-BACKLOG.md`

**Required verification:** GEAS scientist tests, source-registry validation, cadence validation, evidence-policy validation, full CI, and a fresh exact-head architecture scan with artifact provenance. The previous successful scan predates this correction and does not verify the new head.

**Deferred:** This correction does not authenticate NIST claims, verify GLORIFIER agent identity, configure a claim-support authenticator, or change the eight UNKNOWN drift findings.

## 2026-11-15 — scanner authority/domain metadata parity

### Observed facts
- Main commit at inspection: `b1956f6fb61eea4ccdaf2e770e3649843b5afee0`.
- The authoritative registry contains 62 sources: 47 active scanner sources and 15 discovery-only sources across 17 domains.
- The scanner declares 47 active `createArchitectureSource` entries.
- A literal comparison of the 47 current scanner entries against the registry found zero current authority/domain mismatches.
- The scanner's `ArchitectureSource` model carries `authority` and `domain`, and the JSON registry carries the same fields. The shared parser previously extracted only ID, URL, cadence, and `claimsAllowed`; both registry validators therefore allowed authority/domain drift to pass unnoticed.

### Analysis
- This is a preventive catalog-integrity gap, not an observed current mismatch and not evidence of incorrect source content.
- A future authority mismatch could misattribute the publisher of an observation. A future domain mismatch could place a source or derived pattern in the wrong architecture domain while ID, URL, cadence, and claim allow-list checks still pass.
- Authority/domain parity is a deterministic metadata check. It does not verify source authenticity, substantive content, claim truth, or GLORIFIER implementation.

### Auto-approval record
- **Classification:** LOW risk; pre-authorized for engineering refinement.
- **Rationale:** Narrow, reversible parser and CI-validator changes only. No runtime behavior, production data, permissions, credentials, external commitments, paid resources, or governance safeguards are changed.
- **Evidence:** Main SHA above; 62 registry records; 47 active sources; 47 scanner entries; 17 registry domains; zero current authority/domain mismatches.
- **Affected files:**
  - `scripts/geas-source-catalog-parser.ts`
  - `scripts/geas-source-cadence-validate.ts`
  - `scripts/geas-authority-registry-validate.ts`
  - `docs/architecture/geas-scan-operations.md`
  - `docs/architecture/GEAS-REFINEMENT-BACKLOG.md`
- **Regression coverage:** Literal authority/domain extraction for factory and object entries; rejection of missing or computed metadata; explicit mismatch tests for authority and domain; exact registry/scanner parity checks in both registry and cadence validators.
- **CI gates:** Existing GEAS Architecture Science Scan runs the source-catalog parser, authoritative-registry validator, and source-registry/cadence validator. Its pull-request path filters already include all modified scripts and architecture documentation.
- **Code commits:**
  - Parser metadata extraction: `2b35c06f21cf1f5ce77fe486e73a0dbb9ef42756`
  - Cadence validator parity and tests: `53553ffeb1ee901c779044e37a3bfc9af0aa0485`
  - Authority registry parity and tests: `bc8b20a3d9801dc51a1b55195ddd40c2aedacda3`
  - Parser diagnostic clarification: `abbc3719d3c10be4c596822c697f88e4b742e550`
  - Computed-ID fixture isolation: `c794e44628ea75ff15d01601a83aafc777824701`
- **Branch:** `fix/geas-source-authority-domain-parity-20261115`.
- **Verification status:** Passed on source head `f58c88652860254dd088904cd17f95fa60beb95a`, tested merge SHA `e02075b0c8a2637f1cd429e77a1e678c3bf986fa`, GEAS Architecture Science Scan run `43672605023`; artifact `geas-architecture-scan-43672605023` SHA-256 `a689c6a268c60c204379c5e54b56d3d1cdd5a561988954797703247be2c1db11`. All 12 PR-triggered workflow runs completed successfully on that head; the Cloudflare production-deploy job was skipped.
- **Merge/deployment:** Not authorized by this auto-approval; no PR review approval, merge, production deployment, or production mutation is performed.

### 2026-11-15 review follow-up — connect parity helpers to live validation

#### Observed review feedback
A comment-only Amazon Q review on PR #882 identified that the new `isMatchingSourceMetadata` helpers were covered by fixtures but bypassed by the actual registry/cadence loops. It also questioned whether URL parity should compare raw strings or normalized URL values.

#### Analysis and decision
- The helper/live-path mismatch was valid and has been corrected: both validators now invoke the tested metadata helper in their actual per-source validation loops.
- URL parity remains deliberately byte-for-byte. The exact configured URL is the cache identity; silently normalizing a trailing slash or other representation would hide a source-key change. URL normalization remains appropriate for duplicate-alias detection, which is a separate purpose.
- A regression fixture now rejects a trailing-slash variant as a different source URL/cache identity.
- The review was a COMMENTED advisory, not a GitHub approval. No PR approval was submitted.

#### Auto-approval record
- **Classification:** LOW risk; pre-authorized review refinement.
- **Rationale:** Validator-only behavior plus explanatory comments and a deterministic regression fixture. No runtime fetch, production behavior, data, permissions, or security policy was weakened.
- **Affected files:** `scripts/geas-source-cadence-validate.ts`, `scripts/geas-authority-registry-validate.ts`.
- **Regression coverage:** Live metadata parity helper invocation in both validators; authority and domain mismatch fixtures; byte-different URL/cache-identity fixture.
- **Commits:**
  - `77c8359ad8c054b651a9ed615785dd8401f76602` — use the metadata helper in live cadence validation and assert exact URL identity.
  - `916c95b4d88ec4f187abad94a524d417b60df05f` — use the metadata helper in live registry validation and document exact URL parity.
- **Verification:** The review follow-up passed on source head `f58c88652860254dd088904cd17f95fa60beb95a`, tested merge SHA `e02075b0c8a2637f1cd429e77a1e678c3bf986fa`, through GEAS Architecture Science Scan run `43672605023`; artifact SHA-256 `a689c6a268c60c204379c5e54b56d3d1cdd5a561988954797703247be2c1db11`. All 12 PR-triggered workflow runs completed successfully; no production deployment occurred.
- **Review/merge:** No PR review approval, merge, or deployment is performed.



## 2026-11-16 — NIST IR 8259 Rev. 1 IoT product lifecycle source

### Observed facts
- Current main at inspection: `ed43ce47f1b115aa4caed76f75e68af83690c454`.
- The authoritative registry contained the general NIST Cybersecurity for IoT Program page but no dedicated entry for the final NIST IR 8259 Revision 1 publication.
- NIST CSRC identifies `https://csrc.nist.gov/pubs/ir/8259/r1/final` as **NIST IR 8259 Rev. 1, Foundational Cybersecurity Activities for IoT Product Manufacturers**, published April 2026 and superseding the May 2020 IR 8259. Its abstract describes recommended manufacturer activities before IoT products are sold to customers.
- NIST's April 20, 2026 announcement explicitly describes the revision as spanning pre-market through post-market activities and broadening customer communications about cybersecurity, maintenance, support, and end-of-life.
- The official publication page is content-backed; this is evidence about NIST guidance, not about GLORIFIER's IoT implementation.

### Analysis
- A dedicated final-publication source improves specificity and gives the IoT domain a distinct lifecycle-guidance pattern instead of relying only on the general NIST IoT program landing page.
- The pattern is limited to analysis of manufacturer guidance. It does not establish that GLORIFIER manufactures, deploys, or operates IoT products, nor that it conforms to NIST IR 8259 Rev. 1.

### Auto-approval record
- **Classification:** LOW risk; pre-authorized for engineering refinement.
- **Rationale:** Registry/scanner metadata, a source-specific excerpt selector, an analysis-only pattern, regression tests, and existing CI validators only. No production behavior, runtime security posture, production data, credentials, permissions, paid resources, or external commitments change.
- **Source:** NIST CSRC, NIST IR 8259 Rev. 1, final publication, April 2026: https://csrc.nist.gov/pubs/ir/8259/r1/final.
- **Corroborating source:** NIST, “Sharpening the Focus on Product Requirements and Cybersecurity Risks,” April 20, 2026: https://www.nist.gov/news-events/news/2026/04/sharpening-focus-product-requirements-and-cybersecurity-risks-updated.
- **Registry entry:** `nist-ir-8259r1`; authority NIST; domain `iot`; exact URL above; 14-day review cadence / 336-hour scanner cadence; implementation status `not-assessed`; claim type `iot-product-cybersecurity-lifecycle-guidance`.
- **Analysis pattern:** `iot-product-cybersecurity-lifecycle`; remains `analysis` only.
- **Affected files:** `docs/architecture/geas-authoritative-source-registry.json`, `src/lib/governance/geas-architecture-scientist.ts`, `src/lib/governance/geas-architecture-scientist.test.ts`, and this backlog.
- **Regression tests:** Exact canonical URL and trust admission; 336-hour cadence; source-pattern and claimsAllowed linkage; exact substantive abstract sentence selection; content-matched observation produces only an IoT analysis pattern; source-available-only observation produces no pattern.
- **CI gates:** Existing GEAS source-registry/cadence parity, authoritative-registry validation, scientist tests, evidence-policy tests, and exact-head architecture scan.
- **Branch:** `geas/nist-ir-8259r1-iot-lifecycle-source-20261116`.
- **Implementation commits:** Recorded in the PR and final run report after GitHub returns the commit SHAs.
- **Governance:** This finding is auto-approved for refinement only. No PR review approval, merge, deployment, or production change is authorized.


## 2026-11-17 — NIST IR 8621 SI incident-management evidence

### Observed facts
- NIST CSRC lists **NIST IR 8621, NIST Workshop on SI Incident Management**, as a final publication dated November 2, 2026: https://csrc.nist.gov/pubs/ir/8621/final.
- The abstract reports stakeholder findings around reasoning-layer telemetry, non-human identity governance, authorization-scoped containment, evidentiary/reporting schemas, and coordination across distributed SI value chains.
- NIST describes the report as workshop findings and a foundation for future guidelines and operational playbooks. It is not a normative conformance standard.

### Analysis
- The source supports an analysis pattern for SI incident readiness, evidence collection, identity governance, and scoped containment.
- A content match does not establish that GLORIFIER has those runtime controls, incident telemetry, containment procedures, or conformance.
- Source availability alone must not instantiate the pattern or support an implementation claim.

### Auto-approval record
- **Classification:** LOW risk; pre-authorized for engineering refinement.
- **Rationale:** One exact NIST source registration, one source-specific excerpt selector, one analysis-only pattern, regression tests, and existing CI validators. No runtime behavior, production configuration, data, credentials, permissions, paid resources, or external commitments change.
- **Source:** NIST CSRC, NIST IR 8621, final publication, November 2, 2026: https://csrc.nist.gov/pubs/ir/8621/final.
- **Registry entry:** `nist-ir-8621`; authority NIST; domain `cybersecurity`; 14-day review cadence / 336-hour scanner cadence; implementation status `not-assessed`; claim type `si-incident-management-guidance`.
- **Analysis pattern:** `si-incident-management-evidence`; remains `analysis` only and explicitly disclaims conformance and GLORIFIER implementation.
- **Evidence selector:** The source-specific phrase `reasoning-layer telemetry, non-human identity governance, authorization-scoped containment`; generic page availability and navigation text are not sufficient.
- **Affected files:** `docs/architecture/geas-authoritative-source-registry.json`, `src/lib/governance/geas-architecture-scientist.ts`, `src/lib/governance/geas-architecture-scientist.test.ts`, and this backlog.
- **Regression tests:** Exact canonical URL and trusted-source admission; 336-hour cadence; source-pattern and claimsAllowed linkage; substantive excerpt selection; content-matched observation produces only a cybersecurity analysis pattern; source-available-only observation produces no pattern.
- **CI gates:** Existing GEAS source-registry/cadence parity, authoritative-registry validation, scientist tests, evidence-policy tests, and exact-head architecture scan.
- **Branch:** `geas/nist-ir-8621-si-incident-evidence-20261117`.
- **Implementation commits:** Registry `263090e203f8134dc099668572fd31461f1139f2`; scanner/pattern `9fda0aec9e473326c2db7ea52c1c8e6e64cc6375`; regression tests `6103dc4bc6357d06e67f37bffa4f6d9c789fb08d`.
- **Governance:** Auto-approval covers engineering refinement only. No PR review approval, merge, deployment, or production change is authorized.


## 2026-11-17 — Evidence excerpt word-boundary integrity

### Observed fact
- The exact-head artifact for PR #909 (run 44013438199; source head 35d5068e7b4f8acec394f08c9272792e6ed52b2c; tested merge 26e9e5e52d40166a9a56f45c2c51938bd65465cc; ZIP SHA-256 1b573ac499578ce6bedd8f507ed2d44fb17b858c577365071a7d2f05e81e2c19) contains an NIST IR 8621 excerpt beginning with the complete word "presentations" and ending with "reporting schemas." The official NIST abstract says "Discussions and technical presentations highlighted..." The excerpt omits the preceding adjective "technical" but does not split the word. The source URL, content SHA-256, and analysis classification remain intact.
- NIST source: https://csrc.nist.gov/pubs/ir/8621/final, full abstract lines 76–78; publication history identifies IR 8621 Final on 2026-11-02.

### Analysis
- A synthetic regression fixture demonstrated that a fixed character offset can split a word when the selected start or end falls inside a token.
- The new helper expands offsets to whole-word boundaries. The live artifact confirms a word-aligned excerpt; the omitted adjective is context truncation, not a mid-word integrity defect.
- This is evidence-presentation behavior only. It does not alter the source digest, evidence class, claim authorization, or claim-support admission.

### Auto-approval record
- Classification: LOW risk; pre-authorized for engineering refinement.
- Rationale: Deterministic excerpt formatting only. No source trust, claim authorization, evidence classification, production behavior, data, security posture, permissions, or budget changes.
- Affected files: src/lib/governance/geas-architecture-scientist.ts, src/lib/governance/geas-architecture-scientist.test.ts, and this backlog.
- Implementation: Add trimEvidenceExcerptToWordBoundaries and use it in createEvidenceExcerpt.
- Regression tests: Synthetic leading and trailing mid-word offsets expand to whole-word boundaries; out-of-range offsets clamp to source length.
- Commits: 65ac91bb9f95cd892146fc56eb1c3af1b1081dd6 (helper); f71ba7acae5c8351366e0f002ba4fcddcd594df6 (tests).
- Verification limitation: Run 44013438199 is the exact-head artifact for the source head above. Its ZIP was independently downloaded and SHA-256 verified. No claim was promoted to claim-supported.
- Governance: Excerpt formatting only. No claim promotion, PR review approval, merge, deployment, or production mutation.


## 2026-11-17 — Global collaboration cadence and execution-scope truth

- **Finding:** The architecture document said the collaboration workflow ran every 15 minutes. The authoritative workflow currently declares `47 */6 * * *` (six-hourly). The top-level policy already says `continuous: false` and that a persistent daemon is NOT VERIFIED, but the documentation and runtime-scope record did not preserve that distinction.
- **Observed evidence:** Main workflow `.github/workflows/global-collaboration.yml` uses the six-hour cron, requires the `DATABASE_URL` repository secret, and requests an OIDC identity token without exchanging it for database credentials. Its scheduled run #43971183304 completed on 2026-11-16 against commit `fe093ff...`: 4 public sources scanned, 97 findings observed, 0 opportunities created, 168 candidates reviewed, 0 resolution cases created, and no recorded errors. That run is evidence of one scheduled discovery/resolution cycle, not persistent operation or multi-agent execution. The workflow entry point calls `run24x7OpportunityDiscoveryCycle` and `runGlobalResolutionCycle`; it does not invoke model inference, Specialist Council execution, A2A task execution, MCP, or Autopilot mission execution.
- **Production comparison (read-only observation, 2026-11-17):** Railway service records report state=live, but the permanent-orchestrator and artificial-intelligence latest deployments are FAILED (2026-10-21); the TrueFoundry backend, PostgreSQL, and Redis services have no latest deployment; the environment reports no attached volumes. The permanent-orchestrator service has no configured DATABASE_URL or GLORIFIER_A2A_SIGNING_SECRET. Runtime health and persistent daemon operation are therefore NOT VERIFIED; do not call these services definitively offline based on the service-state field alone, and do not restart without an approved persistent-storage plan. Cloudflare schedule inventory is empty for both glorifier and glorifier-neural, while root wrangler.jsonc declares */5 * * * *; deployed cron parity is NOT VERIFIED.
- **Auto-approval:** APPROVED FOR ENGINEERING REFINEMENT under the owner's low-risk policy. Risk: LOW. The change is limited to policy metadata, documentation, regression tests, package test wiring, and a GEAS CI gate. It does not change runtime behavior, database contents, permissions, external endpoints, provider settings, or production configuration.
- **Affected files:** `src/lib/global-collaboration-orchestrator.ts`; `docs/GLORIFIER-GLOBAL-COLLABORATION.md`; `src/lib/global-collaboration-runtime-evidence.test.ts`; `package.json`; `.github/workflows/geas-architecture-scan.yml`.
- **Tests/CI:** `npm run test:global-collaboration-runtime-evidence`; GEAS Architecture Science Scan CI step added to execute the test.
- **Implementation commit:** `94022276ccb0d55ee83675b7585441d0e2c7f287` (policy metadata); subsequent documentation/test/CI commits are recorded in the PR history. Pre-backlog validation branch head: `7f947ffd0a5eda6bb85a10557e9d4aca4a972443`.
- **Deferred:** Component-level `continuous: true` fields in the 24x7 discovery capability are left unchanged because they describe a daemon implementation/target; the live daemon state is separately NOT VERIFIED. No PR review approval, merge, or deployment is authorized by this finding.


## 2026-11-17 — AI enterprise interoperability and production evidence snapshot

- **Repository baseline:** GLORIFIER7/GLORIFIER main was 8d3633beddb9d6127d111770c2824c5115ae66a9. The current open global-collaboration cadence refinement is PR #910, based on that SHA. No merge or deployment was performed.
- **Scheduled collaboration execution:** src/lib/global-collaboration-orchestrator.ts imports and calls only run24x7OpportunityDiscoveryCycle and runGlobalResolutionCycle; scripts/run-global-collaboration.ts invokes that wrapper as actor github-actions-global-collaboration. The workflow is scheduled at 47 */6 * * *, requires DATABASE_URL, and requests GitHub OIDC identity but explicitly performs no external token exchange or database credential federation. Run #43971183304 completed on fe093ff... with 4 public sources scanned, 97 findings, 0 opportunities created, 168 candidates reviewed, 0 resolution cases created, and no recorded errors. This is one scheduled discovery/resolution cycle, not persistent daemon execution, model inference, Specialist Council execution, A2A task execution, MCP execution, or Autopilot mission execution.
- **Call-graph regression:** The existing runtime-evidence test now reads the collaboration orchestrator and scheduled entrypoint and rejects additions of provider inference, Specialist Council, A2A task execution, MCP, or Autopilot execution to that cycle. Test refinement commit: 3f525d56b1d43398987d0bb094aa2d6760c7c87e. Risk: LOW; test-only; no runtime behavior changed.
- **Cloudflare glorifier Worker:** Active version 1006 is deployed at 100% traffic. Its active release metadata reports source commit 394b99f66cf5f6380fee801fc203559252c9a8d1 and workflow run 43821688548 (successful workflow_dispatch, 2026-11-16 07:08:31Z). Current main is 13 commits ahead of that release commit. Therefore Worker/main parity is STALE, not verified. Active inference, external-egress, and paid-inference flags are all false. The active version has no AI binding and does not expose the repository's GLORIFIER_WORKERS_PLAN_VERIFIED, GLORIFIER_WORKERS_AI_FREE_ONLY, or Workers AI model bindings.
- **Cloudflare glorifier-neural Worker:** Active version 36 is deployed at 100% traffic (created 2026-11-11 01:28:39Z). No release commit/ref/run binding was present, so source parity is NOT VERIFIED. Active configuration reports GLORIFIER_PROVIDER=openai, ANTHROPIC_MODEL=claude-sonnet-5, and GEMINI_MODEL=gemini-3.8-flash; these are configuration labels, not provider/model readiness evidence. Inference, external egress, and paid-inference flags are all false. The monorepo copy at services/neural/cloudflare/wrangler.jsonc declares cloudflare_workers_ai, @cf/google/gemma-4-26b-a4b-it, plan unverified, plan verification false, and free-only mode false. The separately maintained GLORIFIER7/GLORIFIER-NEURAL repository at main 042c50d declares GLORIFIER_PROVIDER=openai and the active Worker configuration matches that provider/flag profile. The separate repository is the relevant deployment source; the active Worker version has no release-commit binding, so exact source parity remains NOT VERIFIED. The monorepo copy is not proven synchronized with the separate repository. No provider readiness or inference request was performed.
- **Cloudflare schedules and observability:** Production schedule inventory is empty for both Worker scripts while root wrangler.jsonc declares a five-minute cron. Worker logs/traces and query-string redaction are enabled in active configuration, but this is not proof of an OpenTelemetry SDK/exporter/collector path. Public GET probes for /api/health and NEURAL /health were not accessible through the available web retrieval surface; live route health is NOT OBSERVABLE. No /ready provider probe was called.
- **No-cost inference architecture:** The repository contributor policy defines a separate free-only path with a fixed $0 paid budget, paid inference disabled, broad external egress disabled, exact provider/model/endpoint attestations, current account-plan/quota evidence, and enforced limits. The Cloudflare Workers AI path additionally requires verified Workers plan, free-only mode, inference explicitly enabled, external egress false, and paid authorization false. Current deployed flags and plan attestations do not satisfy those gates. No provider is described as free or ready; no inference was executed.
- **AI CEO and Specialist Council:** The AI CEO/coordinator and specialist roles are declared in policy/code. The scheduled collaboration workflow does not invoke provider inference or runSpecialistCouncil. Provider registry entries and model labels are code/configuration evidence only, not live readiness.
- **A2A and human authorization:** A2A v1 advertises /.well-known/agent-card.json and /api/a2a/v1. isAuthorizedA2AExecution requires authenticated owner identity plus an approved decision. A2A runtime status returns memory-only when DATABASE_URL is absent; protocol task creation rejects absent DATABASE_URL; signed handoffs require GLORIFIER_A2A_SIGNING_SECRET. Federated tasks begin DISCOVERED and require human approval where the capability route declares it. The Railway permanent-orchestrator service has neither DATABASE_URL nor GLORIFIER_A2A_SIGNING_SECRET and its latest deployment failed. The separate AI service has both variable names but its latest deployment also failed. Live A2A execution and durable task read-back are NOT VERIFIED.
- **NEURAL orchestration:** Provider readiness is disabled by default when inference is disabled. The task policy blocks financial, wallet-signing, minting, destructive, and production-write actions; require_approval returns NOT VERIFIED pending human approval. The deployed NEURAL Worker has no release-commit binding, and its public health route was not observable. No task or provider readiness request was performed.
- **Autopilot:** Node mission-control readiness requires a persistent mission store, DATABASE_URL, A2A signing secret, durable A2A persistence, and an authorized free-provider selection. Cloudflare Autopilot requires verified Workers plan, free-only mode, inference explicitly enabled, external egress disabled, paid inference disabled, the NEURAL service binding, and app-state Hyperdrive. Current production configuration does not meet the free-only gates. The Cloudflare cycle is documented in code as a bounded plan for human review and does not include the Node GitHub-write adapter, A2A executor, merge path, or deployment path. Persistent mission execution is NOT VERIFIED.
- **Railway:** Production environment service records show glorifier-permanent-orchestrator and glorifier-artificial-intelligence latest deployments FAILED (2026-10-21); glorifier-trueforge, trueforge-postgres, and trueforge-redis have no latest deployment. No Railway volumes are attached. The orchestrator lacks DATABASE_URL and A2A signing-secret variable names. No restart was attempted.
- **Neon/Supabase six-table comparison:** Neon project glorifier-ai is on free subscription free_v3; default branch main is ready, with reported logical size 662.7 MB against a 1 GB branch limit. Supabase project GLORIFIER is ACTIVE_HEALTHY on PostgreSQL 17.11. Both contain the six public tables intelligence_reports, intelligence_evidence, intelligence_analyses, connection_registry, connection_events, and connection_approvals. Neon has 52 columns; Supabase has 51. The only column difference is Neon-only nullable connection_approvals.related_task_id. Neon row counts are respectively 133, 1,099, 266, 30, 251,212, and 9; Supabase row counts are zero for all six. RLS is disabled with no policies on these Neon tables; Supabase has RLS enabled with restrictive glorifier_deny_client_roles policies for anon and authenticated. Root Worker configuration declares GLORIFIER_DATABASE_PROVIDER=neon; this is the strongest current configuration signal, not an approved source-of-truth or migration decision. No rows or schemas were modified. Preserve both datasets pending owner-approved source-of-truth, backup, and migration plan.
- **Evidence and governance:** GEAS policy and evidence-admission tests exist, but no production claim-support authenticator or independently verified architecture claim was established in this snapshot. Keep all eight five-state drift findings UNKNOWN. CI artifact provenance is not signed production deployment provenance.
- **Safety:** No model inference, provider readiness request, production configuration change, database write, migration, restart, deployment, publication, purchase, secret readout, blockchain signature, or irreversible operation was performed.

## 2026-11-17 — Review hardening and deferred NEURAL free-inference gate

- **Auto-approved finding — CI path coverage (LOW):** Review identified that the GEAS pull_request path filter omitted the collaboration runtime-evidence test and its source/entrypoint dependencies. Added the test, orchestrator, scheduled entrypoint, collaboration workflow/documentation, and backlog paths. The regression test now asserts that all six paths remain included. Workflow change commit: 68ace27b64c6ac0137ca11fdeacd4de353697776; path-coverage test commit: 8fb9744e3232f3982130cf339a6a20de43a6d009.
- **Auto-approved finding — test failure reporting (LOW):** Review identified that module-level readFileSync calls could crash the test module before named tests were reported. All file reads now occur inside the corresponding test callbacks through readSource(). Fix commit: 7dff3631ac07e198909039743a3cccd87c39eb92. The scheduled call-graph regression was introduced in commit 3f525d56b1d43398987d0bb094aa2d6760c7c87e. No runtime behavior changed. Both review threads were replied to and resolved; no GitHub approval review was submitted.
- **Deferred finding — NEURAL no-cost inference authorization (HIGH / OWNER APPROVAL REQUIRED):** The separate GLORIFIER7/GLORIFIER-NEURAL main at 042c50d5d570122eeb12036c7a68865330630da7 has no Workers AI provider adapter in app/providers/. Its app/runtime.py enables inference only when both GLORIFIER_ENABLE_INFERENCE and GLORIFIER_PAID_INFERENCE_AUTHORIZED are true; provider readiness is separately gated by external egress. Therefore the monorepo's free-only contributor policy and Cloudflare Workers AI gate do not currently compose with the deployed NEURAL runtime. Do not set paid authorization or broad egress true as a workaround. A distinct Workers AI free-only authorization path would require owner-approved design, verified account plan/model eligibility, exact endpoint/model allowlisting, enforceable account-wide quota, zero paid budget, egress false, signed audit evidence, and regression/security review. No code or runtime configuration was changed.
- **NEURAL provider evidence:** Current separate-repository configuration selects openai with inference=false, external egress=false, and paid inference=false. The OpenAI adapter declares default model gpt-6-luna; active model/provider labels are configuration only and were not readiness-tested. No Workers AI binding or free-plan attestation was observed in the active NEURAL Worker. No inference or readiness request was made.
- **Standards watch:** ETSI TC NET is an emerging standards-work candidate for network/edge/cloud/AI federation, but no normative pattern was admitted from the announcement alone. FOCUS 1.5 remains a working draft ahead of its scheduled 2026-12-03 ratification; FOCUS 1.4 remains the current invoice-reconciliation baseline. OWASP ACS v0.1.4 and OpenTelemetry GenAI agent-span conventions remain version/status-sensitive; ACS self-declarations and Development-status semantic conventions are not independent conformance evidence. SLSA v1.2 is the approved provenance baseline.
- **Verification state:** The prior exact-head GEAS run #44017766795 passed for head 86c6564f0f0d6974fdde305c87a4887bb89c5e65. Subsequent review-fix commits changed the branch; all checks must be re-observed against the new final head before any merge decision. PR #910 remains draft and unmerged.
- **Safety:** No provider readiness, inference, paid API, production deployment, configuration write, database mutation, migration, restart, publication, or secret readout was performed.
