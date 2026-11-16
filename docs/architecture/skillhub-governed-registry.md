# SkillHub-Informed Governed Skill Registry

**Implementation status:** Local package validation, deterministic provenance, and promotion-gate contracts are implemented. The external SkillHub connector is **DISABLED / NOT CONFIGURED**. No skill has been imported, installed, executed, or published by this change.

## Decision

Use selected SkillHub registry patterns inside GLORIFIER instead of deploying the complete SkillHub service stack.

The useful patterns are:

- namespaced skill identity and immutable semantic versions;
- pinned source revisions and per-file SHA-256 evidence;
- deterministic package fingerprints and version-to-version file diffs;
- explicit dependency, permission, network-host, and side-effect disclosures;
- staged security scanning and human review;
- audit-linked promotion decisions and separate runtime authorization.

SkillHub itself is a standalone self-hosted registry with a Java/React service, deployment dependencies, a CLI, and optional scanner infrastructure. Reproducing that full service inside GLORIFIER would add a second control plane and operational burden. GLORIFIER therefore keeps GEAS as the authority and treats SkillHub as a possible external catalogue, not as a policy or execution authority.

## Source and license review

Reviewed source: [iflytek/skillhub](https://github.com/iflytek/skillhub), pinned review revision 3a3ae6d9b882ef5e521d7226df7045f6f4b38cfd.

The upstream repository declares Apache License 2.0. This GLORIFIER implementation is an independent, minimal TypeScript implementation of the described package-governance concepts; it does not copy upstream source files. Upstream references:

- [README and architecture overview](https://github.com/iflytek/skillhub/blob/3a3ae6d9b882ef5e521d7226df7045f6f4b38cfdfd/README.md)
- [Package path and file validation policy](https://github.com/iflytek/skillhub/blob/3a3ae6d9b882ef5e521d7226df7045f6f4b38cfdfd/server/skillhub-domain/src/main/java/com/iflytek/skillhub/domain/skill/validation/SkillPackagePolicy.java)
- [Skill publishing and version API guide](https://github.com/iflytek/skillhub/blob/3a3ae6d9b882ef5e521d7226df7045f6f4b38cfd/docs/skillhub/en/guide/skill-publish.md)
- [Content safety policy](https://github.com/iflytek/skillhub/blob/3a3ae6d9b882ef5e521d7226df7045f6f4b38cfd/docs/CONTENT_SAFETY.md)
- [Security scanner operational guide](https://github.com/iflytek/skillhub/blob/3a3ae6d9b882ef5e521d7226df7045f6f4b38cfd/docs/security-scanning.md)

The upstream documentation explicitly distinguishes structural validation, scanner results, human review, and final publication. A successful scan is not a guarantee that a skill is safe or suitable. GLORIFIER preserves that distinction.

## GLORIFIER implementation

### Package contract

The module src/lib/skillhub-registry.ts exports:

- normalizeSkillEntryPath: canonicalizes separators and rejects absolute paths, traversal, reserved path aliases, and invalid path segments.
- validateSkillCandidate: checks stable skill identity, exact semantic version, HTTPS source, immutable source revision, explicit license, pinned dependencies, root SKILL.md frontmatter, path uniqueness, symlink rejection, extension allowlist, file count and size limits, and per-file SHA-256.
- createSkillFingerprint: creates an order-independent package fingerprint from sorted path/hash pairs.
- diffSkillFiles: reports exactly which paths changed between package versions.
- evaluateSkillPromotion: blocks promotion unless provenance, license, dependency, permission, security, test, least-privilege, human-approval, reviewer, and audit gates are all satisfied.

The validator requires the caller to supply the actual bytes for every file; it recomputes each digest and byte length instead of trusting package metadata. Archive extraction and transport remain separate responsibilities and have not been wired to a live SkillHub instance. The initial package limits follow the conservative upstream defaults: 500 files, 10 MiB per file, and 100 MiB total. They are policy bounds, not evidence that a package has been scanned.

### Trust and execution boundaries

The machine-readable policy is config/skillhub-registry-policy.json.

- The external SkillHub connector is disabled and has no endpoint or credentials configured.
- Registry entries, package descriptions, SKILL.md instructions, and scanner output are untrusted data.
- No network lookup occurs in a production request path.
- No package is installed or executed automatically.
- A passing promotion decision means only that the candidate is eligible for the reviewed catalogue.
- installationAuthorized and runtimeExecutionAuthorized remain false even after every promotion gate passes.
- Any later runtime use requires a separate GEAS capability decision, scoped permissions, an isolated execution environment, and explicit approval appropriate to the risk.

### Review lifecycle

discovered -> quarantined -> scanning -> pending-review -> approved | rejected | revoked

These are proposed lifecycle states for registry records, not a claim that an external SkillHub instance has been connected. SCAN_FAILED, missing evidence, stale evidence, and unreviewed dependencies must block promotion. An approved catalogue entry is not a trusted agent, and it does not inherit authority from the SkillHub registry.

### Future external connector

A future connector should begin with read-only discovery and version retrieval only. The upstream API documents read endpoints for skill details, version lists, version details, and version downloads. GLORIFIER should pin the requested version, verify the downloaded content fingerprint, validate every package entry locally, and retain the upstream version and source revision as provenance.

Publishing, namespace administration, visibility changes, reviews, and tag mutation must not be delegated to a registry token in the first integration. No SkillHub endpoint, token, or external network call is enabled by this change.

## Verification

~~~sh
npm run test:skillhub-registry
npm run lint
~~~

The GitHub Actions workflow .github/workflows/skillhub-registry-contract.yml runs both checks for relevant changes.

Passing these checks validates GLORIFIER's local contract code. It does not prove a live SkillHub connection, successful malware scanning, external registry availability, package safety, or permission to install or execute a skill.
