import assert from 'node:assert/strict';
import worker from './worker.ts';

type TestEnv = {
  ASSETS: { fetch(request: Request): Promise<Response> };
  GLORIFIER_CANONICAL_DOMAIN?: string;
  GLORIFIER_ORG_EMAIL?: string;
  GLORIFIER_EMAIL_MODE?: string;
  GLORIFIER_EMAIL_FORWARDING_TARGET?: string;
  GLORIFIER_DOMAIN_STATUS?: string;
  GLORIFIER_PUBLIC_URL?: string;
  GLORIFIER_BACKEND_ORIGIN?: string;
  GLORIFIER_NEURAL_ORIGIN?: string;
  GLORIFIER_SUPABASE_URL?: string;
  GLORIFIER_SUPABASE_SERVICE_ROLE_KEY?: string;
};

const originalFetch = globalThis.fetch;
let capturedRequest: Request | null = null;
let upstreamResponse = new Response('{"ok":true}', {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
let shouldThrow = false;
let assetCalls = 0;
let returnHtmlForAssets = false;

function getCapturedRequest(): Request {
  if (!capturedRequest) throw new Error('Expected the Worker to call the backend.');
  return capturedRequest;
}

const env: TestEnv = {
  GLORIFIER_BACKEND_ORIGIN: 'https://api.example.test',
  ASSETS: {
    async fetch() {
      assetCalls += 1;
      if (returnHtmlForAssets) return new Response('<!doctype html><title>SPA</title>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return new Response('static asset', { status: 200 });
    },
  },
};

async function run(): Promise<void> {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (shouldThrow) throw new Error('simulated upstream outage');
    capturedRequest = input instanceof Request ? input : new Request(input, init);
    return upstreamResponse;
  }) as typeof fetch;

  try {
    const staticResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/assets/app.js'),
      env,
    );
    assert.equal(await staticResponse.text(), 'static asset');
    assert.equal(assetCalls, 1);
    assert.equal(capturedRequest, null, 'static assets must not call the backend');

    returnHtmlForAssets = true;
    const missingAsset = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/assets/missing-chunk.js'),
      env,
    );
    assert.equal(missingAsset.status, 404, 'SPA HTML must not be served as a missing JavaScript asset');
    assert.match(missingAsset.headers.get('content-type') || '', /^text\/plain/i);
    returnHtmlForAssets = false;

    const healthAssetCallsBefore = assetCalls;
    const workerHealth = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/health'),
      env,
    );
    assert.equal(workerHealth.status, 200);
    assert.equal(workerHealth.headers.get('cache-control'), 'no-store, max-age=0');
    const workerHealthBody = await workerHealth.json() as {
      ok: boolean;
      status: string;
      layer: string;
      dependencies: { backend: string; authentication: string; databases: string };
    };
    assert.equal(workerHealthBody.ok, true);
    assert.equal(workerHealthBody.status, 'worker-ready');
    assert.equal(workerHealthBody.layer, 'cloudflare-worker');
    assert.equal(workerHealthBody.dependencies.backend, 'not-probed');
    assert.equal(workerHealthBody.dependencies.authentication, 'not-probed');
    assert.equal(workerHealthBody.dependencies.databases, 'not-probed');
    assert.equal(capturedRequest, null, 'Worker health must not call an upstream backend');
    assert.equal(assetCalls, healthAssetCallsBefore, 'Worker health must not fall through to static assets');

    const headHealth = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/health', { method: 'HEAD' }),
      env,
    );
    assert.equal(headHealth.status, 200);
    assert.equal(await headHealth.text(), '');

    const invalidHealthMethod = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/health', { method: 'POST' }),
      env,
    );
    assert.equal(invalidHealthMethod.status, 405);
    assert.equal(invalidHealthMethod.headers.get('allow'), 'GET, HEAD');
    assert.equal(capturedRequest, null, 'unsupported health methods must not fall through to an upstream backend');

    const assetCallsBeforeIdentity = assetCalls;
    const identityResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/identity'),
      env,
    );
    assert.equal(identityResponse.status, 503);
    assert.equal(identityResponse.headers.get('cache-control'), 'no-store');
    const identityBody = await identityResponse.json() as { ok: boolean; identity: { organization: string; ready: boolean; domainStatus: string; nextAction: string } };
    assert.equal(identityBody.ok, false);
    assert.equal(identityBody.identity.organization, 'GLORIFIER');
    assert.equal(identityBody.identity.ready, false, 'identity must not be called ready without verified environment configuration');
    assert.equal(identityBody.identity.domainStatus, 'not-configured');
    assert.match(identityBody.identity.nextAction, /Set GLORIFIER_CANONICAL_DOMAIN/);
    assert.equal(capturedRequest, null, 'identity endpoint must not call an upstream backend');
    assert.equal(assetCalls, assetCallsBeforeIdentity, 'identity endpoint must not fall through to static assets');

    const configuredIdentityResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/identity'),
      {
        ...env,
        GLORIFIER_CANONICAL_DOMAIN: 'Example.org',
        GLORIFIER_ORG_EMAIL: 'Owner@Example.org',
        GLORIFIER_DOMAIN_STATUS: 'verified',
        GLORIFIER_PUBLIC_URL: 'https://example.org',
      },
    );
    const configuredIdentity = await configuredIdentityResponse.json() as { identity: { ready: boolean; canonicalDomain: string; primaryEmail: string; domainOwnedOrVerified: boolean } };
    assert.equal(configuredIdentity.identity.ready, true);
    assert.equal(configuredIdentity.identity.canonicalDomain, 'example.org');
    assert.equal(configuredIdentity.identity.primaryEmail, 'owner@example.org');
    assert.equal(configuredIdentity.identity.domainOwnedOrVerified, true);
    assert.equal(capturedRequest, null, 'configured identity endpoint must remain Worker-native');

    const assetCallsBeforeBusinessModel = assetCalls;
    const businessModelResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/business-model'),
      env,
    );
    assert.equal(businessModelResponse.status, 200);
    assert.equal(businessModelResponse.headers.get('cache-control'), 'no-store');
    const businessModelBody = await businessModelResponse.json() as {
      ok: boolean;
      model: { version: string; economicTruth: { verifiedRevenue: string }; governance: { autonomousFundMovement: boolean } };
    };
    assert.equal(businessModelBody.ok, true);
    assert.equal(businessModelBody.model.version, 'GBM-2.0');
    assert.equal(businessModelBody.model.economicTruth.verifiedRevenue, 'requires qualifying payment evidence');
    assert.equal(businessModelBody.model.governance.autonomousFundMovement, false);
    assert.equal(capturedRequest, null, 'business model endpoint must remain Worker-native');
    assert.equal(assetCalls, assetCallsBeforeBusinessModel, 'business model endpoint must not fall through to static assets');


    const nativeRuntimeWithoutSupabase = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined, GLORIFIER_SUPABASE_URL: undefined, GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: undefined },
    );
    assert.equal(nativeRuntimeWithoutSupabase.status, 503);
    assert.equal(await nativeRuntimeWithoutSupabase.json().then((body: { checks?: { database?: { code?: string } } }) => body.checks?.database?.code), 'SUPABASE_NOT_CONFIGURED');
    assert.equal(capturedRequest, null, 'native runtime verification must not proxy to a legacy backend');

    const nativeReportsWithoutSupabase = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/reports/summary'),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined, GLORIFIER_SUPABASE_URL: undefined, GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: undefined },
    );
    assert.equal(nativeReportsWithoutSupabase.status, 503);
    assert.equal(await nativeReportsWithoutSupabase.json().then((body: { code?: string }) => body.code), 'SUPABASE_NOT_CONFIGURED');
    assert.equal(capturedRequest, null, 'native reports must not proxy to a legacy backend');

    // With no backend configured, unauthenticated app-state requests must be rejected
    // by the authentication boundary rather than surfacing as a generic upstream 502.
    const unauthenticatedAppState = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/app-state'),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
    );
    assert.equal(unauthenticatedAppState.status, 401);
    assert.equal(await unauthenticatedAppState.json().then((body: { code?: string }) => body.code), 'AUTHENTICATION_REQUIRED');
    assert.equal(capturedRequest, null, 'unauthenticated app-state must be rejected before upstream routing');

    const emptyBearerAppState = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
        headers: { Authorization: 'Bearer ' },
      }),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
    );
    assert.equal(emptyBearerAppState.status, 401, 'an empty bearer token is not a credential');
    assert.equal(await emptyBearerAppState.json().then((body: { code?: string }) => body.code), 'AUTHENTICATION_REQUIRED');

    const unrelatedCookieAppState = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
        headers: { Cookie: 'old-session-data=anything; theme=dark' },
      }),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
    );
    assert.equal(unrelatedCookieAppState.status, 401, 'unrelated cookie names are not session credentials');
    assert.equal(await unrelatedCookieAppState.json().then((body: { code?: string }) => body.code), 'AUTHENTICATION_REQUIRED');

    for (const cookie of ['session', 'session=', 'session=   ', 'auth-token=', 'access-token']) {
      const emptySessionCookie = await worker.fetch(
        new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
          headers: { Cookie: cookie },
        }),
        { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
      );
      assert.equal(emptySessionCookie.status, 401, `empty cookie value must not count as a credential: ${cookie}`);
      assert.equal(await emptySessionCookie.json().then((body: { code?: string }) => body.code), 'AUTHENTICATION_REQUIRED');
    }

    const exactSessionCookieWithoutBackend = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
        headers: { Cookie: 'session=test-value' },
      }),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
    );
    assert.equal(exactSessionCookieWithoutBackend.status, 502);
    assert.equal(await exactSessionCookieWithoutBackend.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_NOT_CONFIGURED');

    const credentialedAppStateWithoutBackend = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
        headers: { Authorization: 'Bearer test-token' },
      }),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
    );
    assert.equal(credentialedAppStateWithoutBackend.status, 502);
    assert.equal(await credentialedAppStateWithoutBackend.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_NOT_CONFIGURED');

    upstreamResponse = new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    capturedRequest = null;
    const configuredBackendResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/configurable-backend?mode=probe'),
      { ...env, GLORIFIER_BACKEND_ORIGIN: 'https://api.example.test' },
    );
    assert.equal(configuredBackendResponse.status, 200);
    assert.equal(getCapturedRequest().url, 'https://api.example.test/api/configurable-backend?mode=probe');

    capturedRequest = null;
    const invalidBackendResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/invalid-backend-config'),
      { ...env, GLORIFIER_BACKEND_ORIGIN: 'http://insecure.example.test' },
    );
    assert.equal(invalidBackendResponse.status, 502);
    assert.equal(await invalidBackendResponse.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_INVALID');
    assert.equal(capturedRequest, null, 'invalid backend origins must fail closed without making a request');

    upstreamResponse = new Response('{"ok":false,"error":"not found"}', {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
    const missingRoute = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/route-that-does-not-exist'),
      env,
    );
    assert.equal(missingRoute.status, 404, 'unknown API routes must stay backend errors, not SPA success');
    assert.equal(await missingRoute.json().then((body: { ok?: boolean; code?: string }) => body.ok), false);

    upstreamResponse = new Response('<!doctype html><title>SPA</title>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
    const htmlApiResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/misrouted-endpoint'),
      env,
    );
    assert.equal(htmlApiResponse.status, 502, 'HTML from the backend must not masquerade as a successful API response');
    assert.equal(await htmlApiResponse.json().then((body: { code?: string }) => body.code), 'API_HTML_RESPONSE');

    upstreamResponse = new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const postResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/test-write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'observe' }),
      }),
      env,
    );
    assert.equal(postResponse.status, 200);
    assert.equal(getCapturedRequest().method, 'POST');
    assert.deepEqual(JSON.parse(await getCapturedRequest().text()), { action: 'observe' });

    upstreamResponse = new Response(null, {
      status: 302,
      headers: {
        Location: 'https://api.example.test/auth/provider/callback?state=test',
      },
    });
    const assetCallsBeforeAuth = assetCalls;
    const authRedirect = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
      env,
    );
    assert.equal(authRedirect.status, 302);
    assert.equal(
      authRedirect.headers.get('location'),
      'https://glorifier.glorifier.workers.dev/auth/provider/callback?state=test',
      'backend auth redirects must be rewritten to the current public origin',
    );
    assert.equal(
      getCapturedRequest().url,
      'https://api.example.test/auth/provider/start',
    );
    assert.equal(assetCalls, assetCallsBeforeAuth, 'auth routes must not fall through to the SPA assets');

    upstreamResponse = new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    shouldThrow = true;
    const unavailable = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/test-unavailable'),
      env,
    );
    assert.equal(unavailable.status, 502);
    assert.equal(await unavailable.json().then((body: { ok?: boolean; code?: string }) => body.code), 'UPSTREAM_UNAVAILABLE');


    // Neural adapter exposes only the three documented routes, never a generic proxy.
    capturedRequest = null;
    const neuralNotConfigured = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/health'), { ...env, GLORIFIER_NEURAL_ORIGIN: undefined });
    assert.equal(neuralNotConfigured.status, 503);
    assert.equal(await neuralNotConfigured.json().then((body: { code?: string }) => body.code), 'NEURAL_ORIGIN_NOT_CONFIGURED');
    assert.equal(capturedRequest, null);

    const neuralInvalidOrigin = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/health'), { ...env, GLORIFIER_NEURAL_ORIGIN: 'http://neural.example.test' });
    assert.equal(neuralInvalidOrigin.status, 503);
    assert.equal(await neuralInvalidOrigin.json().then((body: { code?: string }) => body.code), 'NEURAL_ORIGIN_INVALID');

    const neuralTaskNoAuth = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', { method: 'POST', body: '{"task":"summarize"}' }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
    assert.equal(neuralTaskNoAuth.status, 401);
    assert.equal(capturedRequest, null, 'unauthenticated task requests must not reach Neural');

    upstreamResponse = new Response('{"status":"not-ready"}', { status: 503, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'must-not-forward=yes' } });
    const neuralReady = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/ready'), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
    assert.equal(neuralReady.status, 503, 'Neural readiness status must be preserved');
    assert.equal(getCapturedRequest().url, 'https://neural.example.test/ready');
    assert.equal(neuralReady.headers.get('set-cookie'), null, 'upstream cookies must not be forwarded');

    upstreamResponse = new Response('{"accepted":true}', { status: 202, headers: { 'Content-Type': 'application/json' } });
    const neuralTask = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
      method: 'POST', headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' }, body: '{"task":"summarize"}',
    }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
    assert.equal(neuralTask.status, 202);
    assert.equal(getCapturedRequest().url, 'https://neural.example.test/v1/tasks');
    assert.equal(getCapturedRequest().headers.get('authorization'), 'Bearer caller-token', 'caller token must be forwarded unchanged');
    assert.deepEqual(JSON.parse(await getCapturedRequest().text()), { task: 'summarize' });

    const neuralUnknown = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/admin'), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
    assert.equal(neuralUnknown.status, 404, 'unmapped Neural namespace paths must not fall through to the legacy backend');
    assert.equal(await neuralUnknown.json().then((body: { code?: string }) => body.code), 'NEURAL_ROUTE_NOT_FOUND');
    assert.equal(getCapturedRequest().url, 'https://neural.example.test/v1/tasks', 'unknown routes must not trigger another upstream request');

    console.log('Cloudflare Worker proxy tests passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
