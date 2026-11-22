import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { runBusinessIntelligenceTransaction } from './business-intelligence-scientist.js';
import { createLatestRequestGate } from './latest-request-gate.js';
import { test } from 'node:test';
import {
  buildGeasBusinessIntelligenceAdvisory,
  classifyBusinessIntelligenceIngestionStatus,
  getBusinessIntelligencePipelineProgress,
  normalizeIntelligenceReportToBiRecords,
  summarizeSearchSourceEvidence,
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

test('theme signal IDs preserve canonical code-unit ordering across evidence permutations', () => {
  const evidence = ['é', 'a', 'Z'].map((id) => ({ ...report.evidence[0], id }));
  for (const evidenceIds of [['é', 'a', 'Z'], ['Z', 'é', 'a']]) {
    const { signals } = normalizeIntelligenceReportToBiRecords({
      ...report,
      evidence,
      themes: [{ ...report.themes[0], evidenceIds }],
    });
    // Existing signal hash for the canonical references Z,a,é.
    assert.equal(signals[0].id, 'bi-signal-71db4fbdf9cd18573432a16e3864890f');
    assert.deepEqual(signals[0].evidenceRefs, evidenceIds);
  }
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

test('GEAS advisory excludes whitespace-only report and scan evidence identities', () => {
  const invalidReport = {
    ...report,
    evidence: [
      { id: '   ', source: 'arxiv-ai', title: 'Source', url: 'https://example.com/one' },
      { id: 'valid-id', source: '   ', title: 'Source', url: 'https://example.com/two' },
      { id: 'valid-id-2', source: 'arxiv-ai', title: '\t ', url: 'https://example.com/three' },
    ],
    themes: [],
  };
  const scan = {
    scanId: 'scan-whitespace-check',
    completedAt: '2026-11-20T08:05:00.000Z',
    evidence: [{ id: '  ', sourceUrl: 'https://www.nist.gov/example', evidenceClass: 'claim-supported' }],
  };

  const advisory = buildGeasBusinessIntelligenceAdvisory({ report: invalidReport, scan });
  assert.equal(advisory.intelligence.evidenceCount, 0);
  assert.deepEqual(advisory.intelligence.evidence, []);
  assert.equal(advisory.geas.evidenceCount, 0);
  assert.equal(advisory.geas.claimSupportedEvidenceCount, 0);
  assert.deepEqual(advisory.evidenceRefs, []);
  assert.equal(advisory.status, 'partial', 'a recorded scan alone cannot establish a supported report');
  assert.match(advisory.limitations.join(' '), /No valid public intelligence report evidence/);
});


test('GEAS advisory publishes only normalized, unique public evidence references', () => {
  const advisory = buildGeasBusinessIntelligenceAdvisory({
    report: {
      id: 'duplicate-evidence-advisory',
      evidence: [
        {
          id: ' evidence-1 ',
          source: ' arxiv-ai ',
          title: ' First valid evidence ',
          url: 'https://example.com/first',
        },
        {
          id: 'evidence-1',
          source: 'fake-duplicate',
          title: 'Duplicate evidence',
          url: 'https://example.com/duplicate',
        },
        {
          id: 'bad-url',
          source: 'untrusted',
          title: 'Invalid URL',
          url: 'javascript:alert(1)',
        },
      ],
    },
  });

  assert.equal(advisory.intelligence.evidenceCount, 1);
  assert.deepEqual(advisory.intelligence.evidence.map((entry) => entry.id), ['evidence-1']);
  assert.deepEqual(advisory.evidenceRefs, ['evidence-1']);
  assert.equal(advisory.intelligence.evidence[0].source, 'arxiv-ai');
  assert.equal(advisory.intelligence.evidence[0].title, 'First valid evidence');
  assert.equal(advisory.intelligence.evidence[0].url, 'https://example.com/first');
});

test('BI ingestion transaction commits all writes on one client', async () => {
  const steps: string[] = [];
  const db = {
    connect: async () => ({
      query: async (sql: string) => { steps.push(sql); return { rows: [], rowCount: 1 }; },
      release: () => { steps.push('RELEASE'); },
    }),
  } as unknown as Pool;
  const count = await runBusinessIntelligenceTransaction(db, async (client) => {
    await client.query('INSERT observation');
    await client.query('INSERT signal');
    await client.query('INSERT run receipt');
    return 3;
  });
  assert.equal(count, 3);
  assert.deepEqual(steps, ['BEGIN', 'INSERT observation', 'INSERT signal', 'INSERT run receipt', 'COMMIT', 'RELEASE']);
});

test('BI ingestion transaction rolls back partial writes on failure', async () => {
  const steps: string[] = [];
  const db = {
    connect: async () => ({
      query: async (sql: string) => {
        steps.push(sql);
        if (sql === 'INSERT signal') throw new Error('simulated database failure');
        return { rows: [], rowCount: 1 };
      },
      release: () => { steps.push('RELEASE'); },
    }),
  } as unknown as Pool;
  await assert.rejects(runBusinessIntelligenceTransaction(db, async (client) => {
    await client.query('INSERT observation');
    await client.query('INSERT signal');
  }), /simulated database failure/);
  assert.deepEqual(steps, ['BEGIN', 'INSERT observation', 'INSERT signal', 'ROLLBACK', 'RELEASE']);
});

test('Search signals require evidence from a configured query-based source', () => {
  const unrelated = summarizeSearchSourceEvidence([
    { source: 'arxiv-ai' },
    { source: 'github-glorifier' },
    { source: 'hugging-face-models' },
  ]);
  assert.deepEqual(unrelated, { status: 'not-available', evidenceCount: 0 });
  assert.deepEqual(summarizeSearchSourceEvidence(null), { status: 'not-available', evidenceCount: 0 });

  const queryEvidence = summarizeSearchSourceEvidence([
    { source: 'arxiv-ai' },
    { source: 'google-news-glorifier' },
    { source: 'hacker-news-ai' },
    { source: 'unknown-search' },
    null,
  ]);
  assert.deepEqual(queryEvidence, { status: 'observed', evidenceCount: 2 });
});

test('stale BI refresh cannot replace a newer result when responses finish out of order', async () => {
  const latest = createLatestRequestGate();
  let resolveOld!: (value: string) => void;
  let resolveNew!: (value: string) => void;
  const older = new Promise<string>((resolve) => { resolveOld = resolve; });
  const newer = new Promise<string>((resolve) => { resolveNew = resolve; });
  let visibleState = 'initial';

  const apply = async (value: Promise<string>, requestId: number) => {
    const resolved = await value;
    if (latest.isCurrent(requestId)) visibleState = resolved;
  };

  const first = apply(older, latest.begin());
  const second = apply(newer, latest.begin());
  resolveNew('newest');
  await second;
  resolveOld('stale');
  await first;

  assert.equal(visibleState, 'newest');
});
