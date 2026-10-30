import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assessBrandingProvider,
  buildTokenBrandingInspection,
  validateTokenBrandingRecord,
  summarizeProviderAssessments,
  type ProviderAssessment,
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
    sha256: '042d37e662566528167d0a1024fafbb900d8ba06faa1bfb358ecd8d6a78d8549',
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

test('rejects unsupported chain and token-standard combinations', () => {
  const invalid = { ...validToken, chainId: 56, network: 'Ethereum Mainnet' };
  assert.ok(validateTokenBrandingRecord(invalid).some((item) => item.includes('chain ID')));
});

test('rejects HTTPS logo URLs without a hostname', () => {
  const invalid = { ...validToken, logo: { ...validToken.logo, uri: 'https://' } };
  assert.ok(validateTokenBrandingRecord(invalid).some((item) => item.includes('valid HTTPS URL')));
});

test('rejects malformed IPFS content identifiers', () => {
  const invalid = { ...validToken, logo: { ...validToken.logo, uri: 'ipfs://not-a-cid' } };
  assert.ok(validateTokenBrandingRecord(invalid).some((item) => item.includes('valid IPFS CID')));
});


const validSolanaToken: TokenBrandingRecord = {
  ...validToken,
  assetId: 'glr-solana-mainnet',
  network: 'Solana Mainnet Beta',
  chainId: 'solana:mainnet-beta',
  standard: 'Token-2022',
  contractOrMint: '7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9'
};

test('rejects non-canonical token standards for BNB and Solana deployments', () => {
  const bnbWithErc20 = {
    ...validToken,
    network: 'BNB Smart Chain',
    chainId: 56,
    standard: 'ERC-20',
    contractOrMint: '0x5e0B0A449232FDA7cA6Ea3419A50873b08F64804'
  };
  const solanaWithSpl = { ...validSolanaToken, standard: 'SPL Token' };
  assert.ok(validateTokenBrandingRecord(bnbWithErc20).some((item) => /BEP-20/.test(item)));
  assert.ok(validateTokenBrandingRecord(solanaWithSpl).some((item) => /Token-2022/.test(item)));
});

test('rejects Solana mint strings that do not decode to exactly 32 bytes', () => {
  const invalid = { ...validSolanaToken, contractOrMint: 'z'.repeat(32) };
  assert.ok(validateTokenBrandingRecord(invalid).some((item) => /32-byte/.test(item)));
});

test('rejects a bare IPFS scheme without a content identifier', () => {
  const invalid = { ...validToken, logo: { ...validToken.logo, uri: 'ipfs://' } };
  assert.ok(validateTokenBrandingRecord(invalid).some((item) => /IPFS CID/.test(item)));
});

test('provider requirements require human confirmation instead of READY_FOR_REVIEW', () => {
  const apiProvider: BrandingProvider = {
    ...freeManualProvider,
    mode: 'api',
    requirements: ['owner verification'],
    feeStatus: 'FREE'
  };
  const result = assessBrandingProvider(validToken, apiProvider);
  assert.equal(result.status, 'MANUAL_ACTION_REQUIRED');
  assert.ok(result.blockers.some((item) => item.includes('owner verification')));
});

test('NOT_CONFIGURED results contain only provider-configuration blockers', () => {
  const invalidToken = { ...validToken, contractOrMint: 'invalid' };
  const disabledProvider = { ...freeManualProvider, enabled: false };
  const result = assessBrandingProvider(invalidToken, disabledProvider);
  assert.equal(result.status, 'NOT_CONFIGURED');
  assert.deepEqual(result.blockers, ['provider adapter is not enabled']);
});

test('inspection computes token validation once and shares the result across providers', () => {
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

test('provider summaries aggregate worst-case status and retain per-token evidence', () => {
  const ready: ProviderAssessment = {
    providerId: 'example',
    providerName: 'Example',
    mode: 'api',
    status: 'READY_FOR_REVIEW',
    blockers: [],
    publicationStatus: 'NOT_SUBMITTED'
  };
  const blocked: ProviderAssessment = {
    ...ready,
    status: 'BLOCKED',
    blockers: ['token evidence is not verified']
  };
  const summaries = summarizeProviderAssessments([
    { assetId: 'glr-eth', network: 'Ethereum Mainnet', providers: [ready] },
    { assetId: 'glr-base', network: 'Base Mainnet', providers: [blocked] }
  ]);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].status, 'BLOCKED');
  assert.equal(summaries[0].tokenCount, 2);
  assert.deepEqual(
    summaries[0].tokenAssessments.map((item) => item.status),
    ['READY_FOR_REVIEW', 'BLOCKED']
  );
});
