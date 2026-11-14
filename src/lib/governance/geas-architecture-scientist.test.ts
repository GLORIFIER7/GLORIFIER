import { createHash } from 'node:crypto';
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
  buildArchitectureEvidence,
  buildObservedArchitecturePatterns,
  createSourceFetchContext,
  reuseNotModifiedSourceObservation,
  stripHtml,
  stripHtmlForEvidence,
  isTrustedArchitectureSourceUrl,
  isTrustedCuratedRedirectTarget,
  formatCuratedRedirectTargetDiagnostic,
  findEarliestKeywordIndex,
  getSourcePatternKeywords,
  type ArchitectureDomain,
  type ArchitecturePattern,
  type SourceObservation,
  type ClaimSupportAuthenticator,
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
const googleBigQuerySource = model.sources.find((source) => source.id === 'google-bigquery-external-data-sources');
if (!googleBigQuerySource
    || googleBigQuerySource.url !== 'https://docs.cloud.google.com/bigquery/docs/external-data-sources'
    || googleBigQuerySource.cadenceHours !== 336
    || !googleBigQuerySource.patternIds.includes('federated-data-access')
    || !googleBigQuerySource.claimsAllowed.includes('federated-data-access')) {
  throw new Error('Google BigQuery external-data source must be registered with an exact URL, 14-day cadence and explicit federated-data association');
}
const googleArchitectureKeywords = getSourcePatternKeywords('google-architecture');
const googleArchitectureNavigation = 'Google Cloud Architecture Center | Data analytics and pipelines | Access and resources management';
if (googleArchitectureKeywords.includes('data')
    || googleArchitectureKeywords.includes('access')
    || googleArchitectureKeywords.includes('architecture')
    || findEarliestKeywordIndex(googleArchitectureNavigation, googleArchitectureKeywords) >= 0) {
  throw new Error('Google Cloud Well-Architected source matching must not use generic navigation terms');
}
const googleFederationKeywords = getSourcePatternKeywords('google-bigquery-external-data-sources');
const googleFederationText = 'Introduction to external data sources | BigQuery. BigQuery can query data directly without first migrating it. BigLake tables use access delegation and federated queries.';
const googleFederationMatch = findEarliestKeywordIndex(googleFederationText, googleFederationKeywords);
if (!googleFederationKeywords.includes('without first migrating')
    || !googleFederationKeywords.includes('access delegation')
    || googleFederationKeywords.includes('federated queries')
    || googleFederationKeywords.includes('external data sources')
    || googleFederationMatch !== googleFederationText.indexOf('without first migrating')) {
  throw new Error('Google secondary-source matching must select substantive federation guidance rather than a generic page title');
}
const googleSecondaryObservation: SourceObservation = {
  sourceId: 'google-bigquery-external-data-sources',
  ok: true,
  status: 200,
  contentHash: 'a'.repeat(64),
  observedAt: '2026-11-14T03:00:00.000Z',
  finalUrl: 'https://docs.cloud.google.com/bigquery/docs/external-data-sources',
  evidenceExcerpt: 'BigQuery can query data directly without first migrating it. BigLake tables use access delegation.',
  evidenceStatus: 'content-matched',
};
const googleSecondaryPattern = buildObservedArchitecturePatterns(
  [googleSecondaryObservation],
  googleSecondaryObservation.observedAt,
).find((pattern) => pattern.id === 'federated-data-access');
if (!googleSecondaryPattern
    || googleSecondaryPattern.sourceId !== 'google-bigquery-external-data-sources'
    || googleSecondaryPattern.evidenceClass !== 'analysis') {
  throw new Error('a content-matched curated secondary source must preserve its analysis pattern when the primary source is unavailable');
}
const googlePrimaryObservation: SourceObservation = {
  ...googleSecondaryObservation,
  sourceId: 'google-architecture',
  finalUrl: 'https://docs.cloud.google.com/architecture/framework',
  evidenceExcerpt: 'Primary Google Cloud architecture guidance for federated data access.',
};
const googlePrimaryPreferred = buildObservedArchitecturePatterns(
  [googleSecondaryObservation, googlePrimaryObservation],
  googleSecondaryObservation.observedAt,
).find((pattern) => pattern.id === 'federated-data-access');
if (googlePrimaryPreferred?.sourceId !== 'google-architecture') {
  throw new Error('the primary curated source must remain preferred when its content-matched evidence is available');
}
const googleSourceAvailableOnly: SourceObservation = {
  ...googleSecondaryObservation,
  evidenceExcerpt: null,
  evidenceStatus: 'source-available',
};
if (buildObservedArchitecturePatterns(
  [googleSourceAvailableOnly],
  googleSourceAvailableOnly.observedAt,
).some((pattern) => pattern.id === 'federated-data-access')) {
  throw new Error('source availability alone must never instantiate a secondary-source architecture pattern');
}

const nistAiAgentsSource = model.sources.find((source) => source.id === 'nist-ai-agents');
if (nistAiAgentsSource?.url !== 'https://www.nist.gov/super-intelligence/si-agent-standards-initiative') {
  throw new Error('NIST AI Agent Standards Initiative must use the current canonical SI Agent Standards Initiative URL');
}

const nistAgentIdentityTenetsSource = model.sources.find((source) => source.id === 'nist-agent-identity-design-tenets');
if (!nistAgentIdentityTenetsSource
    || nistAgentIdentityTenetsSource.url !== 'https://www.nist.gov/blogs/cybersecurity-insights/design-tenets-agent-identity-management-systems'
    || nistAgentIdentityTenetsSource.cadenceHours !== 336
    || !nistAgentIdentityTenetsSource.patternIds.includes('agent-identity-delegation')
    || !nistAgentIdentityTenetsSource.claimsAllowed.includes('agent-identity-delegation')) {
  throw new Error('NIST Agent Identity Design Tenets must be registered at its canonical URL with a 14-day cadence and explicit source-policy association');
}
const nistIdentityTenetKeywords = getSourcePatternKeywords('nist-agent-identity-design-tenets');
const nistIdentityTenetText = 'Agent Identity Management Systems | NIST. Distinct Agent Identification requires cryptographically verifiable agent identity.';
const nistIdentityTenetMatch = findEarliestKeywordIndex(nistIdentityTenetText, nistIdentityTenetKeywords);
if (!nistIdentityTenetKeywords.includes('Distinct Agent Identification')
    || nistIdentityTenetKeywords.includes('agent')
    || nistIdentityTenetMatch !== nistIdentityTenetText.indexOf('Distinct Agent Identification')) {
  throw new Error('NIST secondary-source matching must select substantive design-tenet text rather than generic page chrome');
}
if (classifyArchitectureEvidence('content-matched') !== 'analysis') {
  throw new Error('NIST content matches must remain analysis and must not become claim-supported facts');
}

const owaspAgentControlSource = model.sources.find((source) => source.id === 'owasp-agent-control');
if (owaspAgentControlSource?.url !== 'https://owaspacs.org/docs/acs/') {
  throw new Error('OWASP Agent Control Standard must use its canonical specification documentation');
}

const otelGenAiAgentSource = model.sources.find((source) => source.id === 'otel-genai-agents');
if (otelGenAiAgentSource?.url !== 'https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-agent-spans.md') {
  throw new Error('OpenTelemetry GenAI agent source must target the canonical agent-span specification');
}
const otelAgentKeywords = getSourcePatternKeywords('otel-genai-agents');
const otelAgentSpecExcerpt = 'Status: Development. Describes an in-process GenAI agent, workflow, or framework entrypoint invocation.';
if (otelAgentKeywords.length !== 1
    || otelAgentKeywords[0] !== 'Describes an in-process GenAI agent'
    || findEarliestKeywordIndex(otelAgentSpecExcerpt, otelAgentKeywords)
      !== otelAgentSpecExcerpt.indexOf('Describes an in-process GenAI agent')
    || !isTrustedArchitectureSourceUrl('https://raw.githubusercontent.com/open-telemetry/semantic-conventions-genai/main/docs/gen-ai/gen-ai-agent-spans.md')) {
  throw new Error('OpenTelemetry agent-span evidence must use the raw authoritative specification and substantive source-specific matching');
}
const focus15Source = model.sources.find((source) => source.id === 'finops-focus-1-5-release-scope');
if (focus15Source?.url !== 'https://focus.finops.org/focus-1-5-release-scope/' || focus15Source.cadenceHours !== 168) {
  throw new Error('FOCUS 1.5 roadmap source must use its canonical URL and a seven-day review cadence');
}
const focus15Pattern = model.patterns.find((pattern) => pattern.id === 'focus-1-5-ai-cost-attribution');
if (focus15Pattern?.sourceId !== 'finops-focus-1-5-release-scope'
    || !focus15Pattern.pattern.toLowerCase().includes('working draft')
    || !focus15Pattern.GLORIFIERMapping.includes('FOCUS 1.4')
    || !focus15Pattern.GLORIFIERMapping.includes('ratified')) {
  throw new Error('FOCUS 1.5 must remain forward-looking analysis until ratified; FOCUS 1.4 remains the current contract');
}

const natsJetStreamSource = model.sources.find((source) => source.id === 'nats-jetstream');
if (!natsJetStreamSource
    || natsJetStreamSource.url !== 'https://docs.nats.io/concepts/jetstream'
    || natsJetStreamSource.cadenceHours !== 336
    || !natsJetStreamSource.patternIds.includes('durable-agent-messaging')) {
  throw new Error('NATS JetStream must use its exact official documentation URL and a 14-day source cadence');
}
const natsMessagingPattern = model.patterns.find((pattern) => pattern.id === 'durable-agent-messaging');
if (!natsMessagingPattern
    || natsMessagingPattern.sourceId !== 'nats-jetstream'
    || natsMessagingPattern.domain !== 'integration'
    || !natsMessagingPattern.GLORIFIERMapping.includes('Analysis only')
    || !natsMessagingPattern.GLORIFIERMapping.includes('does not prove NATS is deployed')) {
  throw new Error('NATS messaging must remain an analysis-only pattern and must not imply GLORIFIER deployment');
}
const rfc9111Source = model.sources.find((source) => source.id === 'ietf-rfc9111-http-caching');
if (!rfc9111Source
    || rfc9111Source.url !== 'https://www.rfc-editor.org/rfc/rfc9111.html'
    || rfc9111Source.cadenceHours !== 336
    || !rfc9111Source.patternIds.includes('conditional-http-cache-validation')) {
  throw new Error('RFC 9111 must use its exact official URL, a 14-day cadence, and the cache-validation pattern association');
}
const conditionalCachePattern = model.patterns.find((pattern) => pattern.id === 'conditional-http-cache-validation');
if (!conditionalCachePattern) {
  throw new Error('RFC 9111 conditional cache-validation pattern is missing from the GEAS model');
}
const conditionalCachePatternFailures = [
  conditionalCachePattern.sourceId === 'ietf-rfc9111-http-caching' ? null : `sourceId=${conditionalCachePattern.sourceId}`,
  conditionalCachePattern.domain === 'integration' ? null : `domain=${conditionalCachePattern.domain}`,
  conditionalCachePattern.pattern.includes('If-None-Match') ? null : 'pattern lacks If-None-Match',
  conditionalCachePattern.GLORIFIERMapping.includes('Analysis only') ? null : 'mapping lacks Analysis only',
  conditionalCachePattern.GLORIFIERMapping.includes('does not prove production cache conformance') ? null : `mapping=${conditionalCachePattern.GLORIFIERMapping}`,
].filter((failure): failure is string => failure !== null);
if (conditionalCachePatternFailures.length > 0) {
  throw new Error(`RFC 9111 cache-validation pattern assertions failed: ${conditionalCachePatternFailures.join('; ')}`);
}
if (classifyArchitectureEvidence('content-matched') !== 'analysis') {
  throw new Error('NATS source keyword matches must remain analysis, not claim verification');
}

const declaredPatternIds = new Set(model.patterns.map((pattern) => pattern.id));
for (const source of model.sources) {
  for (const patternId of source.patternIds) {
    if (!declaredPatternIds.has(patternId)) {
      throw new Error(`source ${source.id} declares an unknown architecture pattern: ${patternId}`);
    }
  }
}
for (const pattern of model.patterns) {
  const primarySource = model.sources.find((source) => source.id === pattern.sourceId);
  if (!primarySource?.patternIds.includes(pattern.id)) {
    throw new Error(`pattern ${pattern.id} is not declared by its primary source ${pattern.sourceId}`);
  }
}

const awsEvidence = buildArchitectureEvidence([{
  sourceId: 'aws-well-architected',
  ok: true,
  status: 200,
  contentHash: 'a'.repeat(64),
  observedAt: '2026-11-12T00:00:00.000Z',
  evidenceExcerpt: 'Test-only source excerpt.',
  evidenceStatus: 'content-matched',
}]);
if (awsEvidence.length !== 1) throw new Error('content-matched AWS source must produce one evidence record');
assert.deepEqual(
  awsEvidence[0].patternIds,
  ['cross-cutting-cloud-controls', 'durable-agent-execution'],
  'evidence records must preserve every source-declared pattern association',
);
if (awsEvidence[0].evidenceClass !== 'analysis') {
  throw new Error('source-to-pattern linkage must not promote content matches to observed facts');
}

const microsoftEvidence = buildArchitectureEvidence([{
  sourceId: 'microsoft-architecture',
  ok: true,
  status: 200,
  contentHash: 'b'.repeat(64),
  observedAt: '2026-11-12T00:00:00.000Z',
  evidenceExcerpt: 'Test-only source excerpt.',
  evidenceStatus: 'content-matched',
}]);
assert.deepEqual(
  microsoftEvidence[0]?.patternIds,
  ['cross-cutting-cloud-controls'],
  'secondary source associations must be retained even when the pattern has another primary source',
);

const availabilityOnlyEvidence = buildArchitectureEvidence([{
  sourceId: 'microsoft-architecture',
  ok: true,
  status: 200,
  contentHash: 'c'.repeat(64),
  observedAt: '2026-11-12T00:00:00.000Z',
  evidenceExcerpt: null,
  evidenceStatus: 'source-available',
}]);
if (availabilityOnlyEvidence.length !== 0) {
  throw new Error('source availability alone must not create architecture evidence records');
}

const claimSupportExcerpt = 'Test-only source excerpt.';
const claimSupportObservedAt = '2026-11-13T03:00:00.000Z';
const claimSupportNowMs = Date.parse('2026-11-13T03:01:00.000Z');
const claimSupportContentHash = 'd'.repeat(64);
const claimSupportAttestation = {
  evidenceRef: `claim-review-${'e'.repeat(24)}`,
  claimId: 'claim-geas-test-1',
  claimType: 'cross-cutting-cloud-controls',
  patternId: 'cross-cutting-cloud-controls',
  sourceId: 'aws-well-architected',
  sourceRegistryVersion: 'GEAS-AUTHORITY-2',
  sourceContentHash: claimSupportContentHash,
  supportingExcerptHash: createHash('sha256').update(claimSupportExcerpt).digest('hex'),
  reviewerIdentityRef: 'identity:authenticated-reviewer-1',
  semanticVerifierRef: 'attestation:independent-semantic-verifier-1',
  observedAt: claimSupportObservedAt,
  validUntil: '2026-11-14T03:00:00.000Z',
  decision: 'supported' as const,
};
const claimSupportObservation: SourceObservation = {
  sourceId: 'aws-well-architected',
  ok: true,
  status: 200,
  contentHash: claimSupportContentHash,
  observedAt: claimSupportObservedAt,
  finalUrl: 'https://aws.amazon.com/architecture/well-architected/',
  evidenceExcerpt: claimSupportExcerpt,
  evidenceStatus: 'claim-supported',
  claimSupportAttestation,
};
if (isClaimSupportedEvidence('claim-supported', claimSupportObservation, 'cross-cutting-cloud-controls', undefined, claimSupportNowMs)) {
  throw new Error('claim-supported status and a record alone must not establish authenticated claim support');
}
if (buildArchitectureEvidence([claimSupportObservation], undefined, claimSupportNowMs).length !== 0) {
  throw new Error('claim-supported source observations must fail closed when no trusted authenticator is configured');
}
const trustedClaimSupportAuthenticator = (attestation: Readonly<typeof claimSupportAttestation>) =>
  attestation.evidenceRef === claimSupportAttestation.evidenceRef
  && attestation.claimId === claimSupportAttestation.claimId
  && attestation.claimType === claimSupportAttestation.claimType
  && attestation.patternId === claimSupportAttestation.patternId
  && attestation.semanticVerifierRef === claimSupportAttestation.semanticVerifierRef;
const authenticatedClaimEvidence = buildArchitectureEvidence(
  [claimSupportObservation],
  trustedClaimSupportAuthenticator,
  claimSupportNowMs,
);
if (authenticatedClaimEvidence.length !== 1 || authenticatedClaimEvidence[0].evidenceClass !== 'observed-fact') {
  throw new Error('only a fresh source-bound claim attestation accepted by the trusted authenticator may become observed-fact');
}
let oneUseAuthenticatorCalls = 0;
const oneUseClaimSupportAuthenticator = () => {
  oneUseAuthenticatorCalls += 1;
  return oneUseAuthenticatorCalls === 1;
};
const oneUseAuthenticatedEvidence = buildArchitectureEvidence(
  [claimSupportObservation],
  oneUseClaimSupportAuthenticator,
  claimSupportNowMs,
);
if (oneUseAuthenticatedEvidence.length !== 1
    || oneUseAuthenticatedEvidence[0].evidenceClass !== 'observed-fact'
    || oneUseAuthenticatorCalls !== 1) {
  throw new Error('claim-support authenticators must be evaluated exactly once per source observation');
}
if (authenticatedClaimEvidence[0].patternIds.length !== 1
    || authenticatedClaimEvidence[0].patternIds[0] !== 'cross-cutting-cloud-controls') {
  throw new Error('claim support must be restricted to the exact attested architecture pattern, not every pattern associated with the source');
}
if (classifyArchitectureEvidence(
  'claim-supported',
  claimSupportObservation,
  'cross-cutting-cloud-controls',
  trustedClaimSupportAuthenticator,
  claimSupportNowMs,
) !== 'observed-fact') {
  throw new Error('the exact attested pattern may become observed-fact after trusted authentication');
}
if (classifyArchitectureEvidence(
  'claim-supported',
  claimSupportObservation,
  'durable-agent-execution',
  trustedClaimSupportAuthenticator,
  claimSupportNowMs,
) !== 'analysis') {
  throw new Error('a sibling pattern must not inherit another pattern claim attestation');
}
const mismatchedPatternClaimEvidence = buildArchitectureEvidence(
  [{
    ...claimSupportObservation,
    claimSupportAttestation: {
      ...claimSupportAttestation,
      patternId: 'unregistered-pattern',
    },
  }],
  trustedClaimSupportAuthenticator,
  claimSupportNowMs,
);
if (mismatchedPatternClaimEvidence.length !== 0) {
  throw new Error('claim support must not promote a pattern that the source registry does not associate with the source');
}
const unsupportedClaimTypeEvidence = buildArchitectureEvidence(
  [{
    ...claimSupportObservation,
    claimSupportAttestation: {
      ...claimSupportAttestation,
      // AWS declares this as a discovery association, but not an allowed claim type.
      claimType: 'durable-agent-execution',
    },
  }],
  trustedClaimSupportAuthenticator,
  claimSupportNowMs,
);
if (unsupportedClaimTypeEvidence.length !== 0) {
  throw new Error('a source discovery association must not bypass the registry claimsAllowed policy');
}
const missingClaimTypeEvidence = buildArchitectureEvidence(
  [{
    ...claimSupportObservation,
    claimSupportAttestation: {
      ...claimSupportAttestation,
      claimType: '',
    },
  }],
  trustedClaimSupportAuthenticator,
  claimSupportNowMs,
);
if (missingClaimTypeEvidence.length !== 0) {
  throw new Error('claim-support attestations must include a non-empty source-authorized claim type');
}
const rejectedClaimEvidence = buildArchitectureEvidence(
  [claimSupportObservation],
  () => false,
  claimSupportNowMs,
);
if (rejectedClaimEvidence.length !== 0) {
  throw new Error('a rejected claim-support authenticator must not admit observed-fact evidence');
}
const nullStatusClaimEvidence = buildArchitectureEvidence(
  [{ ...claimSupportObservation, status: null }],
  trustedClaimSupportAuthenticator,
  claimSupportNowMs,
);
if (nullStatusClaimEvidence.length !== 0) {
  throw new Error('claim-support attestations must reject missing HTTP status values');
}
const mismatchedClaimEvidence = buildArchitectureEvidence(
  [{ ...claimSupportObservation, contentHash: 'f'.repeat(64) }],
  trustedClaimSupportAuthenticator,
  claimSupportNowMs,
);
if (mismatchedClaimEvidence.length !== 0) {
  throw new Error('claim-support attestation must bind to the exact observed source snapshot hash');
}
const expiredClaimEvidence = buildArchitectureEvidence(
  [{ ...claimSupportObservation, claimSupportAttestation: { ...claimSupportAttestation, validUntil: '2026-11-13T03:00:59.999Z' } }],
  trustedClaimSupportAuthenticator,
  claimSupportNowMs,
);
if (expiredClaimEvidence.length !== 0) {
  throw new Error('expired claim-support attestations must remain analysis-ineligible');
}
const wrongExcerptClaimEvidence = buildArchitectureEvidence(
  [{ ...claimSupportObservation, evidenceExcerpt: 'A different excerpt.' }],
  trustedClaimSupportAuthenticator,
  claimSupportNowMs,
);
if (wrongExcerptClaimEvidence.length !== 0) {
  throw new Error('claim-support attestation must bind to the exact supporting excerpt');
}
const asyncClaimSupportAuthenticator = (() => Promise.resolve(true)) as unknown as ClaimSupportAuthenticator;
if (buildArchitectureEvidence(
  [claimSupportObservation],
  asyncClaimSupportAuthenticator,
  claimSupportNowMs,
).length !== 0) {
  throw new Error('asynchronous claim-support authenticators must not be treated as synchronously verified');
}
const rejectingAsyncClaimSupportAuthenticator = (() => Promise.reject(new Error('untrusted verifier failure'))) as unknown as ClaimSupportAuthenticator;
if (buildArchitectureEvidence(
  [claimSupportObservation],
  rejectingAsyncClaimSupportAuthenticator,
  claimSupportNowMs,
).length !== 0) {
  throw new Error('rejected asynchronous claim-support authenticators must fail closed');
}
const throwingClaimSupportAuthenticator = (() => {
  throw new Error('untrusted verifier exception');
}) as ClaimSupportAuthenticator;
if (buildArchitectureEvidence(
  [claimSupportObservation],
  throwingClaimSupportAuthenticator,
  claimSupportNowMs,
).length !== 0) {
  throw new Error('throwing claim-support authenticators must fail closed');
}
const overlongClaimSupportEvidence = buildArchitectureEvidence(
  [{
    ...claimSupportObservation,
    claimSupportAttestation: {
      ...claimSupportAttestation,
      validUntil: '2026-11-27T03:00:00.001Z',
    },
  }],
  trustedClaimSupportAuthenticator,
  claimSupportNowMs,
);
if (overlongClaimSupportEvidence.length !== 0) {
  throw new Error('claim-support attestation validity must not exceed the source review cadence');
}
const futureClaimSupportEvidence = buildArchitectureEvidence(
  [{
    ...claimSupportObservation,
    observedAt: '2026-11-13T03:02:00.000Z',
    claimSupportAttestation: {
      ...claimSupportAttestation,
      observedAt: '2026-11-13T03:02:00.000Z',
    },
  }],
  trustedClaimSupportAuthenticator,
  claimSupportNowMs,
);
if (futureClaimSupportEvidence.length !== 0) {
  throw new Error('future claim-support observations must fail closed');
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
  'https://www.nist.gov/super-intelligence/si-agent-standards-initiative',
  'https://www.nist.gov/blogs/cybersecurity-insights/design-tenets-agent-identity-management-systems',
  'https://docs.cloud.google.com/bigquery/docs/external-data-sources',
  'https://owaspacs.org/docs/acs/',
  'https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md',
  'https://airc.nist.gov/airmf-resources/playbook/',
  'https://raw.githubusercontent.com/GenAI-Security-Project/translations/main/owasp-top-10-for-agentic-applications-2026-12-6-1/_source/ASI01_Agent_Goal_Hijack.md',
  'https://focus.finops.org/docs/specification/v1-4/',
  'https://focus.finops.org/focus-1-5-release-scope/',
  'https://docs.nats.io/concepts/jetstream',
  'https://www.rfc-editor.org/rfc/rfc9111.html',
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
  'https://www.nist.gov/blogs/cybersecurity-insights/unregistered-agent-identity-design-tenets',
  'https://docs.cloud.google.com/bigquery/docs/forged-external-data-sources',
  'https://owaspacs.org/docs/unregistered/',
  'https://docs.nats.io/unregistered/',
  'https://www.rfc-editor.org/rfc/rfc9110.html',
  'https://github.com/open-telemetry/semantic-conventions-genai/blob/main/README.md',
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

const sensitiveRedirectDiagnostic = formatCuratedRedirectTargetDiagnostic(
  new URL('https://user:secret@docs.cloud.google.com/private/token-secret-123/architecture?token=query-secret#overview'),
);
assert.equal(
  sensitiveRedirectDiagnostic,
  'https://docs.cloud.google.com',
  'redirect diagnostics must expose only the origin',
);
assert.doesNotMatch(
  sensitiveRedirectDiagnostic,
  /private|token-secret-123|query-secret|secret|architecture/,
  'redirect diagnostics must not expose path segments, credentials, queries, or fragments',
);

if (isClaimSupportedEvidence('content-matched')) throw new Error('keyword match must not count as claim verification');
if (isClaimSupportedEvidence('claim-supported')) throw new Error('claim-supported status without an attestation and trusted authenticator must fail closed');
if (classifyArchitectureEvidence('content-matched') !== 'analysis') throw new Error('keyword matches must remain analysis');
if (classifyArchitectureEvidence('source-available') !== 'analysis') throw new Error('source availability must remain analysis');
if (classifyArchitectureEvidence('claim-supported') !== 'analysis') throw new Error('claim-supported status without an authenticated attestation must remain analysis');
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

const semanticEvidenceHtml = [
  '<header><nav>Security Reliability Cost Sign in</nav></header>',
  '<main><article><h1>Cloud architecture</h1>',
  '<p>The Well-Architected Framework treats security, reliability and cost optimization as design pillars.</p>',
  '</article></main><footer>About AWS Careers Privacy</footer>',
].join('');
const semanticEvidenceText = stripHtmlForEvidence(semanticEvidenceHtml);
if (semanticEvidenceText.includes('Sign in')
    || semanticEvidenceText.includes('About AWS')
    || findEarliestKeywordIndex(semanticEvidenceText, ['security', 'reliability', 'cost'])
      !== semanticEvidenceText.toLowerCase().indexOf('security')) {
  throw new Error('evidence extraction must prefer semantic main content over header and footer navigation');
}

const fallbackEvidenceHtml = [
  '<header>News and announcements</header>',
  '<div role="navigation">Home Docs Search Projects</div>',
  '<aside>Related links and categories</aside>',
  '<section><p>Delegated authority must attenuate at each agent boundary.</p></section>',
  '<footer>Contact us Privacy Policy</footer>',
].join('');
const fallbackEvidenceText = stripHtmlForEvidence(fallbackEvidenceHtml);
if (fallbackEvidenceText.includes('News and announcements')
    || fallbackEvidenceText.includes('Home Docs Search Projects')
    || fallbackEvidenceText.includes('Related links')
    || !fallbackEvidenceText.includes('Delegated authority must attenuate')) {
  throw new Error('evidence extraction must remove semantic navigation and preserve substantive fallback content');
}

const staleNavigationExcerpt = 'AWS homepage News and announcements AWS blog About AWS and product navigation';
if (shouldReuseSourceObservation({
  configuredUrl: 'https://aws.amazon.com/architecture/well-architected/',
  cachedUrl: 'https://aws.amazon.com/architecture/well-architected/',
  ok: true,
  status: 200,
  contentHash: 'a'.repeat(64),
  evidenceExcerpt: staleNavigationExcerpt,
  evidenceStatus: 'content-matched',
  cadenceHours: 336,
  observedAt: '2026-11-14T03:00:00.000Z',
  nowMs: Date.parse('2026-11-14T04:00:00.000Z'),
})) {
  throw new Error('stale navigation-only cached evidence must be invalidated for a full source refetch');
}
if (Object.keys(buildConditionalRequestHeaders(
  'https://aws.amazon.com/architecture/well-architected/',
  {
    observed_at: '2026-11-14T03:00:00.000Z',
    ok: true,
    status: 200,
    content_hash: 'a'.repeat(64),
    evidence_excerpt: staleNavigationExcerpt,
    evidence_status: 'content-matched',
    final_url: 'https://aws.amazon.com/architecture/well-architected/',
    etag: '"navigation-v1"',
    source_url: 'https://aws.amazon.com/architecture/well-architected/',
  },
  Date.parse('2026-11-14T04:00:00.000Z'),
)).length !== 0) {
  throw new Error('navigation-only cached evidence must not supply conditional validators');
}

const staleNavigationCache = {
  observed_at: '2026-11-14T03:00:00.000Z',
  ok: true,
  status: 200,
  content_hash: 'a'.repeat(64),
  evidence_excerpt: staleNavigationExcerpt,
  evidence_status: 'content-matched' as const,
  final_url: 'https://aws.amazon.com/architecture/well-architected/',
  etag: '"navigation-v1"',
  last_modified: null,
  source_url: 'https://aws.amazon.com/architecture/well-architected/',
};
if (reuseNotModifiedSourceObservation(
  { id: 'aws-well-architected', url: staleNavigationCache.source_url },
  staleNavigationCache,
  { finalUrl: staleNavigationCache.final_url, etag: staleNavigationCache.etag, lastModified: null },
  '2026-11-14T04:00:00.000Z',
  Date.parse('2026-11-14T04:00:00.000Z'),
) !== null) {
  throw new Error('a 304 response must not revive stale navigation-only cached evidence');
}

const staleOpenTelemetryObservation: SourceObservation = {
  sourceId: 'otel-genai-agents',
  ok: true,
  status: 200,
  contentHash: 'b'.repeat(64),
  observedAt: '2026-11-14T03:00:00.000Z',
  finalUrl: 'https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md',
  evidenceExcerpt: 'Navigation Menu Sign in Products Platform GitHub Repository hosting and collaboration',
  evidenceStatus: 'content-matched',
};
if (buildObservedArchitecturePatterns(
  [staleOpenTelemetryObservation],
  staleOpenTelemetryObservation.observedAt,
).some((pattern) => pattern.id === 'genai-agent-telemetry')) {
  throw new Error('GitHub navigation-only excerpts must not create OpenTelemetry architecture patterns');
}

const staleNavigationObservation: SourceObservation = {
  sourceId: 'aws-well-architected',
  ok: true,
  status: 200,
  contentHash: 'a'.repeat(64),
  observedAt: '2026-11-14T03:00:00.000Z',
  finalUrl: 'https://aws.amazon.com/architecture/well-architected/',
  evidenceExcerpt: staleNavigationExcerpt,
  evidenceStatus: 'content-matched',
};
if (buildObservedArchitecturePatterns(
  [staleNavigationObservation],
  staleNavigationObservation.observedAt,
).some((pattern) => pattern.id === 'cross-cutting-cloud-controls')) {
  throw new Error('navigation-only cached observations must not create architecture analysis patterns');
}

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
  sources: Array<{ id: string; scannerStatus: string; claimsAllowed: string[]; reviewCadenceDays: number; implementationStatus: string }>;
};
const focusRegistryEntry = authoritativeRegistry.sources.find((entry) => entry.id === 'finops-focus-1-4');
if (!focusRegistryEntry || focusRegistryEntry.scannerStatus !== 'active' || focusRegistryEntry.claimsAllowed.length !== 1 || focusRegistryEntry.claimsAllowed[0] !== 'focus-invoice-reconciliation') {
  throw new Error('FOCUS 1.4 registry must explicitly allow only its active invoice-reconciliation source for that claim type');
}

const natsRegistryEntry = authoritativeRegistry.sources.find((entry) => entry.id === 'nats-jetstream');
if (!natsRegistryEntry
    || natsRegistryEntry.scannerStatus !== 'active'
    || natsRegistryEntry.reviewCadenceDays !== 14
    || natsRegistryEntry.implementationStatus !== 'not-assessed'
    || natsRegistryEntry.claimsAllowed.length !== 1
    || natsRegistryEntry.claimsAllowed[0] !== 'durable-agent-messaging') {
  throw new Error('NATS JetStream registry entry must remain active, 14-day, and not-assessed with a narrow claim allowance');
}
const cncfNatsRegistryEntry = authoritativeRegistry.sources.find((entry) => entry.id === 'cncf-nats-graduation');
if (!cncfNatsRegistryEntry
    || cncfNatsRegistryEntry.scannerStatus !== 'discovery-only'
    || cncfNatsRegistryEntry.reviewCadenceDays !== 30
    || cncfNatsRegistryEntry.implementationStatus !== 'not-assessed'
    || cncfNatsRegistryEntry.claimsAllowed.length !== 1
    || cncfNatsRegistryEntry.claimsAllowed[0] !== 'cncf-project-maturity') {
  throw new Error('CNCF NATS graduation announcement must remain discovery-only and not-assessed');
}
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

const focusSource = model.sources.find((source) => source.id === 'finops-focus-1-4');
const focusPattern = model.patterns.find((pattern) => pattern.id === 'focus-invoice-reconciliation');
if (!focusSource || !focusSource.patternIds.includes('focus-invoice-reconciliation')) {
  throw new Error('FOCUS 1.4 source must declare the dedicated invoice-reconciliation pattern');
}
if (!focusPattern || focusPattern.sourceId !== 'finops-focus-1-4' || focusPattern.domain !== 'finops') {
  throw new Error('FOCUS 1.4 invoice-reconciliation pattern must be linked to its dedicated FinOps source');
}
if (findEarliestKeywordIndex('Reconcile Cost and Usage to Invoice Detail by Invoice ID', focusPattern.keywords) < 0) {
  throw new Error('FOCUS 1.4 invoice-reconciliation source must match its documented invoice-join use case');
}
if (classifyArchitectureEvidence('content-matched') !== 'analysis') {
  throw new Error('FOCUS 1.4 content matches must remain analysis until claim-level review');
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
