type IntegrationStatus =
  | 'responding'
  | 'not-observable'
  | 'configured'
  | 'disabled';

type ConfigurationStatus =
  | 'configured'
  | 'needs-configuration'
  | 'not-observable'
  | 'disabled';

type IntegrationRecord = {
  id: string;
  name: string;
  category: string;
  status: IntegrationStatus;
  detail: string;
  publicUrl: string;
};

type DataStatusRecord = IntegrationRecord & {
  configurationStatus: ConfigurationStatus;
  verificationStatus: 'not-verified';
  verificationEvidence: null;
  truthRule: string;
};

const integrationInventory: IntegrationRecord[] = [
  {
    id: 'cloudflare-worker',
    name: 'Cloudflare Workers',
    category: 'compute',
    status: 'responding',
    detail: 'This request reached the Cloudflare Worker. This does not establish overall application, database, or dependency health.',
    publicUrl: 'https://developers.cloudflare.com/workers/',
  },
  {
    id: 'neon',
    name: 'Neon',
    category: 'data',
    status: 'not-observable',
    detail: 'Private runtime configuration is not exposed by this public endpoint. Live database connectivity and data parity are not asserted.',
    publicUrl: 'https://neon.tech/',
  },
  {
    id: 'opensea',
    name: 'OpenSea',
    category: 'digital-assets',
    status: 'not-observable',
    detail: 'Private runtime configuration is not exposed by this public endpoint. No live OpenSea provider request is performed.',
    publicUrl: 'https://opensea.io/GLORIFIER',
  },
  {
    id: 'github-mcp',
    name: 'GitHub MCP',
    category: 'protocol',
    status: 'not-observable',
    detail: 'Private runtime configuration is not exposed by this public endpoint. The public read-only route implementation does not prove external-client interoperability.',
    publicUrl: 'https://github.com/GLORIFIER7/GLORIFIER',
  },
  {
    id: 'identity',
    name: 'GLORIFIER organization identity',
    category: 'identity',
    status: 'not-observable',
    detail: 'Private runtime configuration is not exposed by this public endpoint. Domain ownership and organization identity remain unverified here.',
    publicUrl: 'https://glorifier.glorifier.workers.dev/api/identity',
  },
  {
    id: 'neural',
    name: 'GLORIFIER-NEURAL',
    category: 'ai-runtime',
    status: 'not-observable',
    detail: 'Private runtime configuration is not exposed by this public endpoint. Neural health, readiness, authentication, and inference are not asserted.',
    publicUrl: 'https://github.com/GLORIFIER7/GLORIFIER-NEURAL',
  },
  {
    id: 'ai-providers',
    name: 'AI provider execution',
    category: 'ai',
    status: 'not-observable',
    detail: 'Private runtime configuration is not exposed by this public endpoint. Live provider inference is not verified.',
    publicUrl: 'https://github.com/GLORIFIER7/GLORIFIER',
  },
  {
    id: 'railway',
    name: 'Railway production runtime',
    category: 'compute',
    status: 'disabled',
    detail: 'Railway is not an active production runtime target for the Cloudflare Worker architecture.',
    publicUrl: 'https://railway.app/',
  },
  {
    id: 'vercel',
    name: 'Vercel production frontend',
    category: 'frontend',
    status: 'disabled',
    detail: 'Vercel is not an active production frontend target. The production frontend is served by Cloudflare Workers.',
    publicUrl: 'https://vercel.com/',
  },
  {
    id: 'netlify-preview',
    name: 'Netlify PR previews',
    category: 'ci-preview',
    status: 'configured',
    detail: 'The GitHub pull-request deploy-preview check is configured for preview builds only. It does not serve production frontend traffic.',
    publicUrl: 'https://www.netlify.com/',
  },
  {
    id: 'netlify-production',
    name: 'Netlify production hosting',
    category: 'frontend',
    status: 'disabled',
    detail: 'Netlify is not an active production frontend target. The production frontend is served by Cloudflare Workers.',
    publicUrl: 'https://www.netlify.com/',
  },
];

const configurationStatusByIntegrationStatus: Record<IntegrationStatus, ConfigurationStatus> = {
  responding: 'not-observable',
  'not-observable': 'not-observable',
  configured: 'configured',
  disabled: 'disabled',
};

/**
 * This inventory is deliberately static. These public endpoints must never
 * reveal whether private bindings, credentials, or internal origins exist.
 * Binding-derived operational checks belong behind a separately verified
 * authenticated control-plane endpoint.
 */
export const buildWorkerIntegrationRegistry = (): IntegrationRecord[] => {
  return integrationInventory.map((item) => ({ ...item }));
};

export const buildWorkerIntegrationDataStatus = (): {
  ok: true;
  generatedAt: string;
  policy: {
    verifiedMeansEvidenceBacked: true;
    configuredDoesNotMeanVerified: true;
    estimatedDoesNotMeanVerified: true;
    humanFinalAuthority: true;
    privateRuntimeConfigurationIsNotExposed: true;
  };
  summary: {
    total: number;
    verified: 0;
    notVerified: number;
    configured: number;
    needsConfiguration: number;
    notObservable: number;
  };
  data: DataStatusRecord[];
} {
  const data: DataStatusRecord[] = integrationInventory.map((item) => ({
    ...item,
    configurationStatus: configurationStatusByIntegrationStatus[item.status],
    verificationStatus: 'not-verified',
    verificationEvidence: null,
    truthRule: 'Only qualifying external evidence may change verificationStatus to verified.',
  }));

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    policy: {
      verifiedMeansEvidenceBacked: true,
      configuredDoesNotMeanVerified: true,
      estimatedDoesNotMeanVerified: true,
      humanFinalAuthority: true,
      privateRuntimeConfigurationIsNotExposed: true,
    },
    summary: {
      total: data.length,
      verified: 0,
      notVerified: data.length,
      configured: data.filter((item) => item.configurationStatus === 'configured').length,
      needsConfiguration: data.filter((item) => item.configurationStatus === 'needs-configuration').length,
      notObservable: data.filter((item) => item.configurationStatus === 'not-observable').length,
    },
    data,
  };
};
