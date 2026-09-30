import { createHash } from 'node:crypto';

export type GeasEvidenceTruth = 'observed' | 'supported' | 'verified' | 'economically-verified';
export type GeasEvidenceState = 'pass' | 'fail' | 'missing' | 'stale' | 'contradicted' | 'requires-human-decision' | 'waived';

export interface EvidenceRecord {
  evidenceId: string;
  contextId: string;
  truth: GeasEvidenceTruth;
  state: GeasEvidenceState;
  source: string;
  observedAt: string;
  freshnessSeconds?: number;
  contentHash: string;
  producer: string;
  authoritative: boolean;
  refs?: string[];
  metadata?: Record<string, string | number | boolean>;
}

export interface GovernedActionIdentity {
  contextId: string;
  capability: string;
  resourceScope?: string;
  payloadHash: string;
  authorityEnvelopeId: string;
  policyVersion: string;
  risk: 'low' | 'medium' | 'high' | 'critical';
  irreversible: boolean;
}

export function canonicalActionHash(action: GovernedActionIdentity): string {
  const canonical = stableSerialize({
    contextId: action.contextId,
    capability: action.capability,
    resourceScope: action.resourceScope || '',
    payloadHash: action.payloadHash,
    authorityEnvelopeId: action.authorityEnvelopeId,
    policyVersion: action.policyVersion,
    risk: action.risk,
    irreversible: action.irreversible,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function buildEvidenceRecord(input: Omit<EvidenceRecord, 'contentHash'> & { content: unknown }): EvidenceRecord {
  const { content, ...rest } = input;
  return {
    ...rest,
    contentHash: createHash('sha256').update(stableSerialize(content)).digest('hex'),
  };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableSerialize).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort().map(key => JSON.stringify(key) + ':' + stableSerialize(record[key])).join(',') + '}';
}

export interface ApiAsset {
  id: string;
  method: string;
  path: string;
  owner: string;
  authentication: 'required' | 'public';
  authorization: 'required' | 'none';
  resourceScope?: string;
  dataClass?: string;
  exposure: 'internal' | 'external';
  rateLimit?: string;
  evidenceRefs: string[];
}

const apiAssets = new Map<string, ApiAsset>();

export function registerApiAsset(asset: ApiAsset): ApiAsset {
  const key = asset.method.toUpperCase() + ' ' + asset.path;
  apiAssets.set(key, { ...asset, method: asset.method.toUpperCase(), evidenceRefs: [...new Set(asset.evidenceRefs)] });
  return apiAssets.get(key)!;
}

export function listApiAssets(): ApiAsset[] {
  return [...apiAssets.values()];
}

export function getApiAsset(id: string): ApiAsset | null {
  return [...apiAssets.values()].find(asset => asset.id === id) || null;
}

export function evaluateVerificationState(checks: Array<{ name: string; passed: boolean; evidence?: string }>): 'FULLY VERIFIED' | 'PARTIALLY VERIFIED' | 'NOT VERIFIED' {
  if (!checks.length) return 'NOT VERIFIED';
  const passed = checks.filter(check => check.passed);
  if (passed.length === checks.length && checks.every(check => Boolean(check.evidence))) return 'FULLY VERIFIED';
  if (passed.length > 0) return 'PARTIALLY VERIFIED';
  return 'NOT VERIFIED';
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: string;
  contextId?: string;
  evidenceRefs?: string[];
  retryable?: boolean;
}

export function problemDetails(input: Omit<ProblemDetails, 'type'> & { type?: string }): ProblemDetails {
  return {
    type: input.type || 'urn:glorifier:problem:' + input.code,
    ...input,
  };
}
