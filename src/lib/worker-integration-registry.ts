export type WorkerIntegrationEnvironment = {
  GLORIFIER_CANONICAL_DOMAIN?: string;
  GLORIFIER_ORG_EMAIL?: string;
  GLORIFIER_NEURAL_ORIGIN?: string;
  GLORIFIER_NEURAL_ALLOWED_HOSTS?: string;
  GLORIFIER_DATABASE_PROVIDER?: string;
  HYPERDRIVE?: unknown;
  OPENSEA_API_KEY?: string;
  MCP_RATE_LIMITER?: unknown;
};

type IntegrationStatus =
  | 'connected'
  | 'configured'
  | 'needs-config'
  | 'available'
  | 'optional'
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
  configurationStatus: 'configured' | 'needs-configuration' | 'available' | 'optional' | 'disabled';
  verificationStatus: 'not-verified';
  verificationEvidence: null;
  truthRule: string;
};

const hasValue = (value: string | undefined): boolean => Boolean(value?.trim());

export function buildWorkerIntegrationRegistry(
  env: WorkerIntegrationEnvironment,
): IntegrationRecord[] {
  const neonConfigured =
    env.GLORIFIER_DATABASE_PROVIDER?.trim().toLowerCase() === 'neon' && Boolean(env.HYPERDRIVE);
  const identityConfigured =
    hasValue(env.GLORIFIER_CANONICAL_DOMAIN) && hasValue(env.GLORIFIER_ORG_EMAIL);
  const neuralConfigured =
    hasValue(env.GLORIFIER_NEURAL_ORIGIN) && hasValue(env.GLORIFIER_NEURAL_ALLOWED_HOSTS);

  return [
    {
      id: 'cloudflare-worker',
      name: 'Cloudflare Workers',
      category: 'compute',
      status: 'connected',
      detail: 'This read model is served by the Cloudflare Worker handling the current request. This is not a full application-health claim.',
      publicUrl: 'https://developers.cloudflare.com/workers/',
    },
    {
      id: 'neon',
      name: 'Neon',
      category: 'data',
      status: neonConfigured ? 'configured' : 'needs-config',
      detail: neonConfigured
        ? 'The Worker selects Neon and has a Hyperdrive binding. Database connectivity and data parity require separate read-only verification.'
        : 'The Worker does not have both the Neon provider selection and Hyperdrive binding.',
      publicUrl: 'https://neon.tech/',
    },
    {
      id: 'opensea',
      name: 'OpenSea',
      category: 'digital-assets',
      status: hasValue(env.OPENSEA_API_KEY) ? 'configured' : 'needs-config',
      detail: hasValue(env.OPENSEA_API_KEY)
        ? 'A server-side OpenSea API credential binding is present. This read model does not perform a live provider request.'
        : 'No OpenSea API credential binding is present in this Worker environment.',
      publicUrl: 'https://opensea.io/GLORIFIER',
    },
    {
      id: 'github-mcp',
      name: 'GitHub MCP',
      category: 'protocol',
      status: env.MCP_RATE_LIMITER ? 'configured' : 'needs-config',
      detail: env.MCP_RATE_LIMITER
        ? 'The Worker implements a credential-free, fixed-scope read-only MCP route for this public repository and has its required rate-limit binding. The binding enables the route; it is not a GitHub credential or proof of external-client interoperability.'
        : 'The MCP endpoint is disabled until its environment has an independent rate-limit binding.',
      publicUrl: 'https://github.com/GLORIFIER7/GLORIFIER',
    },
    {
      id: 'identity',
      name: 'GLORIFIER organization identity',
      category: 'identity',
      status: identityConfigured ? 'configured' : 'needs-config',
      detail: identityConfigured
        ? 'Canonical-domain and organization-email configuration is present. Domain ownership and identity proof remain separate checks.'
        : 'Canonical domain and organization email are not both configured.',
      publicUrl: 'https://glorifier.glorifier.workers.dev/api/identity',
    },
    {
      id: 'neural',
      name: 'GLORIFIER-NEURAL',
      category: 'ai-runtime',
      status: neuralConfigured ? 'configured' : 'needs-config',
      detail: neuralConfigured
        ? 'Neural origin and exact-host allowlist are configured. Live health, readiness, authentication, and inference remain separate checks.'
        : 'A reviewed HTTPS origin and exact-host allowlist are not both configured.',
      publicUrl: 'https://github.com/GLORIFIER7/GLORIFIER-NEURAL',
    },
    {
      id: 'ai-providers',
      name: 'AI provider execution',
      category: 'ai',
      status: 'needs-config',
      detail: 'The active Worker runtime has no provider-specific AI credential bindings in its declared environment. Live provider inference is NOT VERIFIED.',
      publicUrl: 'https://github.com/GLORIFIER7/GLORIFIER',
    },
    {
      id: 'railway',
      name: 'Railway',
      category: 'compute',
      status: 'disabled',
      detail: 'Not an active production runtime for this Worker. No Railway fallback is advertised or enabled here.',
      publicUrl: 'https://railway.app/',
    },
    {
      id: 'vercel',
      name: 'Vercel',
      category: 'frontend',
      status: 'disabled',
      detail: 'Not an active production frontend target. The production frontend is served by Cloudflare Workers.',
      publicUrl: 'https://vercel.com/',
    },
    {
      id: 'netlify-preview',
      name: 'Netlify PR previews',
      category: 'ci-preview',
      status: 'configured',
      detail: 'The GitHub pull-request deploy-preview integration is configured and active. It is preview-only and does not serve production frontend traffic.',
      publicUrl: 'https://www.netlify.com/',
    },
    {
      id: 'netlify-production',
      name: 'Netlify production hosting',
      category: 'frontend',
      status: 'disabled',
      detail: 'Not an active production frontend target. The production frontend is served by Cloudflare Workers.',
      publicUrl: 'https://www.netlify.com/',
    },
  ];
}

const configurationStatus = (
  status: IntegrationStatus,
): DataStatusRecord['configurationStatus'] => {
  if (status === 'disabled') return 'disabled';
  if (status === 'connected' || status === 'configured') return 'configured';
  if (status === 'optional') return 'optional';
  if (status === 'available') return 'available';
  return 'needs-configuration';
};

export function buildWorkerIntegrationDataStatus(
  env: WorkerIntegrationEnvironment,
): {
  ok: true;
  generatedAt: string;
  policy: {
    verifiedMeansEvidenceBacked: true;
    configuredDoesNotMeanVerified: true;
    estimatedDoesNotMeanVerified: true;
    humanFinalAuthority: true;
  };
  summary: {
    total: number;
    verified: 0;
    notVerified: number;
    configured: number;
    needsConfiguration: number;
  };
  data: DataStatusRecord[];
} {
  const data: DataStatusRecord[] = buildWorkerIntegrationRegistry(env).map((item) => ({
    ...item,
    configurationStatus: configurationStatus(item.status),
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
    },
    summary: {
      total: data.length,
      verified: 0,
      notVerified: data.length,
      configured: data.filter((item) => item.configurationStatus === 'configured').length,
      needsConfiguration: data.filter((item) => item.configurationStatus === 'needs-configuration').length,
    },
    data,
  };
}
