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

export type ProviderSummary = {
  providerId: string;
  providerName: string;
  status: ProviderAssessment['status'];
  publicationStatus: ProviderAssessment['publicationStatus'];
  tokenCount: number;
  blockedCount: number;
  manualActionCount: number;
  notConfiguredCount: number;
  tokenAssessments: Array<{
    assetId: string;
    network: string;
    status: ProviderAssessment['status'];
    blockers: string[];
  }>;
};

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const SHA256 = /^[a-f0-9]{64}$/i;
const CID_V0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1_BASE32 = /^b[a-z2-7]{20,120}$/;

type SupportedNetworkIdentity = {
  name: string;
  aliases: string[];
  chainId: number | 'solana:mainnet-beta';
  standard: string;
  addressKind: 'evm' | 'solana';
};

const SUPPORTED_NETWORKS: SupportedNetworkIdentity[] = [
  {
    name: 'Ethereum Mainnet',
    aliases: ['ethereum mainnet'],
    chainId: 1,
    standard: 'ERC-20',
    addressKind: 'evm'
  },
  {
    name: 'BNB Smart Chain Mainnet',
    aliases: ['bnb smart chain', 'bnb smart chain mainnet'],
    chainId: 56,
    standard: 'BEP-20',
    addressKind: 'evm'
  },
  {
    name: 'Base Mainnet',
    aliases: ['base mainnet'],
    chainId: 8453,
    standard: 'ERC-20',
    addressKind: 'evm'
  },
  {
    name: 'Solana Mainnet Beta',
    aliases: ['solana mainnet beta'],
    chainId: 'solana:mainnet-beta',
    standard: 'Token-2022',
    addressKind: 'solana'
  }
];

function isValidSolanaAddress(value: string): boolean {
  if (!SOLANA_MINT.test(value)) return false;

  let decoded = 0n;
  for (const character of value) {
    const digit = BASE58_ALPHABET.indexOf(character);
    if (digit < 0) return false;
    decoded = decoded * 58n + BigInt(digit);
  }

  let decodedByteLength = 0;
  while (decoded > 0n) {
    decodedByteLength += 1;
    decoded >>= 8n;
  }

  let leadingZeroBytes = 0;
  while (leadingZeroBytes < value.length && value[leadingZeroBytes] === '1') {
    leadingZeroBytes += 1;
  }

  return decodedByteLength + leadingZeroBytes === 32;
}

function isValidIpfsReference(value: string): boolean {
  const reference = value.slice('ipfs://'.length);
  const [cid, ...pathSegments] = reference.split('/');
  const validCid = CID_V0.test(cid) || CID_V1_BASE32.test(cid);
  return validCid && pathSegments.every((segment) => segment.length > 0);
}

function isValidLogoUri(uri: unknown): uri is string {
  if (typeof uri !== 'string') return false;
  const value = uri.trim();
  if (value.startsWith('ipfs://')) return isValidIpfsReference(value);

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:'
      && Boolean(parsed.hostname)
      && !parsed.username
      && !parsed.password;
  } catch {
    return false;
  }
}

export function validateTokenBrandingRecord(record: TokenBrandingRecord): string[] {
  const errors: string[] = [];
  const assetId = record.assetId;
  const networkName = typeof record.network === 'string' ? record.network.trim() : '';
  const tokenSymbol = record.tokenSymbol;
  const contractOrMint = record.contractOrMint;
  const standardValue = record.standard;
  const logo = record.logo;

  if (typeof assetId !== 'string' || !assetId.trim()) errors.push('assetId is required');
  if (!networkName) errors.push('network is required');
  if (typeof tokenSymbol !== 'string' || !tokenSymbol.trim()) errors.push('tokenSymbol is required');
  if (typeof contractOrMint !== 'string' || !contractOrMint.trim()) errors.push('contractOrMint is required');
  if (typeof standardValue !== 'string' || !standardValue.trim()) errors.push('standard is required');

  if (/devnet|testnet/i.test(networkName)) {
    errors.push('development and test networks are not supported for production branding');
  }

  const normalizedNetwork = networkName.toLowerCase();
  const networkIdentity = SUPPORTED_NETWORKS.find((identity) => identity.aliases.includes(normalizedNetwork));
  if (networkName && !networkIdentity) {
    errors.push('unsupported production network: ' + networkName);
  }

  const chainId = typeof record.chainId === 'string'
    ? record.chainId.trim()
    : String(record.chainId ?? '');
  if (!chainId) errors.push('chainId is required');

  const chainIdentity = SUPPORTED_NETWORKS.find((identity) => String(identity.chainId) === chainId);
  if (chainId && !chainIdentity) {
    errors.push(chainId.startsWith('solana:') ? 'unsupported Solana cluster' : 'unsupported chainId');
  }

  if (networkIdentity && chainIdentity && networkIdentity !== chainIdentity) {
    errors.push('network and chainId do not identify the same supported network');
  }

  const identity = chainIdentity ?? networkIdentity;
  if (identity && chainId !== String(identity.chainId)) {
    errors.push('chainId must be ' + identity.chainId + ' for ' + identity.name);
  }

  const standard = typeof standardValue === 'string' ? standardValue.trim().toLowerCase() : '';
  if (identity && standard !== identity.standard.toLowerCase()) {
    errors.push('standard must be ' + identity.standard + ' for ' + identity.name);
  }

  if (chainIdentity?.addressKind === 'solana') {
    if (typeof contractOrMint !== 'string' || !isValidSolanaAddress(contractOrMint)) {
      errors.push('invalid Solana mint address (expected a base58-encoded 32-byte address)');
    }
  } else if (chainIdentity?.addressKind === 'evm') {
    if (typeof contractOrMint !== 'string' || !EVM_ADDRESS.test(contractOrMint)) {
      errors.push('invalid EVM contract address');
    }
  }

  if (!isValidLogoUri(logo?.uri)) {
    errors.push('logo URI must be a valid IPFS CID reference or HTTPS URL with a host');
  }
  const logoSha256 = typeof logo?.sha256 === 'string' ? logo.sha256 : '';
  if (logo?.sha256 && !SHA256.test(logoSha256)) {
    errors.push('logo SHA-256 must be 64 hexadecimal characters');
  }
  if (logo?.integrityStatus === 'VERIFIED' && !logoSha256) {
    errors.push('verified logo integrity requires a SHA-256 digest');
  }
  return errors;
}

export function assessBrandingProvider(
  token: TokenBrandingRecord,
  provider: BrandingProvider,
  precomputedValidationErrors?: string[]
): ProviderAssessment {
  if (!provider.enabled || provider.mode === 'unsupported') {
    return {
      providerId: provider.id,
      providerName: provider.name,
      mode: provider.mode,
      status: 'NOT_CONFIGURED',
      blockers: [
        !provider.enabled
          ? 'provider adapter is not enabled'
          : 'no supported submission workflow is configured'
      ],
      publicationStatus: 'NOT_SUBMITTED'
    };
  }

  const validationErrors = precomputedValidationErrors ?? validateTokenBrandingRecord(token);
  const blockers = [...validationErrors];
  if (token.evidenceStatus !== 'VERIFIED') {
    blockers.push('token evidence status is ' + token.evidenceStatus);
  }
  if (token.logo?.integrityStatus !== 'VERIFIED') {
    blockers.push('canonical logo byte integrity is not verified');
  }
  if (provider.feeStatus === 'PAID') blockers.push('paid submission requires separate owner approval');
  if (provider.feeStatus === 'UNKNOWN') blockers.push('provider fee requirements are unknown');

  const requirements = (provider.requirements ?? [])
    .filter((requirement) => typeof requirement === 'string' && requirement.trim().length > 0);
  blockers.push(...requirements.map((requirement) => (
    'provider requirement requires human confirmation: ' + requirement.trim()
  )));

  const hasHardBlockers = validationErrors.length > 0
    || token.evidenceStatus !== 'VERIFIED'
    || token.logo?.integrityStatus !== 'VERIFIED'
    || provider.feeStatus === 'PAID'
    || provider.feeStatus === 'UNKNOWN';

  let status: ProviderAssessment['status'];
  if (hasHardBlockers) status = 'BLOCKED';
  else if (provider.mode === 'manual' || provider.mode === 'repository' || requirements.length > 0) {
    status = 'MANUAL_ACTION_REQUIRED';
  } else status = 'READY_FOR_REVIEW';

  return {
    providerId: provider.id,
    providerName: provider.name,
    mode: provider.mode,
    status,
    blockers,
    publicationStatus: 'NOT_SUBMITTED'
  };
}

export function summarizeProviderAssessments(
  tokens: Array<{ assetId: string; network: string; providers: ProviderAssessment[] }>
): ProviderSummary[] {
  const groups = new Map<string, {
    providerId: string;
    providerName: string;
    assessments: Array<{
      assetId: string;
      network: string;
      status: ProviderAssessment['status'];
      blockers: string[];
      publicationStatus: ProviderAssessment['publicationStatus'];
    }>;
  }>();

  for (const token of tokens) {
    for (const assessment of token.providers) {
      let group = groups.get(assessment.providerId);
      if (!group) {
        group = {
          providerId: assessment.providerId,
          providerName: assessment.providerName,
          assessments: []
        };
        groups.set(assessment.providerId, group);
      }
      group.assessments.push({
        assetId: token.assetId,
        network: token.network,
        status: assessment.status,
        blockers: [...assessment.blockers],
        publicationStatus: assessment.publicationStatus
      });
    }
  }

  return Array.from(groups.values()).map((group) => {
    const blockedCount = group.assessments.filter((item) => item.status === 'BLOCKED').length;
    const manualActionCount = group.assessments.filter((item) => item.status === 'MANUAL_ACTION_REQUIRED').length;
    const notConfiguredCount = group.assessments.filter((item) => item.status === 'NOT_CONFIGURED').length;
    const status: ProviderAssessment['status'] = blockedCount > 0
      ? 'BLOCKED'
      : notConfiguredCount > 0
        ? 'NOT_CONFIGURED'
        : manualActionCount > 0
          ? 'MANUAL_ACTION_REQUIRED'
          : 'READY_FOR_REVIEW';
    const publicationStatus: ProviderAssessment['publicationStatus'] = group.assessments
      .some((item) => item.publicationStatus === 'NOT_VERIFIED')
      ? 'NOT_VERIFIED'
      : 'NOT_SUBMITTED';

    return {
      providerId: group.providerId,
      providerName: group.providerName,
      status,
      publicationStatus,
      tokenCount: group.assessments.length,
      blockedCount,
      manualActionCount,
      notConfiguredCount,
      tokenAssessments: group.assessments.map(({ assetId, network, status: tokenStatus, blockers }) => ({
        assetId,
        network,
        status: tokenStatus,
        blockers
      }))
    };
  });
}

export function buildTokenBrandingInspection(
  tokens: TokenBrandingRecord[],
  providers: BrandingProvider[]
) {
  const tokenResults = tokens.map((token) => {
    const snapshot: TokenBrandingRecord = {
      assetId: token.assetId,
      network: token.network,
      chainId: token.chainId,
      standard: token.standard,
      contractOrMint: token.contractOrMint,
      tokenSymbol: token.tokenSymbol,
      evidenceStatus: token.evidenceStatus,
      logo: { ...token.logo }
    };
    const validationErrors = validateTokenBrandingRecord(snapshot);
    const assessments = providers.map((provider) => (
      assessBrandingProvider(snapshot, provider, validationErrors)
    ));
    return {
      ...snapshot,
      validationErrors,
      providers: assessments
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_INSPECTION' as const,
    publicationClaim: false,
    tokens: tokenResults,
    providerSummaries: summarizeProviderAssessments(tokenResults),
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
