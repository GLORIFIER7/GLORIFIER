import { createGovernedActionEvidencePackage, createAgentIdentityContract, createTokenLifecycleContract, getGeasArchitectureModel, isClaimSupportedEvidence, classifyArchitectureEvidence, isSourceObservationDue, shouldReuseSourceObservation, buildConditionalRequestHeaders, createSourceFetchContext, reuseNotModifiedSourceObservation, stripHtml } from './geas-architecture-scientist';

const model = getGeasArchitectureModel();

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
const requiredDomains = [
  'enterprise-architecture', 'cloud', 'ai', 'data', 'cybersecurity', 'networking',
  'software', 'platform-engineering', 'observability', 'reliability', 'finops',
  'iot', 'edge', 'blockchain', 'integration', 'governance', 'emerging-technology',
];
for (const domain of requiredDomains) {
  if (!model.domains.includes(domain)) throw new Error('authoritative source coverage missing for domain: ' + domain);
}
const agenticSource = model.sources.find((source) => source.id === 'owasp-agentic-applications-top10');
const agenticPattern = model.patterns.find((pattern) => pattern.id === 'agentic-application-threats');
if (!agenticSource || agenticSource.url !== 'https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/' || agenticSource.cadenceHours !== 336 || !agenticSource.patternIds.includes('agentic-application-threats')) {
  throw new Error('canonical OWASP 2026 Agentic Top 10 source must be active with the 14-day review cadence');
}
if (!agenticPattern || agenticPattern.sourceId !== 'owasp-agentic-applications-top10') {
  throw new Error('OWASP Agentic Top 10 threat pattern must be linked to its authoritative source');
}
for (const controlId of ['SEC-01', 'AUTH-01', 'POL-01', 'SUPPLY-01', 'REL-01', 'OBS-01', 'GOV-01', 'EVID-01', 'FED-01']) {
  if (!agenticPattern.controlIds.includes(controlId)) throw new Error('agentic threat pattern missing control mapping: ' + controlId);
}
if (classifyArchitectureEvidence('content-matched') !== 'analysis') {
  throw new Error('OWASP source keyword matches must remain analysis, not verified implementation');
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

console.log('GEAS architecture scientist refinement tests passed');
