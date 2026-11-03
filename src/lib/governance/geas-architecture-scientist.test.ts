import { readFileSync } from 'node:fs';
import {
  createGovernedActionEvidencePackage,
  createAgentIdentityContract,
  createTokenLifecycleContract,
  getGeasArchitectureModel,
  getArchitectureDomainCoverage,
  isClaimSupportedEvidence,
  classifyArchitectureEvidence,
  isSourceObservationDue,
  shouldReuseSourceObservation,
  buildConditionalRequestHeaders,
  createSourceFetchContext,
  reuseNotModifiedSourceObservation,
  stripHtml,
  isTrustedArchitectureSourceUrl,
  isTrustedCuratedRedirectTarget,
  findEarliestKeywordIndex,
  type ArchitectureDomain,
  type ArchitecturePattern,
  type SourceObservation,
} from './geas-architecture-scientist';
import { strict as assert } from 'node:assert';
import { before, test } from 'node:test';

let assertionsCompleted = false;

before(async () => {
const model = getGeasArchitectureModel();

const googleArchitectureSource = model.sources.find((source) => source.id === 'google-architecture');
if (googleArchitectureSource?.url !== 'https://docs.cloud.google.com/architecture/framework') {
  throw new Error('Google Cloud architecture source must use the verified canonical Well-Architected Framework URL');
}

for (const source of model.sources) {
  if (!isTrustedArchitectureSourceUrl(source.url)) {
    throw new Error(`model source is not covered by the curated hostname allowlist: ${source.id}`);
  }
}

if (findEarliestKeywordIndex('resource enforcement is a source of force', ['RCE']) !== -1) {
  throw new Error('ASI05 RCE matching must not accept incidental substrings inside ordinary words');
}
if (findEarliestKeywordIndex('Unexpected Code Execution (RCE) is a named risk', ['RCE']) < 0) {
  throw new Error('ASI05 RCE matching must still accept a standalone acronym');
}
if (findEarliestKeywordIndex('model context protocol (MCP) and agent-to-agent (A2A)', ['MCP']) < 0
    || findEarliestKeywordIndex('model context protocol (MCP) and agent-to-agent (A2A)', ['A2A']) < 0) {
  throw new Error('ASI04 acronym matching must accept standalone MCP and A2A references');
}
if (findEarliestKeywordIndex('resource enforcement and dataA2Abased tokenization', ['A2A']) !== -1) {
  throw new Error('ASI04 A2A matching must not accept acronym-like substrings inside words');
}
if (findEarliestKeywordIndex('resource enforcement and A2A-like or resource-A2A tokens', ['A2A']) !== -1) {
  throw new Error('ASI04 A2A matching must not accept hyphenated compounds as standalone acronyms');
}

const approvedCuratedSourceUrls = [
  'https://www.nist.gov/itl/ai-risk-management-framework',
  'https://airc.nist.gov/airmf-resources/playbook/',
  'https://raw.githubusercontent.com/GenAI-Security-Project/translations/main/owasp-top-10-for-agentic-applications-2026-12-6-1/_source/ASI01_Agent_Goal_Hijack.md',
  'https://focus.finops.org/docs/specification/v1-4/',
];
for (const sourceUrl of approvedCuratedSourceUrls) {
  if (!isTrustedArchitectureSourceUrl(sourceUrl)) {
    throw new Error(`curated source hostname should be explicitly trusted: ${sourceUrl}`);
  }
}

const rejectedCuratedSourceUrls = [
  'http://www.nist.gov/itl/ai-risk-management-framework',
  'https://127.0.0.1/internal',
  'https://[::1]/internal',
  'https://169.254.169.254/latest/meta-data',
  'https://localhost/internal',
  'https://www.nist.gov.attacker.example/forged',
  'https://user:password@www.nist.gov/forged',
  'https://www.nist.gov:8443/forged',
  'file:///etc/passwd',
  'https://www.nist.gov/internal',
  'https://airc.nist.gov/another-document',
  'https://raw.githubusercontent.com/attacker/repo/main/payload',
  'https://www.nist.gov/itl/ai-risk-management-framework/../internal',
];
for (const sourceUrl of rejectedCuratedSourceUrls) {
  if (isTrustedArchitectureSourceUrl(sourceUrl)) {
    throw new Error(`unsafe or unapproved curated source URL was accepted: ${sourceUrl}`);
  }
}

const redirectSource = new URL('https://www.nist.gov/itl/ai-risk-management-framework');
const allowedRedirectTargets = [
  new URL('https://www.nist.gov/itl/ai-risk-management-framework/'),
  new URL('https://www.nist.gov/itl/ai-risk-management-framework'),
];
const etsiRedirectSource = new URL('https://www.etsi.org/technologies/multi-access-edge-computing');
const approvedEtsiCanonicalRedirect = new URL('https://www.etsi.org/technologies/ict-infrastructure-operations/');
for (const target of allowedRedirectTargets) {
  if (!isTrustedCuratedRedirectTarget(target, redirectSource)) {
    throw new Error(`same-source canonical redirect should be allowed: ${target.href}`);
  }
}
if (!isTrustedCuratedRedirectTarget(approvedEtsiCanonicalRedirect, etsiRedirectSource)) {
  throw new Error('the explicitly registered ETSI canonical path should be allowed only for its curated source');
}
const rejectedRedirectTargets = [
  new URL('https://www.nist.gov/internal'),
  new URL('https://www.nist.gov/itl/other-standard'),
  new URL('https://www.nist.gov:8443/itl/ai-risk-management-framework'),
  new URL('http://www.nist.gov/itl/ai-risk-management-framework'),
  new URL('https://attacker.example/itl/ai-risk-management-framework'),
  new URL('https://user:password@www.nist.gov/itl/ai-risk-management-framework'),
  new URL('https://www.nist.gov/internal'),
  new URL('https://www.nist.gov/itl/ai-risk-management-framework/../internal'),
  new URL('https://www.nist.gov/itl/ai-risk-management-framework?hl=en'),
  new URL('https://www.nist.gov/itl/ai-risk-management-framework?next=/internal'),
  new URL('https://www.nist.gov/itl/ai-risk-management-framework#section'),
];
for (const target of rejectedRedirectTargets) {
  if (isTrustedCuratedRedirectTarget(target, redirectSource)) {
    throw new Error(`unsafe curated source redirect target was accepted: ${target.href}`);
  }
}

if (isClaimSupportedEvidence('content-matched')) throw new Error('keyword match must not count as claim verification');
if (!isClaimSupportedEvidence('claim-supported')) throw new Error('claim-supported evidence state missing');
if (classifyArchitectureEvidence('content-matched') !== 'analysis') throw new Error('keyword matches must remain analysis');
if (classifyArchitectureEvidence('source-available') !== 'analysis') throw new Error('source availability must remain analysis');
if (classifyArchitectureEvidence('claim-supported') !== 'observed-fact') throw new Error('claim-supported evidence should be classified as observed fact');
if (isSourceObservationDue(24, new Date(0).toISOString(), 24 * 60 * 60 * 1000 - 1)) throw new Error('source cadence should reuse fresh observations');
if (!isSourceObservationDue(24, new Date(0).toISOString(), 24 * 60 * 60 * 1000)) throw new Error('source cadence should refresh expired observations');
const fixedNowMs = 1000;
const futureObservedAt = new Date(fixedNowMs + 1).toISOString();
if (!isSourceObservationDue(24, futureObservedAt, fixedNowMs)) throw new Error('future-dated source observations must force revalidation');
const validCacheMetadata = {
  status: 200,
  contentHash: 'a'.repeat(64),
  evidenceExcerpt: 'matching excerpt',
  evidenceStatus: 'content-matched',
};
const failedCacheMetadata = {
  status: 404,
  contentHash: 'b'.repeat(64),
  evidenceExcerpt: null,
  evidenceStatus: 'not-observed',
};
if (shouldReuseSourceObservation({ configuredUrl: 'https://example.org', cachedUrl: 'https://example.org', ok: true, ...validCacheMetadata, cadenceHours: 336, observedAt: futureObservedAt, nowMs: fixedNowMs })) throw new Error('future-dated observations must not be reused');
if (shouldReuseSourceObservation({ configuredUrl: 'https://example.org/new', cachedUrl: 'https://example.org/old', ok: true, ...validCacheMetadata, cadenceHours: 168, observedAt: new Date(0).toISOString(), nowMs: 1000 })) throw new Error('URL changes must invalidate cached source observations');
if (shouldReuseSourceObservation({ configuredUrl: 'https://example.org', cachedUrl: 'https://example.org', ok: false, ...failedCacheMetadata, cadenceHours: 336, observedAt: new Date(0).toISOString(), nowMs: 60 * 60 * 1000 })) throw new Error('failed source observations must retry after one hour');
if (!shouldReuseSourceObservation({ configuredUrl: 'https://example.org', cachedUrl: 'https://example.org', ok: false, ...failedCacheMetadata, cadenceHours: 336, observedAt: new Date(0).toISOString(), nowMs: 30 * 60 * 1000 })) throw new Error('failed source observations should remain cached before retry interval');
if (stripHtml('<main>  alpha &amp; beta </main>') !== 'alpha and beta') throw new Error('HTML normalization failed');

const cachedObservation = {
  observed_at: new Date(0).toISOString(),
  ok: true,
  status: 200,
  content_hash: 'a'.repeat(64),
  evidence_excerpt: 'Exact cached excerpt',
  evidence_status: 'content-matched' as const,
  final_url: 'https://example.org/architecture',
  etag: '"v1"',
  last_modified: 'Tue, 01 Jan 2030 00:00:00 GMT',
  source_url: 'https://example.org/architecture',
};
const conditionalHeaders = buildConditionalRequestHeaders(cachedObservation.source_url, cachedObservation);
if (conditionalHeaders['If-None-Match'] !== '"v1"' || conditionalHeaders['If-Modified-Since'] !== cachedObservation.last_modified) {
  throw new Error('valid cached validators must be sent as conditional request headers');
}
if (Object.keys(buildConditionalRequestHeaders('https://example.org/changed', cachedObservation)).length !== 0) {
  throw new Error('URL changes must suppress conditional request headers');
}
const failedHttpCache = {
  ...cachedObservation,
  ok: false,
  status: 404,
  evidence_excerpt: null,
  evidence_status: 'not-observed' as const,
};
if (Object.keys(buildConditionalRequestHeaders(cachedObservation.source_url, failedHttpCache)).length !== 0) {
  throw new Error('failed cached observations must not be used for conditional requests');
}
if (reuseNotModifiedSourceObservation(
  { id: 'test-source', url: cachedObservation.source_url },
  failedHttpCache,
  { finalUrl: cachedObservation.source_url, etag: '"v2"', lastModified: null },
  new Date(1000).toISOString(),
  1000,
) !== null) throw new Error('304 revalidation must not promote a failed source observation');
const forgedClaimSupportedCache = { ...cachedObservation, evidence_status: 'claim-supported' as const };
if (Object.keys(buildConditionalRequestHeaders(cachedObservation.source_url, forgedClaimSupportedCache)).length !== 0) {
  throw new Error('claim-supported cache records must not seed conditional source requests');
}
if (shouldReuseSourceObservation({
  configuredUrl: cachedObservation.source_url,
  cachedUrl: forgedClaimSupportedCache.source_url,
  ok: forgedClaimSupportedCache.ok,
  status: forgedClaimSupportedCache.status,
  contentHash: forgedClaimSupportedCache.content_hash,
  evidenceExcerpt: forgedClaimSupportedCache.evidence_excerpt,
  evidenceStatus: forgedClaimSupportedCache.evidence_status,
  cadenceHours: 336,
  observedAt: forgedClaimSupportedCache.observed_at,
  nowMs: 1000,
})) throw new Error('cached source retrieval must never promote claim-supported evidence');
if (reuseNotModifiedSourceObservation(
  { id: 'test-source', url: cachedObservation.source_url },
  forgedClaimSupportedCache,
  { finalUrl: cachedObservation.source_url, etag: '"v2"', lastModified: null },
  new Date(1000).toISOString(),
  1000,
) !== null) throw new Error('304 revalidation must reject claim-supported cache records');
const malformedContentMatchCache = { ...cachedObservation, evidence_excerpt: '   ' };
if (Object.keys(buildConditionalRequestHeaders(cachedObservation.source_url, malformedContentMatchCache)).length !== 0) {
  throw new Error('content-matched cache records require a non-empty evidence excerpt');
}
const futureCachedObservation = { ...cachedObservation, observed_at: futureObservedAt };
const futureFetchContext = createSourceFetchContext(cachedObservation.source_url, futureCachedObservation, fixedNowMs);
if (futureFetchContext.nowMs !== fixedNowMs || Date.parse(futureFetchContext.observedAt) !== fixedNowMs) {
  throw new Error('source fetch context must retain one deterministic clock snapshot');
}
if (Object.keys(futureFetchContext.conditionalHeaders).length !== 0) {
  throw new Error('future-dated cached observations must not seed source fetch conditional headers');
}
const revalidated = reuseNotModifiedSourceObservation(
  { id: 'test-source', url: cachedObservation.source_url },
  cachedObservation,
  { finalUrl: cachedObservation.source_url, etag: '"v2"', lastModified: null },
  new Date(1000).toISOString(),
);
if (!revalidated || revalidated.status !== 304 || revalidated.contentHash !== cachedObservation.content_hash || revalidated.evidenceExcerpt !== cachedObservation.evidence_excerpt || revalidated.evidenceStatus !== 'content-matched') {
  throw new Error('304 response must preserve the exact cached evidence and content hash');
}
if (reuseNotModifiedSourceObservation(
  { id: 'test-source', url: 'https://example.org/changed' },
  cachedObservation,
  { finalUrl: 'https://example.org/changed', etag: null, lastModified: null },
  new Date(1000).toISOString(),
) !== null) throw new Error('304 response must not reuse evidence after source URL changes');
if (reuseNotModifiedSourceObservation(
  { id: 'test-source', url: cachedObservation.source_url },
  null,
  { finalUrl: cachedObservation.source_url, etag: null, lastModified: null },
  new Date(1000).toISOString(),
) !== null) throw new Error('304 response without cached evidence must remain unverified');
if (reuseNotModifiedSourceObservation(
  { id: 'test-source', url: cachedObservation.source_url },
  futureCachedObservation,
  { finalUrl: cachedObservation.source_url, etag: '"v2"', lastModified: null },
  futureFetchContext.observedAt,
  futureFetchContext.nowMs,
) !== null) throw new Error('304 response must not reuse future-dated cached evidence under the fetch clock snapshot');

if (model.version !== 'GEAS-ARCHITECTURE-SCIENTIST-2.0') throw new Error('GEAS version mismatch');
if (model.sourcePolicyVersion !== 'GEAS-AUTHORITY-2') throw new Error('GEAS source policy version must match the authoritative registry');
if (model.drift.some((finding) => finding.status !== 'unknown' || finding.evidenceRefs.length !== 0)) throw new Error('baseline drift must remain UNKNOWN without runtime evidence');
const requiredDomains: ArchitectureDomain[] = [
  'enterprise-architecture', 'cloud', 'ai', 'data', 'cybersecurity', 'networking',
  'software', 'platform-engineering', 'observability', 'reliability', 'finops',
  'iot', 'edge', 'blockchain', 'integration', 'governance', 'emerging-technology',
];
for (const domain of requiredDomains) {
  if (!model.domains.includes(domain)) throw new Error(`authoritative source coverage missing for domain: ${domain}`);
}

const coverageObservedAt = '2026-11-02T01:00:00.000Z';
const coverageObservation = (
  sourceId: string,
  ok: boolean,
  evidenceStatus: SourceObservation['evidenceStatus'],
): SourceObservation => ({
  sourceId,
  ok,
  status: ok ? 200 : 503,
  contentHash: ok ? 'a'.repeat(64) : null,
  observedAt: coverageObservedAt,
  evidenceExcerpt: evidenceStatus === 'content-matched' ? 'A source excerpt.' : null,
  evidenceStatus,
});
const unavailableCloudCoverage = getArchitectureDomainCoverage('cloud', [
  coverageObservation('aws-well-architected', false, 'unavailable'),
  coverageObservation('google-architecture', false, 'unavailable'),
], []);
if (unavailableCloudCoverage.status !== 'source-unavailable'
    || unavailableCloudCoverage.sources !== 2
    || unavailableCloudCoverage.availableSources !== 0
    || unavailableCloudCoverage.unavailableSources !== 2) {
  throw new Error('all failed source attempts must be reported as source-unavailable');
}
const analysisCloudPattern: ArchitecturePattern = {
  id: 'test-cloud-pattern',
  title: 'Cloud discovery pattern',
  domain: 'cloud',
  evidenceClass: 'analysis',
  sourceId: 'aws-well-architected',
  evidenceUrl: 'https://aws.amazon.com/architecture/well-architected/',
  evidenceExcerpt: 'A source excerpt.',
  pattern: 'A candidate architecture pattern.',
  GLORIFIERMapping: 'Test-only mapping.',
  controlIds: [],
  lastReviewed: coverageObservedAt,
};
const mixedCloudCoverage = getArchitectureDomainCoverage('cloud', [
  coverageObservation('aws-well-architected', true, 'content-matched'),
  coverageObservation('google-architecture', false, 'unavailable'),
], [analysisCloudPattern]);
if (mixedCloudCoverage.status !== 'discovery-covered'
    || mixedCloudCoverage.sources !== 2
    || mixedCloudCoverage.availableSources !== 1
    || mixedCloudCoverage.unavailableSources !== 1
    || mixedCloudCoverage.discoveredPatterns !== 1
    || mixedCloudCoverage.analysisPatterns !== 1
    || mixedCloudCoverage.claimSupportedPatterns !== 0) {
  throw new Error('keyword-derived patterns must remain explicitly analysis, not claim-supported coverage');
}
const claimSupportedCloudCoverage = getArchitectureDomainCoverage('cloud', [
  coverageObservation('aws-well-architected', true, 'content-matched'),
], [{ ...analysisCloudPattern, evidenceClass: 'observed-fact' }]);
if (claimSupportedCloudCoverage.claimSupportedPatterns !== 1
    || claimSupportedCloudCoverage.analysisPatterns !== 0) {
  throw new Error('claim-supported patterns must be counted separately from analysis patterns');
}
const noPatternCloudCoverage = getArchitectureDomainCoverage('cloud', [
  coverageObservation('aws-well-architected', true, 'source-available'),
], []);
if (noPatternCloudCoverage.status !== 'no-discovered-pattern') {
  throw new Error('an available source without a matching pattern must not be reported as discovery-covered');
}
if (model.sources.some((source) => source.id === 'owasp-agentic-applications-top10')) {
  throw new Error('the OWASP landing page must remain discovery-only until its content can support risk-level extraction');
}
const agenticRisks = [
  { sourceId: 'owasp-agentic-asi01', patternId: 'owasp-agentic-asi01', claimType: 'agent-goal-hijack' },
  { sourceId: 'owasp-agentic-asi02', patternId: 'owasp-agentic-asi02', claimType: 'agent-tool-misuse' },
  { sourceId: 'owasp-agentic-asi03', patternId: 'owasp-agentic-asi03', claimType: 'agent-identity-privilege-abuse' },
  { sourceId: 'owasp-agentic-asi04', patternId: 'owasp-agentic-asi04', claimType: 'agentic-supply-chain-vulnerabilities' },
  { sourceId: 'owasp-agentic-asi05', patternId: 'owasp-agentic-asi05', claimType: 'unexpected-code-execution' },
  { sourceId: 'owasp-agentic-asi06', patternId: 'owasp-agentic-asi06', claimType: 'agent-memory-context-poisoning' },
  { sourceId: 'owasp-agentic-asi07', patternId: 'owasp-agentic-asi07', claimType: 'insecure-inter-agent-communication' },
  { sourceId: 'owasp-agentic-asi08', patternId: 'owasp-agentic-asi08', claimType: 'agent-cascading-failures' },
  { sourceId: 'owasp-agentic-asi09', patternId: 'owasp-agentic-asi09', claimType: 'human-agent-trust-exploitation' },
  { sourceId: 'owasp-agentic-asi10', patternId: 'owasp-agentic-asi10', claimType: 'rogue-agent-behavior' },
];
for (const risk of agenticRisks) {
  const source = model.sources.find((candidate) => candidate.id === risk.sourceId);
  const pattern = model.patterns.find((candidate) => candidate.id === risk.patternId);
  if (!source || source.cadenceHours !== 336 || !source.patternIds.includes(risk.patternId)) {
    throw new Error(`OWASP ${risk.patternId} must have an active 14-day source entry`);
  }
  if (!pattern || pattern.sourceId !== risk.sourceId || pattern.domain !== 'cybersecurity') {
    throw new Error(`OWASP ${risk.patternId} must be linked to its dedicated cybersecurity source`);
  }
  if (!pattern.keywords.length || !pattern.controlIds.length) {
    throw new Error(`OWASP ${risk.patternId} must have explicit extraction terms and GEAS control mappings`);
  }
}
const authoritativeRegistry = JSON.parse(readFileSync(
  new URL('../../../docs/architecture/geas-authoritative-source-registry.json', import.meta.url),
  'utf8',
)) as {
  sources: Array<{ id: string; scannerStatus: string; claimsAllowed: string[] }>;
};
const discoveryEntry = authoritativeRegistry.sources.find((entry) => entry.id === 'owasp-agentic-applications-top10');
if (!discoveryEntry
    || discoveryEntry.scannerStatus !== 'discovery-only'
    || discoveryEntry.claimsAllowed.length !== 1
    || discoveryEntry.claimsAllowed[0] !== 'agentic-application-threats-discovery') {
  throw new Error('OWASP landing-page registry entry must allow only discovery-level claims');
}
for (const risk of agenticRisks) {
  const authorizedSources = authoritativeRegistry.sources.filter((entry) => entry.claimsAllowed.includes(risk.claimType));
  if (authorizedSources.length !== 1
      || authorizedSources[0]?.id !== risk.sourceId
      || authorizedSources[0]?.scannerStatus !== 'active') {
    throw new Error(`registry must allow ${risk.claimType} only via active source ${risk.sourceId}`);
  }
}
if (classifyArchitectureEvidence('content-matched') !== 'analysis') {
  throw new Error('OWASP source keyword matches must remain analysis, not verified implementation');
}
const governanceSource = model.sources.find((source) => source.id === 'nist-ai-rmf-playbook');
const governancePattern = model.patterns.find((pattern) => pattern.id === 'ai-governance-lifecycle');
if (!governanceSource || governanceSource.url !== 'https://airc.nist.gov/airmf-resources/playbook/' || governanceSource.cadenceHours !== 720 || !governanceSource.patternIds.includes('ai-governance-lifecycle')) {
  throw new Error('NIST AI RMF Playbook must be registered as an active 30-day governance source');
}
if (!governancePattern || governancePattern.domain !== 'governance' || governancePattern.sourceId !== 'nist-ai-rmf-playbook') {
  throw new Error('NIST AI RMF governance pattern must be linked to the governance domain and authoritative source');
}
if (!model.architectureStateModel.join(',').includes('desired,declared,deployed,observed,verified')) throw new Error('five-state architecture model missing');

const identity = createAgentIdentityContract({
  subject: 'test-agent',
  scope: ['read:architecture'],
  delegatedFrom: 'human-owner',
  audience: 'geas'
});
if (identity.identityType !== 'agent' || identity.scope.length !== 1) throw new Error('agent identity contract invalid');

const token = createTokenLifecycleContract({
  issuer: 'test',
  audience: 'geas',
  scope: ['read'],
  issuedAt: new Date(0).toISOString(),
  expiresAt: new Date(60000).toISOString()
});
if (!token.verificationRequired || !token.replayProtectionRequired) throw new Error('token lifecycle controls missing');

const pkg = createGovernedActionEvidencePackage({
  actorIdentity: 'test-agent',
  authorityRef: 'human-owner',
  capability: 'architecture-review',
  policyDecisionRef: 'policy-1',
  executionIdentity: 'execution-1',
  evidenceRefs: ['evidence-1']
});
if (!/^[a-f0-9]{64}$/.test(pkg.actionHash)) throw new Error('action hash invalid');
if (pkg.verificationStatus !== 'UNKNOWN') throw new Error('unverified action must remain UNKNOWN');
if (model.operatingRule.includes('autonomously apply irreversible production changes') === false) throw new Error('irreversible-change guard missing');


const nullStatusNotObserved = { ...failedCacheMetadata, status: null };
if (shouldReuseSourceObservation({
  configuredUrl: 'https://example.org',
  cachedUrl: 'https://example.org',
  ok: false,
  ...nullStatusNotObserved,
  cadenceHours: 336,
  observedAt: new Date(0).toISOString(),
  nowMs: 30 * 60 * 1000,
})) throw new Error('not-observed cache records with a null HTTP status must be rejected');

const revalidatedCacheRow = {
  ...cachedObservation,
  status: 304,
  observed_at: new Date(1000).toISOString(),
};
if (!shouldReuseSourceObservation({
  configuredUrl: revalidatedCacheRow.source_url,
  cachedUrl: revalidatedCacheRow.source_url,
  ok: true,
  status: revalidatedCacheRow.status,
  contentHash: revalidatedCacheRow.content_hash,
  evidenceExcerpt: revalidatedCacheRow.evidence_excerpt,
  evidenceStatus: revalidatedCacheRow.evidence_status,
  cadenceHours: 336,
  observedAt: revalidatedCacheRow.observed_at,
  nowMs: 1000 + 60 * 1000,
})) throw new Error('a fresh, previously revalidated 304 cache row must be reusable within cadence');


const invalidSourceObservationTimestamps = [
  '01/01/1970 00:00:00',
  '1970-01-01T00:00:00',
  '1970-01-01 00:00:00Z',
  '1970-01-01T00:00:00-00:00',
  '1970-02-30T00:00:00Z',
];
for (const observedAt of invalidSourceObservationTimestamps) {
  if (!isSourceObservationDue(24, observedAt, 1000)) {
    throw new Error(`non-canonical or impossible source timestamps must force a fresh fetch: ${observedAt}`);
  }
}
if (isSourceObservationDue(24, '1970-01-01T02:00:00+02:00', 1000)) {
  throw new Error('valid explicit-offset source timestamps must remain reusable within cadence');
}
if (isSourceObservationDue(24, '1970-01-01T00:00:00.123Z', 1000)) {
  throw new Error('valid millisecond-precision source timestamps must remain reusable within cadence');
}
const postgresDateObservation = new Date(0);
if (isSourceObservationDue(24, postgresDateObservation as unknown as string, 1000)) {
  throw new Error('valid Date values returned for persisted PostgreSQL TIMESTAMPTZ observations must remain reusable');
}
if (!isSourceObservationDue(24, new Date(Number.NaN) as unknown as string, 1000)) {
  throw new Error('invalid Date values must force source revalidation');
}
if (!isSourceObservationDue(24, new Date(0).toISOString(), Number.NaN)) {
  throw new Error('an invalid source-observation clock must force a fresh fetch');
}

const malformedTimestampCache = {
  ...cachedObservation,
  observed_at: '01/01/1970 00:00:00',
};
if (shouldReuseSourceObservation({
  configuredUrl: malformedTimestampCache.source_url,
  cachedUrl: malformedTimestampCache.source_url,
  ok: true,
  status: malformedTimestampCache.status,
  contentHash: malformedTimestampCache.content_hash,
  evidenceExcerpt: malformedTimestampCache.evidence_excerpt,
  evidenceStatus: malformedTimestampCache.evidence_status,
  cadenceHours: 336,
  observedAt: malformedTimestampCache.observed_at,
  nowMs: 1000,
})) throw new Error('ambiguous cached timestamps must never satisfy source cadence');

if (Object.keys(buildConditionalRequestHeaders(
  cachedObservation.source_url,
  malformedTimestampCache,
  1000,
)).length !== 0) {
  throw new Error('ambiguous cached timestamps must not seed conditional requests');
}
if (Object.keys(buildConditionalRequestHeaders(
  cachedObservation.source_url,
  cachedObservation,
  Number.NaN,
)).length !== 0) {
  throw new Error('an invalid clock must suppress conditional request headers');
}
if (reuseNotModifiedSourceObservation(
  { id: 'test-source', url: cachedObservation.source_url },
  malformedTimestampCache,
  { finalUrl: cachedObservation.final_url, etag: '"v2"', lastModified: null },
  new Date(1000).toISOString(),
  1000,
) !== null) throw new Error('304 revalidation must reject ambiguous cached timestamps');

if (reuseNotModifiedSourceObservation(
  { id: 'test-source', url: cachedObservation.source_url },
  cachedObservation,
  { finalUrl: cachedObservation.final_url, etag: '"v2"', lastModified: null },
  new Date(-1000).toISOString(),
  1000,
) !== null) throw new Error('304 revalidation must not move observation time backwards');
if (reuseNotModifiedSourceObservation(
  { id: 'test-source', url: cachedObservation.source_url },
  cachedObservation,
  { finalUrl: cachedObservation.final_url, etag: '"v2"', lastModified: null },
  new Date(1000).toISOString(),
  Number.NaN,
) !== null) throw new Error('304 revalidation must reject a non-finite validation clock');

let invalidFetchClockRejected = false;
try {
  createSourceFetchContext(cachedObservation.source_url, cachedObservation, Number.NaN);
} catch (error) {
  invalidFetchClockRejected = error instanceof TypeError && /finite timestamp/.test(error.message);
}
if (!invalidFetchClockRejected) throw new Error('source fetch context must reject a non-finite clock explicitly');

console.log('GEAS architecture scientist refinement tests passed');
  assertionsCompleted = true;
});

test('existing assertions completed in setup hook', () => {
  assert.ok(assertionsCompleted, 'existing assertions completed before the test case');
});
