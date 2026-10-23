type CloudflareEnv = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  GLORIFIER_CANONICAL_DOMAIN?: string;
  GLORIFIER_ORG_EMAIL?: string;
  GLORIFIER_EMAIL_MODE?: string;
  GLORIFIER_EMAIL_FORWARDING_TARGET?: string;
  GLORIFIER_DOMAIN_STATUS?: string;
  GLORIFIER_PUBLIC_URL?: string;
};

const BACKEND_ORIGIN = 'https://glorifier-artificial-intelligence-production.up.railway.app';

const configured = (value: string | undefined): string => (value || '').trim();
const identityResponse = (env: CloudflareEnv): Response => {
  const canonicalDomain = configured(env.GLORIFIER_CANONICAL_DOMAIN).toLowerCase();
  const primaryEmail = configured(env.GLORIFIER_ORG_EMAIL).toLowerCase();
  const emailMode = configured(env.GLORIFIER_EMAIL_MODE || 'forwarding').toLowerCase();
  const emailForwardingTargetConfigured = Boolean(configured(env.GLORIFIER_EMAIL_FORWARDING_TARGET));
  const domainStatus = configured(env.GLORIFIER_DOMAIN_STATUS || 'not-configured').toLowerCase();
  const website = configured(env.GLORIFIER_PUBLIC_URL);
  const domainConfigured = Boolean(canonicalDomain);
  const emailConfigured = Boolean(primaryEmail);
  const domainOwnedOrVerified = ['owned', 'verified', 'active'].includes(domainStatus);
  const identity = {
    organization: 'GLORIFIER',
    canonicalDomain,
    primaryEmail,
    emailMode,
    emailForwardingTargetConfigured,
    domainStatus,
    website,
    principles: [
      'Domain identity is independent from hosting/provider identity.',
      'Email routing is separate from application authentication.',
      'No paid mailbox is required for the architecture to operate.',
      'A domain must be controlled before an @domain address can be authoritative.',
      'Provider replacement must not change GLORIFIER organizational identity.',
      'Human owner remains final authority for consequential actions.',
    ],
    ready: domainConfigured && emailConfigured && domainOwnedOrVerified,
    domainConfigured,
    emailConfigured,
    domainOwnedOrVerified,
    nextAction: !domainConfigured
      ? 'Set GLORIFIER_CANONICAL_DOMAIN after the organization controls its domain.'
      : !domainOwnedOrVerified
        ? 'Verify domain ownership/control before treating the domain as authoritative.'
        : !emailConfigured
          ? 'Configure GLORIFIER_ORG_EMAIL after an @domain mailbox or forwarding address exists.'
          : 'Identity configuration is ready.',
  };
  return Response.json({ ok: true, identity }, {
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
};

const isBackendPath = (pathname: string): boolean =>
  /^\/(?:api|auth)(?:\/|$)/.test(pathname);

const apiError = (message: string, code: string): Response =>
  Response.json(
    { ok: false, status: 'unavailable', error: message, code },
    {
      status: 502,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );

const isApiPath = (pathname: string): boolean =>
  /^\/api(?:\/|$)/.test(pathname);

const looksLikeStaticAsset = (pathname: string): boolean =>
  /\.(?:m?js|css|map|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|json|webmanifest)$/i.test(pathname);

const createUpstreamRequest = (request: Request, incomingUrl: URL): Request => {
  const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, BACKEND_ORIGIN);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('host');
  requestHeaders.delete('content-length');
  requestHeaders.set('x-forwarded-host', incomingUrl.host);
  requestHeaders.set('x-forwarded-proto', incomingUrl.protocol.slice(0, -1));

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const requestInit: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers: requestHeaders,
    redirect: 'manual',
  };
  if (hasBody && request.body) {
    requestInit.body = request.body;
    requestInit.duplex = 'half';
  }
  return new Request(upstreamUrl, requestInit);
};

const rewriteBackendRedirect = (headers: Headers, incomingUrl: URL): void => {
  const location = headers.get('location');
  if (!location) return;

  try {
    const redirectUrl = new URL(location, BACKEND_ORIGIN);
    if (redirectUrl.origin === BACKEND_ORIGIN) {
      headers.set('Location', incomingUrl.origin + redirectUrl.pathname + redirectUrl.search + redirectUrl.hash);
    }
  } catch {
    // Preserve an unparseable Location header unchanged; do not invent a redirect.
  }
};

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const incomingUrl = new URL(request.url);

    // First Worker-native API route: identity configuration is read only from
    // Cloudflare environment bindings and never depends on the legacy backend.
    if (request.method === 'GET' && incomingUrl.pathname === '/api/identity') {
      return identityResponse(env);
    }

    // Backend endpoints must never fall through to the SPA's index.html.
    if (!isBackendPath(incomingUrl.pathname)) {
      const assetResponse = await env.ASSETS.fetch(request);
      const contentType = assetResponse.headers.get('content-type')?.toLowerCase() || '';
      if (looksLikeStaticAsset(incomingUrl.pathname) && contentType.includes('text/html')) {
        return new Response('Static asset not found. The SPA shell was not substituted for the missing asset.', {
          status: 404,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      }
      return assetResponse;
    }

    try {
      const upstreamResponse = await fetch(createUpstreamRequest(request, incomingUrl));
      const upstreamContentType = upstreamResponse.headers.get('content-type')?.toLowerCase() || '';
      if (isApiPath(incomingUrl.pathname) && upstreamContentType.includes('text/html')) {
        return apiError(
          'The backend returned HTML for an API request. Routing is not valid for this endpoint; no successful API result was assumed.',
          'API_HTML_RESPONSE',
        );
      }
      const responseHeaders = new Headers(upstreamResponse.headers);
      responseHeaders.set('Cache-Control', 'no-store');
      responseHeaders.set('X-Content-Type-Options', 'nosniff');
      rewriteBackendRedirect(responseHeaders, incomingUrl);

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    } catch {
      return apiError(
        'The GLORIFIER backend could not be reached from this Worker. No successful result was assumed.',
        'UPSTREAM_UNAVAILABLE',
      );
    }
  },
};
