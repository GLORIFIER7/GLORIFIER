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
    assert.equal(identityResponse.status, 200);
    assert.equal(identityResponse.headers.get('cache-control'), 'no-store');
    const identityBody = await identityResponse.json() as { ok: boolean; identity: { organization: string; ready: boolean; domainStatus: string; nextAction: string } };
    assert.equal(identityBody.ok, true);
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

    const missingBackendCallsBefore = capturedRequest;
    const missingBackendResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
    );
    assert.equal(missingBackendResponse.status, 502);
    assert.equal(await missingBackendResponse.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_NOT_CONFIGURED');
    assert.equal(capturedRequest, missingBackendCallsBefore, 'missing backend configuration must not trigger an implicit upstream request');

    const apiResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
      env,
    );
    assert.equal(apiResponse.status, 200);
    assert.equal(apiResponse.headers.get('cache-control'), 'no-store');
    assert.equal(getCapturedRequest().url, 'https://api.example.test/api/runtime-verification?probeAi=false');
    assert.equal(getCapturedRequest().headers.get('x-forwarded-host'), 'glorifier.glorifier.workers.dev');
    assert.equal(await apiResponse.json().then((body: { ok?: boolean }) => body.ok), true);

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

    console.log('Cloudflare Worker proxy tests passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
