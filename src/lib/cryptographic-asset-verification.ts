import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { recordAssetEvidence } from './asset-registry';

export const GLORIFIER_CRYPTO_ASSET_VERIFICATION_VERSION = 'GCAV-1.0';

export type CryptographicAssetProof = {
  challengeId: string;
  assetRef: string;
  provider?: string;
  claimType: 'control' | 'ownership' | 'custody';
  observedAt: string;
  publicKeyPem: string;
  signatureBase64: string;
  algorithm?: 'Ed25519';
  sourceRef?: string;
  metadata?: Record<string, unknown>;
};

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  return '{' + Object.keys(value as Record<string, unknown>).sort()
    .map(key => JSON.stringify(key) + ':' + canonicalize((value as Record<string, unknown>)[key]))
    .join(',') + '}';
}

function proofMessage(challenge: { id: string; nonce: string; assetAccountId: string | null; expiresAt: string }, proof: CryptographicAssetProof) {
  return canonicalize({
    challengeId: challenge.id,
    nonce: challenge.nonce,
    assetAccountId: challenge.assetAccountId,
    assetRef: proof.assetRef,
    provider: proof.provider || null,
    claimType: proof.claimType,
    observedAt: proof.observedAt,
    algorithm: proof.algorithm || 'Ed25519',
    sourceRef: proof.sourceRef || null,
    metadata: proof.metadata || {}
  });
}

export async function initializeCryptographicAssetVerification() {
  await getPostgresPool().query(`
    CREATE TABLE IF NOT EXISTS asset_crypto_challenges (
      id TEXT PRIMARY KEY,
      nonce TEXT NOT NULL UNIQUE,
      asset_account_id TEXT,
      purpose TEXT NOT NULL DEFAULT 'asset-control-proof',
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_asset_crypto_challenges_expiry ON asset_crypto_challenges(expires_at);
  `);
}

export async function issueAssetCryptographicChallenge(input: { assetAccountId?: string; ttlSeconds?: number } = {}) {
  await initializeCryptographicAssetVerification();
  const ttl = Math.max(30, Math.min(900, Number(input.ttlSeconds || 300)));
  const id = `asset-challenge-${crypto.randomUUID()}`;
  const nonce = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  await getPostgresPool().query(
    'INSERT INTO asset_crypto_challenges(id,nonce,asset_account_id,expires_at) VALUES($1,$2,$3,$4)',
    [id, nonce, input.assetAccountId || null, expiresAt]
  );
  return {
    challengeId: id,
    nonce,
    assetAccountId: input.assetAccountId || null,
    expiresAt,
    algorithm: 'Ed25519',
    protocol: 'challenge-response',
    instruction: 'Sign the canonical challenge-bound asset proof with the private key. Never send the private key to GLORIFIER.'
  };
}

export async function verifyAssetCryptographicProof(proof: CryptographicAssetProof) {
  await initializeCryptographicAssetVerification();
  const db = getPostgresPool();
  const challengeResult = await db.query(
    'SELECT id,nonce,asset_account_id,expires_at,used_at FROM asset_crypto_challenges WHERE id=$1',
    [proof.challengeId]
  );
  const challenge = challengeResult.rows[0];
  if (!challenge) return { ok: false, status: 'not-verified', reason: 'Cryptographic challenge not found.' };
  if (challenge.used_at) return { ok: false, status: 'not-verified', reason: 'Cryptographic challenge has already been consumed.' };
  if (new Date(challenge.expires_at).getTime() <= Date.now()) return { ok: false, status: 'not-verified', reason: 'Cryptographic challenge has expired.' };
  if (!proof.assetRef || !proof.observedAt || !proof.publicKeyPem || !proof.signatureBase64) {
    return { ok: false, status: 'not-verified', reason: 'Missing required cryptographic proof fields.' };
  }
  if ((proof.algorithm || 'Ed25519') !== 'Ed25519') {
    return { ok: false, status: 'not-verified', reason: 'Only Ed25519 is enabled for the provider-neutral proof protocol.' };
  }
  if (challenge.asset_account_id && proof.metadata?.assetAccountId && challenge.asset_account_id !== proof.metadata.assetAccountId) {
    return { ok: false, status: 'not-verified', reason: 'Challenge asset-account binding does not match the submitted proof.' };
  }

  const message = proofMessage({
    id: challenge.id,
    nonce: challenge.nonce,
    assetAccountId: challenge.asset_account_id,
    expiresAt: new Date(challenge.expires_at).toISOString()
  }, proof);

  let signatureValid = false;
  try {
    const publicKey = crypto.createPublicKey(proof.publicKeyPem);
    signatureValid = crypto.verify(null, Buffer.from(message), publicKey, Buffer.from(proof.signatureBase64, 'base64'));
  } catch {
    signatureValid = false;
  }

  if (!signatureValid) {
    return { ok: false, status: 'not-verified', reason: 'Cryptographic signature verification failed.' };
  }

  const payloadHash = crypto.createHash('sha256').update(message).digest('hex');
  await db.query('UPDATE asset_crypto_challenges SET used_at=NOW() WHERE id=$1 AND used_at IS NULL', [proof.challengeId]);

  const evidence = await recordAssetEvidence({
    assetAccountId: challenge.asset_account_id,
    evidenceType: proof.claimType === 'ownership' ? 'cryptographic_ownership_proof' : proof.claimType === 'custody' ? 'cryptographic_custody_proof' : 'cryptographic_control_proof',
    source: proof.provider || 'cryptographic-proof',
    sourceRef: proof.sourceRef || proof.assetRef,
    observedAt: proof.observedAt,
    payloadHash,
    details: {
      algorithm: 'Ed25519',
      challengeId: proof.challengeId,
      assetRef: proof.assetRef,
      claimType: proof.claimType,
      publicKeyFingerprint: crypto.createHash('sha256').update(proof.publicKeyPem).digest('hex'),
      metadata: proof.metadata || {}
    }
  });

  return {
    ok: true,
    status: proof.claimType === 'ownership' || proof.claimType === 'custody' ? 'verified' : 'partially-verified',
    cryptographicAuthentication: true,
    proofOfPrivateKeyControl: true,
    ownershipEstablished: proof.claimType === 'ownership',
    custodyEstablished: proof.claimType === 'custody',
    evidenceId: evidence.id,
    payloadHash,
    algorithm: 'Ed25519',
    warning: 'Cryptographic proof establishes control of the signing key and the signed claim. It does not independently establish legal ownership of a third-party custodial account unless the key is cryptographically bound to that account by the authoritative provider.'
  };
}

export function getCryptographicAssetVerificationPolicy() {
  return {
    version: GLORIFIER_CRYPTO_ASSET_VERIFICATION_VERSION,
    protocol: 'challenge-response with detached Ed25519 signatures',
    privateKeyHandling: 'never transmitted to GLORIFIER',
    verification: ['fresh nonce', 'single-use challenge', 'expiry', 'signature validity', 'asset binding', 'payload SHA-256 evidence hash'],
    trustBoundary: 'cryptographic proof authenticates key control; authoritative provider evidence remains required for custodial-account ownership.',
    noUniversalRegistry: true,
    noBypassOfProviderAuthorization: true
  };
}
