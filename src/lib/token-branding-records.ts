import type { TokenBrandingRecord } from './token-branding-bridge';

export const CANDIDATE_GLORIFIER_LOGO_URI =
  'ipfs://bafybeige7flx4sbd4nbw5vlwgqdvbcethz3tucu6r3ij47vfrl6l34g6vrq';

// These are locally recorded token identifiers, not live chain observations.
// The branding screen does not query explorers or RPC endpoints, so the records
// intentionally remain NOT_VERIFIED until a scoped live verifier supplies evidence.
export const TOKEN_BRANDING_RECORDS: TokenBrandingRecord[] = [
  {
    assetId: 'glr-ethereum',
    network: 'Ethereum Mainnet',
    chainId: 1,
    standard: 'ERC-20',
    contractOrMint: '0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb',
    tokenSymbol: 'GLR',
    evidenceStatus: 'NOT_VERIFIED',
    logo: { uri: CANDIDATE_GLORIFIER_LOGO_URI, integrityStatus: 'PENDING' },
  },
  {
    assetId: 'glr-bnb',
    network: 'BNB Smart Chain',
    chainId: 56,
    standard: 'BEP-20',
    contractOrMint: '0x5e0B0A449232FDA7cA6Ea3419A50873b08F64804',
    tokenSymbol: 'GLR',
    evidenceStatus: 'NOT_VERIFIED',
    logo: { uri: CANDIDATE_GLORIFIER_LOGO_URI, integrityStatus: 'PENDING' },
  },
  {
    assetId: 'glr-base',
    network: 'Base Mainnet',
    chainId: 8453,
    standard: 'ERC-20',
    contractOrMint: '0x43b09fc339DA35117c966ceaCC3Ea8C8f83c11ce',
    tokenSymbol: 'GLR',
    evidenceStatus: 'NOT_VERIFIED',
    logo: { uri: CANDIDATE_GLORIFIER_LOGO_URI, integrityStatus: 'PENDING' },
  },
  {
    assetId: 'glr-solana-mainnet',
    network: 'Solana Mainnet Beta',
    chainId: 'solana:mainnet-beta',
    standard: 'Token-2022',
    contractOrMint: '7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9',
    tokenSymbol: 'GLR',
    evidenceStatus: 'NOT_VERIFIED',
    logo: { uri: CANDIDATE_GLORIFIER_LOGO_URI, integrityStatus: 'PENDING' },
  },
];
