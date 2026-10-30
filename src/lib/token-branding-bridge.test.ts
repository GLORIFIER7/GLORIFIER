import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessBrandingProvider,
  buildTokenBrandingInspection,
  validateTokenBrandingRecord,
  type BrandingProvider,
  type TokenBrandingRecord
} from './token-branding-bridge';

const validToken: TokenBrandingRecord = {
  assetId: 'glr',
  network: 'Ethereum Mainnet',
  chainId: 1,
  standard: 'ERC-20',
  contractOrMint: '0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb',
  tokenSymbol: 'GLR',
  evidenceStatus: 'VERIFIED',
  logo: {
    uri: 'ipfs://bafybeige7flx4sbd4nbw5vlwgqdvbcethz3tucu6r3ij47vfrl6l34g6vrq',
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    integrityStatus: 'VERIFIED'
  }
};

const freeManualProvider: BrandingProvider = {
  id: 'etherscan',
  name: 'Etherscan',
  mode: 'manual',
  requirements: ['owner verification', 'verified source', 'provider-specific image'],
  feeStatus: 'FREE',
  enabled: true
};

test('accepts a valid EVM token and verified logo reference', () => {
  assert.deepEqual(validateTokenBrandingRecord(validToken), []);
});

test('rejects malformed addresses and unverified logo hashes', () => {
  const invalid = {
    ...validToken,
    contractOrMint: 'not-an-address',
    logo: { ...validToken.logo, sha256: 'bad', integrityStatus: 'PENDING' as const }
  };
  assert.ok(validateTokenBrandingRecord(invalid).some((item) => item.includes('invalid EVM')));
  assert.ok(validateTokenBrandingRecord(invalid).some((item) => item.includes('64 hexadecimal')));
});

test('does not mark a manual provider as published or automatically submit', () => {
  const result = assessBrandingProvider(validToken, freeManualProvider);
  assert.equal(result.status, 'MANUAL_ACTION_REQUIRED');
  assert.equal(result.publicationStatus, 'NOT_SUBMITTED');
});

test('blocks publication readiness when evidence or image integrity is incomplete', () => {
  const token = {
    ...validToken,
    evidenceStatus: 'PARTIALLY_VERIFIED' as const,
    logo: { ...validToken.logo, integrityStatus: 'PENDING' as const }
  };
  const result = assessBrandingProvider(token, freeManualProvider);
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.blockers.some((item) => item.includes('token evidence status')));
  assert.ok(result.blockers.some((item) => item.includes('byte integrity')));
});

test('inspection is explicitly read-only and reports zero published logos', () => {
  const result = buildTokenBrandingInspection([validToken], [freeManualProvider]);
  assert.equal(result.mode, 'READ_ONLY_INSPECTION');
  assert.equal(result.publicationClaim, false);
  assert.equal(result.summary.publishedCount, 0);
});


const validSolanaToken: TokenBrandingRecord = {
  ...validToken,
  network: 'Solana Mainnet Beta',
  chainId: 'solana:mainnet-beta',
  standard: 'Token-2022',
  contractOrMint: '7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9'
};

test('rejects chain ID and token-standard mismatches for a named network', () => {
  const mismatched = { ...validToken, chainId: 56, standard: 'BEP-20' };
  const errors = validateTokenBrandingRecord(mismatched);
  assert.ok(errors.some((item) => item.includes('chainId')));
  assert.ok(errors.some((item) => item.includes('standard')));
});

test('accepts the documented Solana Mainnet Beta identity', () => {
  assert.deepEqual(validateTokenBrandingRecord(validSolanaToken), []);
});

test('rejects Solana Devnet from production branding inspection', () => {
  const devnet = {
    ...validSolanaToken,
    network: 'Solana Devnet',
    chainId: 'solana:devnet'
  };
  const errors = validateTokenBrandingRecord(devnet);
  assert.ok(errors.some((item) => /devnet|unsupported production network/i.test(item)));
});

test('rejects base58 strings that do not decode to a 32-byte Solana address', () => {
  const invalid = { ...validSolanaToken, contractOrMint: 'z'.repeat(32) };
  assert.ok(validateTokenBrandingRecord(invalid).some((item) => item.includes('invalid Solana mint address')));
});

test('rejects empty and malformed IPFS or HTTPS logo references', () => {
  for (const uri of ['ipfs://', 'ipfs://not-a-cid', 'https://']) {
    const invalid = { ...validToken, logo: { ...validToken.logo, uri } };
    assert.ok(validateTokenBrandingRecord(invalid).some((item) => item.includes('logo URI')));
  }
});

test('requires human confirmation for providers with declared requirements', () => {
  const apiProvider: BrandingProvider = {
    ...freeManualProvider,
    mode: 'api',
    requirements: ['owner verification']
  };
  const result = assessBrandingProvider(validToken, apiProvider);
  assert.equal(result.status, 'MANUAL_ACTION_REQUIRED');
  assert.ok(result.blockers.some((item) => item.includes('owner verification')));
});

test('does not mix token validation errors into a not-configured provider result', () => {
  const invalidToken = { ...validToken, contractOrMint: 'invalid' };
  const disabledProvider = { ...freeManualProvider, enabled: false };
  const result = assessBrandingProvider(invalidToken, disabledProvider);
  assert.equal(result.status, 'NOT_CONFIGURED');
  assert.deepEqual(result.blockers, ['provider adapter is not enabled']);
});

test('computes token validation once per token when building a multi-provider inspection', () => {
  let tokenSymbolReads = 0;
  const observedToken = new Proxy(validToken, {
    get(target, property, receiver) {
      if (property === 'tokenSymbol') tokenSymbolReads += 1;
      return Reflect.get(target, property, receiver);
    }
  });
  buildTokenBrandingInspection([observedToken], [
    freeManualProvider,
    { ...freeManualProvider, id: 'second', name: 'Second provider' }
  ]);
  assert.equal(tokenSymbolReads, 1);
});
