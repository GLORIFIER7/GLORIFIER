import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildGeasBusinessIntelligenceAdvisory,
  classifyBusinessIntelligenceIngestionStatus,
  getBusinessIntelligencePipelineProgress,
  normalizeIntelligenceReportToBiRecords,
} from './business-intelligence-pipeline.js';

const report = {
  id: 'intel-report-1',
  generatedAt: '2026-11-20T10:00:00.000Z',
  sourceCount: 2,
  evidenceCount: 2,
  evidence: [
    {
      id: 'evidence-1',
      source: 'arxiv-ai',
      title: 'A verifiable AI systems paper',
      url: 'https://arxiv.org/abs/2601.00001',
      publishedAt: '2026-11-20T09:00:00.000Z',
      summary: 'A source-backed research observation.',
      collectedAt: '2026-11-20T09:30:00.000Z',
    },
    {
      id: 'evidence-2',
      source: 'google-news-glorifier',
      title: 'Public company mention',
      url: 'https://news.example.com/story/2',
      summary: 'A public news observation.',
      collectedAt: '2026-11-20T09:31:00.000Z',
    },
  ],
  themes: [
    {
      theme: 'Evidence-backed AI operations',
      evidenceIds: ['evidence-1', 'evidence-2'],
      summary: 'The sources describe AI operations and evidence handling.',
    },
    {
      theme: 'Unsupported theme',
      evidenceIds: ['missing-evidence'],
      summary: 'This theme has no valid source reference.',
    },
  ],
};

test('normalizes public intelligence into idempotent GBIS observations and evidence-linked signals', () => {
  const first = normalizeIntelligenceReportToBiRecords(report);
  const second = normalizeIntelligenceReportToBiRecords(report);

  assert.equal(first.observations.length, 2);
  assert.equal(first.signals.length, 1);
  assert.equal(first.rejectedEvidenceCount, 0);
  assert.deepEqual(first.observations.map((item) => item.id), second.observations.map((item) => item.id));
  assert.deepEqual(first.signals.map((item) => item.id), second.signals.map((item) => item.id));
  assert.equal(first.observations[0].evidenceStatus, 'observed');
  assert.equal(first.observations[0].sourceRef, 'https://arxiv.org/abs/2601.00001');
  assert.equal(first.signals[0].evidenceRefs.length, 2);
});

test('rejects malformed or untrusted evidence URLs and refuses unreferenced themes', () => {
  const result = normalizeIntelligenceReportToBiRecords({
    ...report,
    evidence: [
      ...report.evidence,
      {
        id: 'evidence-bad',
        source: 'unknown',
        title: 'Bad URL',
        url: 'javascript:alert(1)',
        summary: 'Must not enter the intelligence ledger.',
      },
      {
        id: 'evidence-missing-url',
        source: 'unknown',
        title: 'Missing URL',
        summary: 'Must not enter the intelligence ledger.',
      },
    ],
  });

  assert.equal(result.observations.length, 2);
  assert.equal(result.rejectedEvidenceCount, 2);
  assert.equal(result.signals.length, 1);
  assert.ok(result.observations.every((item) => item.sourceRef.startsWith('https://') || item.sourceRef.startsWith('http://')));
});

test('does not classify incidental AI substrings as the AI technology source family', () => {
  const result = normalizeIntelligenceReportToBiRecords({
    id: 'email-report',
    evidence: [{
      id: 'email-evidence',
      source: 'email',
      title: 'Customer email',
      url: 'https://example.com/email',
      summary: 'Customer message observation.',
    }],
  });
  assert.equal(result.observations[0].domain, 'data-intelligence');
});

test('classifies an ingestion with zero persisted observations as empty even when evidence is rejected', () => {
  assert.equal(classifyBusinessIntelligenceIngestionStatus(0, 5), 'empty');
  assert.equal(classifyBusinessIntelligenceIngestionStatus(3, 5), 'partial');
  assert.equal(classifyBusinessIntelligenceIngestionStatus(3, 0), 'ingested');
  assert.equal(classifyBusinessIntelligenceIngestionStatus(-1, 0), 'empty');
});

test('reports only pipeline stages supported by a real ingestion result', () => {
  const progress = getBusinessIntelligencePipelineProgress({
    report: { sourceCount: 2, evidenceCount: 2 },
    ingestion: {
      status: 'ingested',
      observationsUpserted: 2,
      signalsUpserted: 1,
      rejectedEvidenceCount: 0,
    },
    geasScanAvailable: true,
  });

  assert.equal(progress.status, 'partial');
  assert.equal(progress.completedStages.includes('Discover source'), true);
  assert.equal(progress.completedStages.includes('Ingest observation'), true);
  assert.equal(progress.completedStages.includes('Normalize data'), true);
  assert.equal(progress.completedStages.includes('Validate quality'), true);
  assert.equal(progress.completedStages.includes('Detect signal'), true);
  assert.equal(progress.notImplementedStages.includes('Calculate metric'), true);
  assert.equal(progress.notImplementedStages.includes('Govern action'), true);
  assert.equal(progress.notImplementedStages.includes('Feed GEAS improvement'), true);
});

test('builds a read-only GEAS advisory with exact evidence references and no authority to act', () => {
  const scan = {
    scanId: 'geas-scan-1',
    startedAt: '2026-11-20T08:00:00.000Z',
    completedAt: '2026-11-20T08:05:00.000Z',
    sources: [{ sourceId: 'nist-agent-identity', ok: true, evidenceStatus: 'content-matched' }],
    evidence: [
      {
        id: 'geas-evidence-1',
        sourceId: 'nist-agent-identity',
        sourceUrl: 'https://www.nist.gov/example',
        observedAt: '2026-11-20T08:04:00.000Z',
        contentHash: 'a'.repeat(64),
        excerpt: 'Identity and authorization guidance.',
        evidenceClass: 'analysis',
        sourceStatus: 200,
        patternIds: ['agent-identity-delegation'],
      },
    ],
    drift: [
      {
        id: 'drift-1',
        controlId: 'agent-identity',
        status: 'unknown',
        severity: 'high',
        intended: 'Delegated, least-privilege agent identity.',
        observed: 'Independent runtime evidence is unavailable.',
        evidenceRefs: ['geas-evidence-1'],
        recommendation: 'Verify delegated identity and revocation on an authorized runtime.',
        createdAt: '2026-11-20T08:05:00.000Z',
      },
    ],
    recommendations: ['Verify delegated identity and revocation on an authorized runtime.'],
    irreversibleChangesExecuted: false,
  };

  const advisory = buildGeasBusinessIntelligenceAdvisory({ report, scan });

  assert.equal(advisory.status, 'advisory-ready');
  assert.equal(advisory.governance.advisoryOnly, true);
  assert.equal(advisory.governance.humanApprovalRequired, true);
  assert.equal(advisory.governance.irreversibleActionsExecuted, false);
  assert.ok(advisory.evidenceRefs.includes('evidence-1'));
  assert.ok(advisory.evidenceRefs.includes('geas-evidence-1'));
  assert.equal(advisory.geas.claimSupportedEvidenceCount, 0);
  assert.equal(advisory.geas.analysisEvidenceCount, 1);
  assert.equal(advisory.geas.drift[0].status, 'unknown');
  assert.equal(advisory.economicTruth, 'Estimated opportunity value is NOT VERIFIED REVENUE.');

  const unexpectedAction = buildGeasBusinessIntelligenceAdvisory({
    report,
    scan: { ...scan, irreversibleChangesExecuted: true },
  });
  assert.equal(unexpectedAction.governance.irreversibleActionsExecuted, true);
  assert.match(unexpectedAction.limitations.join(' '), /irreversible changes were executed/i);
});

test('does not interpret a missing GEAS scan as zero risk or a complete advisory', () => {
  const advisory = buildGeasBusinessIntelligenceAdvisory({ report, scan: null });

  assert.equal(advisory.status, 'partial');
  assert.equal(advisory.geas.status, 'not-available');
  assert.equal(advisory.geas.drift.length, 0);
  assert.equal(advisory.governance.humanApprovalRequired, true);
  assert.match(advisory.limitations.join(' '), /GEAS (?:architecture )?scan/i);
});
