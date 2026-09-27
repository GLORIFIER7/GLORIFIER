import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { listAssetAccounts, listAssetHoldings, listAssetEvidence } from './asset-registry';

export const GLORIFIER_ASSET_VERIFICATION_VERSION = 'GAV-1.0';

type VerificationResult = {
  status: 'verified' | 'partially-verified' | 'not-verified' | 'degraded';
  checks: Record<string, unknown>;
  evidenceRefs: string[];
  warnings: string[];
  reasons: string[];
};

const FRESHNESS_HOURS = 24;

function ageHours(value: unknown) {
  const t = Date.parse(String(value || ''));
  return Number.isFinite(t) ? Math.max(0, (Date.now() - t) / 3600000) : Infinity;
}

export function getAssetVerificationPolicy() {
  return {
    version: GLORIFIER_ASSET_VERIFICATION_VERSION,
    objective: 'VERIFY ASSET EXISTENCE, ACCOUNT AUTHORIZATION, OBSERVATION PROVENANCE, OWNERSHIP EVIDENCE, VALUATION FRESHNESS, AND ECONOMIC-TRUTH SEPARATION',
    verificationLevels: {
      accountConnection: 'requires an authorized connector and provider/account identity evidence',
      observedHolding: 'requires source-backed holding evidence linked to the holding',
      ownership: 'requires explicit ownership/custody evidence; market data alone is insufficient',
      valuation: 'requires a timestamped source observation; valuation is not revenue',
      revenue: 'requires separate qualifying economic evidence and settlement/ledger evidence'
    },
    freshnessHours: FRESHNESS_HOURS,
    prohibitions: [
      'wallet balance is not automatically revenue',
      'market value is not automatically revenue',
      'public metadata is not ownership proof',
      'authentication is not authorization',
      'a stale observation is not a current balance assertion',
      'AI cannot manufacture missing evidence'
    ],
    humanAuthority: true
  };
}

async function verifyOneAccount(account: any, evidence: any[]): Promise<VerificationResult> {
  const accountEvidence = evidence.filter(e => e.asset_account_id === account.id);
  const warnings: string[] = [];
  const reasons: string[] = [];
  const refs = accountEvidence.map(e => e.id);
  const authorized = account.status === 'authorized' && !!account.connectionId;
  const fresh = accountEvidence.some(e => ageHours(e.observed_at) <= FRESHNESS_HOURS);
  const hashed = accountEvidence.filter(e => !!e.payload_hash).length > 0;

  if (!authorized) reasons.push('Account is not linked to an authorized connection.');
  if (!accountEvidence.length) reasons.push('No asset evidence record exists for this account.');
  if (!fresh) warnings.push('No fresh account evidence was observed within the verification freshness window.');
  if (!hashed && accountEvidence.length) warnings.push('Evidence exists but no payload hash is recorded.');

  const status = authorized && accountEvidence.length && fresh && hashed
    ? 'verified'
    : authorized && accountEvidence.length
      ? 'partially-verified'
      : 'not-verified';

  return {
    status,
    checks: { authorizedConnection: authorized, evidencePresent: accountEvidence.length > 0, freshEvidence: fresh, payloadHashPresent: hashed },
    evidenceRefs: refs,
    warnings,
    reasons
  };
}

async function verifyOneHolding(holding: any, account: any, evidence: any[]): Promise<VerificationResult> {
  const holdingEvidence = evidence.filter(e => e.holding_id === holding.id || e.id === holding.evidence_ref);
  const warnings: string[] = [];
  const reasons: string[] = [];
  const refs = holdingEvidence.map(e => e.id);
  const accountAuthorized = account?.status === 'authorized' && !!account?.connectionId;
  const sourceBacked = holdingEvidence.some(e => !!e.source && !!e.source_ref);
  const hashed = holdingEvidence.some(e => !!e.payload_hash);
  const fresh = holdingEvidence.some(e => ageHours(e.observed_at) <= FRESHNESS_HOURS);
  const valuationConsistent = holding.market_value == null ||
    (holding.quantity != null && holding.market_price != null &&
      Math.abs(Number(holding.market_value) - Number(holding.quantity) * Number(holding.market_price)) <= Math.max(0.01, Math.abs(Number(holding.market_value)) * 0.01));

  if (!accountAuthorized) reasons.push('Owning account is not currently linked to an authorized connection.');
  if (!sourceBacked) reasons.push('No source-backed evidence is linked to this holding.');
  if (!hashed) warnings.push('Holding evidence lacks a payload hash.');
  if (!fresh) warnings.push('Holding evidence is stale or has no valid observation timestamp.');
  if (!valuationConsistent) warnings.push('Recorded market value is inconsistent with quantity × market price beyond tolerance.');
  if (!holding.evidence_ref) warnings.push('Holding has no direct evidence_ref.');
  if (holding.verification_status === 'verified') warnings.push('Stored verified flag must remain backed by qualifying evidence; this endpoint does not infer ownership.');

  const observationVerified = accountAuthorized && sourceBacked && hashed && fresh && valuationConsistent;
  const ownershipVerified = observationVerified && holdingEvidence.some(e =>
    /ownership|custody|account_snapshot|broker_snapshot|wallet_proof|chain_proof/i.test(String(e.evidence_type))
  );

  return {
    status: observationVerified ? (ownershipVerified ? 'verified' : 'partially-verified') : 'not-verified',
    checks: {
      authorizedConnection: accountAuthorized,
      sourceBackedEvidence: sourceBacked,
      payloadHashPresent: hashed,
      freshEvidence: fresh,
      valuationConsistent,
      ownershipEvidence: ownershipVerified
    },
    evidenceRefs: refs,
    warnings,
    reasons
  };
}

export async function verifyAllAssets(options: { assetAccountId?: string; holdingId?: string; freshnessHours?: number } = {}) {
  const freshness = Math.max(1, Math.min(168, Number(options.freshnessHours || FRESHNESS_HOURS)));
  const [accounts, holdings, evidence] = await Promise.all([
    listAssetAccounts(),
    listAssetHoldings(),
    listAssetEvidence(options.assetAccountId, 500)
  ]);

  const selectedAccounts = accounts.filter(a => !options.assetAccountId || a.id === options.assetAccountId);
  const selectedHoldings = holdings.filter(h =>
    (!options.assetAccountId || h.asset_account_id === options.assetAccountId) &&
    (!options.holdingId || h.id === options.holdingId)
  );

  const originalFreshness = FRESHNESS_HOURS;
  void originalFreshness;
  const accountResults = await Promise.all(selectedAccounts.map(a => verifyOneAccount(a, evidence)));
  const holdingResults = await Promise.all(selectedHoldings.map(h => verifyOneHolding(h, selectedAccounts.find(a => a.id === h.asset_account_id), evidence)));

  const verifiedAccounts = accountResults.filter(r => r.status === 'verified').length;
  const verifiedHoldings = holdingResults.filter(r => r.status === 'verified').length;
  const partialHoldings = holdingResults.filter(r => r.status === 'partially-verified').length;
  const warnings = [...accountResults, ...holdingResults].flatMap(r => r.warnings);
  const reasons = [...accountResults, ...holdingResults].flatMap(r => r.reasons);

  const estimatedMarketValue = selectedHoldings.reduce((sum, h) => sum + (Number(h.market_value) || 0), 0);
  const revenueVerified = false;

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    policy: { ...getAssetVerificationPolicy(), freshnessHours: freshness },
    scope: { assetAccountId: options.assetAccountId || null, holdingId: options.holdingId || null },
    summary: {
      accountCount: selectedAccounts.length,
      holdingCount: selectedHoldings.length,
      evidenceCount: evidence.length,
      verifiedAccounts,
      verifiedHoldings,
      partiallyVerifiedHoldings: partialHoldings,
      notVerifiedHoldings: selectedHoldings.length - verifiedHoldings - partialHoldings,
      estimatedMarketValueUsd: Math.round(estimatedMarketValue * 100) / 100,
      estimatedMarketValueIsNotRevenue: true,
      verifiedRevenue: revenueVerified
    },
    accounts: selectedAccounts.map((account, i) => ({ ...account, verification: accountResults[i] })),
    holdings: selectedHoldings.map((holding, i) => ({ ...holding, verification: holdingResults[i] })),
    evidence: evidence.map(e => ({
      id: e.id,
      assetAccountId: e.asset_account_id,
      holdingId: e.holding_id,
      evidenceType: e.evidence_type,
      source: e.source,
      sourceRefPresent: !!e.source_ref,
      observedAt: e.observed_at,
      ageHours: Number(ageHours(e.observed_at).toFixed(2)),
      payloadHashPresent: !!e.payload_hash
    })),
    warnings,
    reasons,
    economicTruth: {
      ownership: 'Only explicit qualifying ownership/custody evidence can establish ownership.',
      valuation: 'Observed/estimated market value is not verified revenue.',
      revenue: 'No asset verification result by itself creates verified revenue.',
      verifiedRevenue
    }
  };
}

export async function buildAssetVerificationAttestation(options: { assetAccountId?: string; holdingId?: string } = {}) {
  const report = await verifyAllAssets(options);
  const canonical = JSON.stringify(report);
  const attestationHash = crypto.createHash('sha256').update(canonical).digest('hex');
  return {
    attestationId: `asset-attestation-${crypto.randomUUID()}`,
    generatedAt: report.generatedAt,
    attestationHash,
    algorithm: 'SHA-256',
    report
  };
}
