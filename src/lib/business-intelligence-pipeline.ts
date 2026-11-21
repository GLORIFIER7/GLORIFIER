import { createHash } from 'node:crypto';

export type IntelligenceEvidenceInput = {
  id?: string;
  source?: string;
  title?: string;
  url?: string;
  publishedAt?: string;
  summary?: string;
  collectedAt?: string;
};

export type IntelligenceThemeInput = {
  theme?: string;
  evidenceIds?: string[];
  summary?: string;
};

export type IntelligenceReportInput = {
  id?: string;
  generatedAt?: string;
  sourceCount?: number;
  evidenceCount?: number;
  sourceStatuses?: string[];
  evidence?: IntelligenceEvidenceInput[];
  themes?: IntelligenceThemeInput[];
};

export type NormalizedBusinessIntelligenceObservation = {
  id: string;
  domain: string;
  source: string;
  sourceRef: string;
  subject: string;
  metric: string;
  value: null;
  unit: null;
  observedAt: string;
  evidenceStatus: 'observed';
  confidence: null;
  metadata: Record<string, unknown>;
};

export type NormalizedBusinessIntelligenceSignal = {
  id: string;
  domain: string;
  signalType: 'intelligence-theme';
  title: string;
  description: string;
  evidenceRefs: string[];
  confidence: null;
  impactEstimate: null;
  status: 'observed';
  metadata: Record<string, unknown>;
};

export type NormalizedBusinessIntelligenceRecords = {
  observations: NormalizedBusinessIntelligenceObservation[];
  signals: NormalizedBusinessIntelligenceSignal[];
  rejectedEvidenceCount: number;
  sourceCount: number;
};

const PIPELINE_STAGES = [
  'Discover source',
  'Ingest observation',
  'Normalize data',
  'Validate quality',
  'Resolve entity',
  'Apply business semantics',
  'Calculate metric',
  'Detect signal',
  'Explain driver',
  'Generate scenario',
  'Assess opportunity',
  'Check evidence',
  'Govern action',
  'Measure outcome',
  'Feed GEAS improvement',
] as const;

const STAGE_NOT_IMPLEMENTED = new Set<string>([
  'Resolve entity',
  'Apply business semantics',
  'Calculate metric',
  'Explain driver',
  'Generate scenario',
  'Assess opportunity',
  'Check evidence',
  'Govern action',
  'Measure outcome',
  'Feed GEAS improvement',
]);

function stableId(prefix: string, value: string): string {
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `${prefix}-${digest}`;
}

function validHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim().length === 0) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function normalizedTimestamp(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return new Date(0).toISOString();
}

function domainForSource(source: string): string {
  const normalized = source.toLowerCase();
  if (normalized.includes('google-news-glorifier') || normalized.includes('market')) {
    return 'market-intelligence';
  }
  if (
    normalized.includes('arxiv')
    || normalized.includes('hugging')
    || normalized.includes('github')
    || normalized.includes('hacker')
    || /\bai\b/.test(normalized)
    || normalized.includes('model')
  ) {
    return 'technology-intelligence';
  }
  if (normalized.includes('news')) return 'market-intelligence';
  return 'data-intelligence';
}

export function normalizeIntelligenceReportToBiRecords(
  report: IntelligenceReportInput,
): NormalizedBusinessIntelligenceRecords {
  const observations: NormalizedBusinessIntelligenceObservation[] = [];
  const validEvidence = new Map<string, IntelligenceEvidenceInput>();
  let rejectedEvidenceCount = 0;
  const reportId = typeof report.id === 'string' && report.id.trim() ? report.id.trim() : 'unidentified-report';
  const generatedAt = normalizedTimestamp(report.generatedAt);

  for (const item of Array.isArray(report.evidence) ? report.evidence : []) {
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const source = typeof item.source === 'string' ? item.source.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!id || !source || !title || !validHttpUrl(item.url) || validEvidence.has(id)) {
      rejectedEvidenceCount += 1;
      continue;
    }

    const sourceRef = item.url;
    const observedAt = normalizedTimestamp(item.publishedAt, item.collectedAt, report.generatedAt);
    validEvidence.set(id, { ...item, id, source, title, url: sourceRef });
    observations.push({
      id: stableId('bi-obs', `${reportId}:observation:${id}`),
      domain: domainForSource(source),
      source,
      sourceRef,
      subject: title.slice(0, 500),
      metric: 'public-source-evidence',
      value: null,
      unit: null,
      observedAt: observedAt === new Date(0).toISOString() ? generatedAt : observedAt,
      evidenceStatus: 'observed',
      confidence: null,
      metadata: {
        reportId,
        evidenceId: id,
        summary: String(item.summary || '').slice(0, 1500),
        publishedAt: item.publishedAt || null,
        collectedAt: item.collectedAt || null,
      },
    });
  }

  const signals: NormalizedBusinessIntelligenceSignal[] = [];
  const seenThemes = new Set<string>();
  for (const theme of Array.isArray(report.themes) ? report.themes : []) {
    const title = typeof theme.theme === 'string' ? theme.theme.trim() : '';
    const evidenceRefs = [...new Set(
      (Array.isArray(theme.evidenceIds) ? theme.evidenceIds : [])
        .filter((id): id is string => typeof id === 'string' && validEvidence.has(id)),
    )];
    const key = title.toLowerCase();
    if (!title || evidenceRefs.length === 0 || seenThemes.has(key)) continue;
    seenThemes.add(key);
    signals.push({
      id: stableId('bi-signal', `${reportId}:theme:${key}:${evidenceRefs.slice().sort().join(',')}`),
      domain: 'technology-intelligence',
      signalType: 'intelligence-theme',
      title: title.slice(0, 300),
      description: String(theme.summary || '').slice(0, 1500),
      evidenceRefs,
      confidence: null,
      impactEstimate: null,
      status: 'observed',
      metadata: { reportId, evidenceCount: evidenceRefs.length, synthesisStatus: 'advisory-not-independent-verification' },
    });
  }

  return {
    observations,
    signals,
    rejectedEvidenceCount,
    sourceCount: new Set(observations.map((item) => item.source)).size,
  };
}

export function classifyBusinessIntelligenceIngestionStatus(
  observationsUpserted: number,
  rejectedEvidenceCount: number,
): 'ingested' | 'partial' | 'empty' {
  if (!Number.isFinite(observationsUpserted) || observationsUpserted <= 0) return 'empty';
  return rejectedEvidenceCount > 0 ? 'partial' : 'ingested';
}

export type BusinessIntelligenceIngestionStatus = {
  status: 'ingested' | 'empty' | 'partial' | 'unavailable';
  observationsUpserted: number;
  signalsUpserted: number;
  rejectedEvidenceCount: number;
};

export type PipelineProgressInput = {
  report?: { sourceCount?: number; evidenceCount?: number } | null;
  ingestion?: BusinessIntelligenceIngestionStatus | null;
  geasScanAvailable?: boolean;
};

export function getBusinessIntelligencePipelineProgress(input: PipelineProgressInput) {
  const hasSourceEvidence = Boolean(
    input.report && Number(input.report.sourceCount || 0) > 0 && Number(input.report.evidenceCount || 0) > 0,
  );
  const ingestionComplete = input.ingestion?.status === 'ingested' || input.ingestion?.status === 'partial';
  const validationComplete = ingestionComplete && Number(input.ingestion?.rejectedEvidenceCount || 0) === 0;
  const signalDetectionComplete = ingestionComplete && Number(input.ingestion?.signalsUpserted || 0) > 0;

  const completed = new Set<string>();
  if (hasSourceEvidence) completed.add('Discover source');
  if (ingestionComplete && Number(input.ingestion?.observationsUpserted || 0) > 0) {
    completed.add('Ingest observation');
    completed.add('Normalize data');
  }
  if (validationComplete) completed.add('Validate quality');
  if (signalDetectionComplete) completed.add('Detect signal');

  const stages = PIPELINE_STAGES.map((name, index) => {
    const status = completed.has(name) ? 'completed' : STAGE_NOT_IMPLEMENTED.has(name) ? 'not-implemented' : 'pending';
    return { index: index + 1, name, status };
  });
  const completedStages = stages.filter((stage) => stage.status === 'completed').map((stage) => stage.name);
  const notImplementedStages = stages.filter((stage) => stage.status === 'not-implemented').map((stage) => stage.name);
  const pendingStages = stages.filter((stage) => stage.status === 'pending').map((stage) => stage.name);

  return {
    status: completedStages.length > 0 ? 'partial' as const : 'awaiting-evidence' as const,
    stages,
    completedStages,
    pendingStages,
    notImplementedStages,
    completedCount: completedStages.length,
    totalStages: PIPELINE_STAGES.length,
    geasScanAvailable: input.geasScanAvailable === true,
    disclaimer: 'Only stages backed by persisted ingestion evidence are marked completed. Remaining stages are not represented as operational.',
  };
}

type GeasEvidenceInput = {
  id?: string;
  sourceId?: string;
  sourceUrl?: string;
  observedAt?: string;
  evidenceClass?: string;
  excerpt?: string;
  patternIds?: string[];
};

type GeasDriftInput = {
  id?: string;
  controlId?: string;
  status?: string;
  severity?: string;
  intended?: string;
  observed?: string;
  evidenceRefs?: string[];
  recommendation?: string;
  createdAt?: string;
};

type GeasScanInput = {
  scanId?: string;
  startedAt?: string;
  completedAt?: string;
  sources?: unknown[];
  evidence?: GeasEvidenceInput[];
  drift?: GeasDriftInput[];
  recommendations?: string[];
  irreversibleChangesExecuted?: boolean;
};

export function buildGeasBusinessIntelligenceAdvisory(input: {
  report?: IntelligenceReportInput | null;
  scan?: GeasScanInput | null;
}) {
  const report = input.report || null;
  const scan = input.scan || null;
  const normalized = report ? normalizeIntelligenceReportToBiRecords(report) : null;
  const evidence = (report?.evidence || []).filter((item) =>
    typeof item.id === 'string' && item.id.trim().length > 0
    && typeof item.source === 'string' && item.source.trim().length > 0
    && typeof item.title === 'string' && item.title.trim().length > 0
    && validHttpUrl(item.url),
  );
  const reportEvidenceRefs = evidence.map((item) => item.id as string);
  const geasEvidence = (scan?.evidence || []).filter((item) =>
    typeof item.id === 'string' && item.id.trim().length > 0 && validHttpUrl(item.sourceUrl),
  );
  const geasEvidenceRefs = geasEvidence.map((item) => item.id as string);
  const drift = (scan?.drift || [])
    .filter((item) => item.status !== 'aligned')
    .slice()
    .sort((a, b) => {
      const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (rank[String(a.severity)] ?? 4) - (rank[String(b.severity)] ?? 4);
    })
    .map((item) => ({
      id: item.id || 'unidentified-drift',
      controlId: item.controlId || 'unspecified-control',
      status: item.status || 'unknown',
      severity: item.severity || 'unknown',
      intended: item.intended || 'Not specified',
      observed: item.observed || 'No observation supplied',
      evidenceRefs: Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [],
      recommendation: item.recommendation || 'Collect additional evidence before deciding.',
      createdAt: item.createdAt || null,
    }));
  const recommendations = [...new Set([
    ...(scan?.recommendations || []),
    ...drift.map((item) => item.recommendation),
  ].filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
  const geasClasses = geasEvidence.reduce((counts, item) => {
    const evidenceClass = String(item.evidenceClass || 'unclassified');
    counts[evidenceClass] = (counts[evidenceClass] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
  const hasReport = Boolean(report && reportEvidenceRefs.length > 0);
  const hasScan = Boolean(scan && scan.scanId && scan.completedAt);
  const limitations: string[] = [];
  if (!hasReport) limitations.push('No valid public intelligence report evidence is available.');
  if (!hasScan) limitations.push('A persisted GEAS architecture scan is unavailable; this advisory cannot assess architecture drift.');
  if (hasScan && (geasClasses['claim-supported'] || 0) === 0) {
    limitations.push('No claim-supported GEAS evidence is present; architecture implementation claims remain unverified.');
  }
  if (scan?.irreversibleChangesExecuted === true) {
    limitations.push('The GEAS scan reports that irreversible changes were executed; immediate human review is required.');
  }

  return {
    status: hasReport && hasScan ? 'advisory-ready' as const
      : hasReport || hasScan ? 'partial' as const
        : 'not-available' as const,
    generatedAt: new Date().toISOString(),
    scope: 'Read-only business and architecture decision support',
    intelligence: {
      reportId: report?.id || null,
      generatedAt: report?.generatedAt || null,
      sourceStatuses: report?.sourceStatuses || [],
      sourceCount: normalized?.sourceCount || 0,
      evidenceCount: reportEvidenceRefs.length,
      evidence: evidence.map((item) => ({
        id: item.id,
        source: item.source || 'unknown',
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt || null,
      })),
      signals: normalized?.signals || [],
    },
    geas: {
      status: hasScan ? 'available' as const : 'not-available' as const,
      scanId: scan?.scanId || null,
      completedAt: scan?.completedAt || null,
      sourceCount: scan?.sources?.length || 0,
      evidenceCount: geasEvidence.length,
      analysisEvidenceCount: geasClasses.analysis || 0,
      claimSupportedEvidenceCount: geasClasses['claim-supported'] || 0,
      evidenceClasses: geasClasses,
      drift,
      recommendations,
    },
    evidenceRefs: [...new Set([...reportEvidenceRefs, ...geasEvidenceRefs])],
    limitations,
    governance: {
      advisoryOnly: true,
      humanApprovalRequired: true,
      irreversibleActionsExecuted: scan?.irreversibleChangesExecuted === true,
      autonomousFinancialActions: false,
      autonomousContracting: false,
    },
    economicTruth: 'Estimated opportunity value is NOT VERIFIED REVENUE.',
  };
}

/**
 * Count only search-query collectors already present in the intelligence pipeline.
 * Other evidence (arXiv, GitHub commits, Hugging Face) must not make search
 * signals look observed.
 */
const SEARCH_SOURCE_IDS = new Set(['google-news-ai', 'google-news-glorifier', 'hacker-news-ai']);

export function summarizeSearchSourceEvidence(
  evidence: readonly ({ source?: unknown } | null | undefined)[] | null | undefined,
): { status: 'observed' | 'not-available'; evidenceCount: number } {
  const evidenceCount = Array.isArray(evidence)
    ? evidence.filter((item) => typeof item?.source === 'string'
      && SEARCH_SOURCE_IDS.has(item.source.trim().toLowerCase())).length
    : 0;
  return { status: evidenceCount > 0 ? 'observed' : 'not-available', evidenceCount };
}
