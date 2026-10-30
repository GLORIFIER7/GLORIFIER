export type BrandingStatus =
  | 'VERIFIED'
  | 'PARTIALLY_VERIFIED'
  | 'NOT_VERIFIED'
  | 'NOT_OBSERVABLE'
  | 'SUBMISSION_REQUIRED'
  | 'REVIEW_REQUIRED';

export type TokenBrandingRecord = {
  assetId: string;
  network: string;
  chainId: number | string;
  standard: string;
  contractOrMint: string;
  tokenSymbol: string;
  evidenceStatus: BrandingStatus;
  logo: {
    uri: string;
    sha256?: string;
    integrityStatus: 'VERIFIED' | 'MISMATCH' | 'PENDING';
  };
};

export type BrandingProvider = {
  id: string;
  name: string;
  mode: 'api' | 'manual' | 'repository' | 'unsupported';
  requirements: string[];
  feeStatus: 'FREE' | 'PAID' | 'UNKNOWN';
  enabled: boolean;
};

export type ProviderAssessment = {
  providerId: string;
  providerName: string;
  mode: BrandingProvider['mode'];
  status: 'READY_FOR_REVIEW' | 'BLOCKED' | 'MANUAL_ACTION_REQUIRED' | 'NOT_CONFIGURED';
  blockers: string[];
  publicationStatus: 'NOT_SUBMITTED' | 'NOT_VERIFIED';
};

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SHA256 = /^[a-f0-9]{64}$/i;

export function validateTokenBrandingRecord(record: TokenBrandingRecord): string[] {
  const errors: string[] = [];
  if (!record.assetId.trim()) errors.push('assetId is required');
  if (!record.network.trim()) errors.push('network is required');
  if (!record.tokenSymbol.trim()) errors.push('tokenSymbol is required');
  if (!record.contractOrMint.trim()) errors.push('contractOrMint is required');
  if (record.network.toLowerCase().includes('solana')) {
    if (!SOLANA_MINT.test(record.contractOrMint)) errors.push('invalid Solana mint address');
  } else if (!EVM_ADDRESS.test(record.contractOrMint)) {
    errors.push('invalid EVM contract address');
  }
  if (!record.logo.uri.startsWith('ipfs://') && !record.logo.uri.startsWith('https://')) {
    errors.push('logo URI must use ipfs:// or https://');
  }
  if (record.logo.sha256 && !SHA256.test(record.logo.sha256)) {
    errors.push('logo SHA-256 must be 64 hexadecimal characters');
  }
  if (record.logo.integrityStatus === 'VERIFIED' && !record.logo.sha256) {
    errors.push('verified logo integrity requires a SHA-256 digest');
  }
  return errors;
}

export function assessBrandingProvider(
  token: TokenBrandingRecord,
  provider: BrandingProvider
): ProviderAssessment {
  const blockers = validateTokenBrandingRecord(token);
  if (token.evidenceStatus !== 'VERIFIED') {
    blockers.push(`token evidence status is ${token.evidenceStatus}`);
  }
  if (token.logo.integrityStatus !== 'VERIFIED') {
    blockers.push('canonical logo byte integrity is not verified');
  }
  if (!provider.enabled) blockers.push('provider adapter is not enabled');
  if (provider.feeStatus === 'PAID') blockers.push('paid submission requires separate owner approval');
  if (provider.feeStatus === 'UNKNOWN') blockers.push('provider fee requirements are unknown');
  if (provider.mode === 'unsupported') blockers.push('no supported submission workflow is configured');

  let status: ProviderAssessment['status'];
  if (!provider.enabled || provider.mode === 'unsupported') status = 'NOT_CONFIGURED';
  else if (blockers.length > 0) status = 'BLOCKED';
  else if (provider.mode === 'manual' || provider.mode === 'repository') status = 'MANUAL_ACTION_REQUIRED';
  else status = 'READY_FOR_REVIEW';

  return {
    providerId: provider.id,
    providerName: provider.name,
    mode: provider.mode,
    status,
    blockers,
    // An adapter assessment is never evidence of publication.
    publicationStatus: 'NOT_SUBMITTED'
  };
}

export function buildTokenBrandingInspection(
  tokens: TokenBrandingRecord[],
  providers: BrandingProvider[]
) {
  const tokenResults = tokens.map((token) => ({
    assetId: token.assetId,
    network: token.network,
    contractOrMint: token.contractOrMint,
    validationErrors: validateTokenBrandingRecord(token),
    providers: providers.map((provider) => assessBrandingProvider(token, provider))
  }));

  return {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_INSPECTION' as const,
    publicationClaim: false,
    tokens: tokenResults,
    summary: {
      tokenCount: tokens.length,
      providerCount: providers.length,
      blockedAssessments: tokenResults.reduce(
        (total, token) => total + token.providers.filter((item) => item.status === 'BLOCKED').length,
        0
      ),
      publishedCount: 0
    }
  };
}
