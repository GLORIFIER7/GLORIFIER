import assert from 'node:assert/strict';
import worker from './worker.ts';
import type { CloudflareEnv } from './worker.ts';
import { A2A_AGENT_CARD_PATH, A2A_JSONRPC_PATH } from './lib/a2a-v1';

type TestEnv = CloudflareEnv;

const originalFetch = globalThis.fetch;
let capturedRequest: Request | null = null;
const requestedUrls: string[] = [];
let upstreamResponses: Response[] = [];
let openSeaResponseQueue: Response[] | null = null;
let openSeaFetchError: Error | null = null;
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
  GLORIFIER_BACKEND_ALLOWED_HOSTS: 'api.example.test',
  GLORIFIER_NEURAL_ALLOWED_HOSTS: 'neural.example.test',
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
    requestedUrls.push(capturedRequest.url);
    if (capturedRequest.url.startsWith('https://api.opensea.io/') && openSeaFetchError) {
      throw openSeaFetchError;
    }
    if (capturedRequest.url.startsWith('https://api.opensea.io/') && openSeaResponseQueue?.length) {
      return openSeaResponseQueue.shift() as Response;
    }
    return upstreamResponses.shift() || upstreamResponse;
  }) as typeof fetch;

  try {
    console.log('worker-test: begin staticResponse');
    const staticResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/assets/app.js'),
      env,
    );
    assert.equal(await staticResponse.text(), 'static asset');
    assert.equal(assetCalls, 1);
    assert.equal(capturedRequest, null, 'static assets must not call the backend');

    returnHtmlForAssets = true;
    console.log('worker-test: begin missingAsset');
    const missingAsset = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/assets/missing-chunk.js'),
      env,
    );
    assert.equal(missingAsset.status, 404, 'SPA HTML must not be served as a missing JavaScript asset');
    assert.match(missingAsset.headers.get('content-type') || '', /^text\/plain/i);
    returnHtmlForAssets = false;

    capturedRequest = null;
    const previousA2ACardResponse = upstreamResponse;
    upstreamResponse = new Response(JSON.stringify({
      name: 'GLORIFIER Services',
      supportedInterfaces: [{
        url: `https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`,
        protocolBinding: 'JSONRPC',
        protocolVersion: '1.0',
      }],
      capabilities: { streaming: false, pushNotifications: false },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    console.log('worker-test: begin a2aCardResponse');
    const a2aCardResponse = await worker.fetch(
      new Request(`https://glorifier.glorifier.workers.dev${A2A_AGENT_CARD_PATH}`),
      env,
    );
    assert.equal(a2aCardResponse.status, 200);
    const a2aCard = await a2aCardResponse.json() as {
      name: string;
      supportedInterfaces: Array<{ url: string; protocolBinding: string; protocolVersion: string }>;
      capabilities: { streaming: boolean; pushNotifications: boolean };
    };
    assert.equal(a2aCard.name, 'GLORIFIER Services');
    assert.deepEqual(a2aCard.supportedInterfaces, [{
      url: `https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`,
      protocolBinding: 'JSONRPC',
      protocolVersion: '1.0',
    }]);
    assert.equal(a2aCard.capabilities.streaming, false);
    assert.equal(a2aCard.capabilities.pushNotifications, false);
    assert.equal(new URL(getCapturedRequest().url).origin, 'https://api.example.test');
    assert.equal(new URL(getCapturedRequest().url).pathname, A2A_AGENT_CARD_PATH);
    upstreamResponse = previousA2ACardResponse;

    capturedRequest = null;
    console.log('worker-test: begin a2aCardWithoutBackend');
    const a2aCardWithoutBackend = await worker.fetch(
      new Request(`https://glorifier.glorifier.workers.dev${A2A_AGENT_CARD_PATH}`),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
    );
    assert.equal(a2aCardWithoutBackend.status, 502, 'A2A discovery must fail closed without a configured backend route');
    assert.equal(await a2aCardWithoutBackend.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_NOT_CONFIGURED');
    assert.equal(capturedRequest, null);

    console.log('worker-test: begin a2aMethodNotAllowed');

    const a2aMethodNotAllowed = await worker.fetch(
      new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, { method: 'GET' }),
      env,
    );
    assert.equal(a2aMethodNotAllowed.status, 405);
    assert.equal(a2aMethodNotAllowed.headers.get('allow'), 'POST');
    assert.equal(capturedRequest, null);

    console.log('worker-test: begin a2aTrailingSlashMissingAuth');

    const a2aTrailingSlashMissingAuth = await worker.fetch(
      new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'slash-auth', method: 'GetTask', params: { id: 'x' } }),
      }),
      env,
    );
    assert.equal(a2aTrailingSlashMissingAuth.status, 401, 'trailing slash must not bypass A2A authentication');
    assert.equal(capturedRequest, null, 'trailing-slash unauthenticated request must not reach backend');

    console.log('worker-test: begin a2aMissingAuth');

    const a2aMissingAuth = await worker.fetch(
      new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'x', method: 'GetTask', params: { id: 'x' } }),
      }),
      env,
    );
    assert.equal(a2aMissingAuth.status, 401);
    assert.equal(a2aMissingAuth.headers.get('www-authenticate'), 'Bearer');
    assert.equal(capturedRequest, null, 'unauthenticated A2A requests must not reach the backend');

    for (const malformedAuthorization of ['Basic caller-token', 'Bearer', 'Bearer token extra', 'Bearer\ttoken']) {
      console.log('worker-test: begin rejectedAuthorization');
      const rejectedAuthorization = await worker.fetch(
        new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
          method: 'POST',
          headers: {
            Authorization: malformedAuthorization,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ jsonrpc: '2.0', id: 'auth-invalid', method: 'GetTask', params: { id: 'x' } }),
        }),
        env,
      );
      assert.equal(rejectedAuthorization.status, 401, `malformed authorization must be rejected: ${malformedAuthorization}`);
      assert.equal(capturedRequest, null, 'malformed authorization must not reach the backend');
    }

    console.log('worker-test: begin a2aUnsupportedMediaType');

    const a2aUnsupportedMediaType = await worker.fetch(
      new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'text/plain' },
        body: '{}',
      }),
      env,
    );
    assert.equal(a2aUnsupportedMediaType.status, 415);
    assert.equal(capturedRequest, null);

    console.log('worker-test: begin a2aOversized');

    const a2aOversized = await worker.fetch(
      new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
        body: ' '.repeat(65_537),
      }),
      env,
    );
    assert.equal(a2aOversized.status, 413);
    assert.equal(capturedRequest, null, 'oversized A2A requests must not reach the backend');

    console.log('worker-test: begin a2aInvalidJson');

    const a2aInvalidJson = await worker.fetch(
      new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
        method: 'POST',
        headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
        body: '{invalid',
      }),
      env,
    );
    assert.equal(a2aInvalidJson.status, 400);
    assert.equal(capturedRequest, null);

    capturedRequest = null;
    console.log('worker-test: begin a2aForwarded');
    const a2aForwarded = await worker.fetch(
      new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
        method: 'POST',
        headers: {
          Authorization: 'bEaReR caller-token',
          'Content-Type': 'application/json',
          'A2A-Version': '1.0',
          Cookie: 'session=should-not-forward',
          'X-Private-Header': 'should-not-forward',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'send-1',
          method: 'SendMessage',
          params: { message: { messageId: 'm-1', role: 'ROLE_USER', parts: [{ text: 'Review this' }] } },
        }),
      }),
      env,
    );
    assert.equal(a2aForwarded.status, 200);
    const a2aUpstreamRequest = getCapturedRequest();
    assert.equal(new URL(a2aUpstreamRequest.url).origin, 'https://api.example.test');
    assert.equal(new URL(a2aUpstreamRequest.url).pathname, A2A_JSONRPC_PATH);

    capturedRequest = null;
    console.log('worker-test: begin a2aTrailingSlashForwarded');
    const a2aTrailingSlashForwarded = await worker.fetch(
      new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}/`, {
        method: 'POST',
        headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 'slash-send', method: 'SendMessage', params: { message: { messageId: 'slash-m', role: 'ROLE_USER', parts: [{ text: 'Slash route' }] } } }),
      }),
      env,
    );
    assert.equal(a2aTrailingSlashForwarded.status, 200);
    assert.equal(new URL(getCapturedRequest().url).pathname, A2A_JSONRPC_PATH, 'trailing-slash A2A calls must be canonicalized before backend forwarding');
    assert.equal(a2aUpstreamRequest.headers.get('authorization'), 'Bearer caller-token', 'mixed-case bearer schemes must be canonicalized before backend forwarding');
    assert.equal(a2aUpstreamRequest.headers.get('content-type'), 'application/json');
    assert.equal(a2aUpstreamRequest.headers.get('a2a-version'), '1.0', 'the negotiated A2A protocol version must cross the Worker boundary');
    assert.equal(a2aUpstreamRequest.headers.get('cookie'), null, 'A2A proxy must not forward caller cookies');
    assert.equal(a2aUpstreamRequest.headers.get('x-private-header'), null, 'A2A proxy must not forward unrelated headers');
    assert.match(await a2aUpstreamRequest.text(), /SendMessage/);

    capturedRequest = null;
    const healthAssetCallsBefore = assetCalls;
    console.log('worker-test: begin workerHealth');
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

    console.log('worker-test: begin headHealth');

    const headHealth = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/health', { method: 'HEAD' }),
      env,
    );
    assert.equal(headHealth.status, 200);
    assert.equal(await headHealth.text(), '');

    console.log('worker-test: begin invalidHealthMethod');

    const invalidHealthMethod = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/health', { method: 'POST' }),
      env,
    );
    assert.equal(invalidHealthMethod.status, 405);
    assert.equal(invalidHealthMethod.headers.get('allow'), 'GET, HEAD');
    assert.equal(capturedRequest, null, 'unsupported health methods must not fall through to an upstream backend');

    const assetCallsBeforeIdentity = assetCalls;
    console.log('worker-test: begin identityResponse');
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

    console.log('worker-test: begin configuredIdentityResponse');

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
    console.log('worker-test: begin businessModelResponse');
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


    console.log('worker-test: begin nativeRuntimeWithoutSupabase');


    const nativeRuntimeWithoutSupabase = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined, GLORIFIER_SUPABASE_URL: undefined, GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: undefined },
    );
    assert.equal(nativeRuntimeWithoutSupabase.status, 503);
    const nativeRuntimeWithoutSupabaseBody = await nativeRuntimeWithoutSupabase.json() as {
      checks?: { database?: { code?: string }; neural?: { ok: boolean | null; status: string; code?: string } };
    };
    assert.equal(nativeRuntimeWithoutSupabaseBody.checks?.database?.code, 'SUPABASE_NOT_CONFIGURED');
    assert.deepEqual(nativeRuntimeWithoutSupabaseBody.checks?.neural, {
      ok: false,
      status: 'not-configured',
      code: 'NEURAL_ORIGIN_NOT_CONFIGURED',
    });
    assert.equal(capturedRequest, null, 'native runtime verification must not proxy to a legacy backend');

    // Reject any Supabase destination that is not a canonical HTTPS project origin.
    const invalidSupabaseOrigins = [
      'http://project.supabase.co',
      'https://project.supabase.co:8443',
      'https://nested.project.supabase.co',
      'https://metadata.google.internal',
      'https://127.0.0.1',
      'https://project.supabase.co.attacker.test',
      'https://user:password@project.supabase.co',
      'https://project.supabase.co/rest/v1',
      'https://project.supabase.co?target=https://127.0.0.1',
    ];
    for (const invalidSupabaseOrigin of invalidSupabaseOrigins) {
      capturedRequest = null;
      requestedUrls.length = 0;
      console.log('worker-test: begin rejectedSupabaseOrigin');
      const rejectedSupabaseOrigin = await worker.fetch(
        new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
        {
          ...env,
          GLORIFIER_SUPABASE_URL: invalidSupabaseOrigin,
          GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
        },
      );
      assert.equal(rejectedSupabaseOrigin.status, 503, invalidSupabaseOrigin);
      const rejectedSupabaseBody = await rejectedSupabaseOrigin.json() as {
        checks?: { database?: { code?: string } };
      };
      assert.equal(rejectedSupabaseBody.checks?.database?.code, 'SUPABASE_NOT_CONFIGURED', invalidSupabaseOrigin);
      assert.equal(capturedRequest, null, `invalid Supabase origin must not be contacted: ${invalidSupabaseOrigin}`);
      assert.deepEqual(requestedUrls, [], `invalid Supabase origin must not generate any outbound request: ${invalidSupabaseOrigin}`);
    }

    // A failed Supabase probe must not erase the independent Neural configuration status.
    const previousUnhealthyRuntimeResponse = upstreamResponse;
    upstreamResponse = new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    capturedRequest = null;
    console.log('worker-test: begin runtimeWithFailedSupabaseProbe');
    const runtimeWithFailedSupabaseProbe = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
      {
        ...env,
        GLORIFIER_SUPABASE_URL: 'https://project.supabase.co',
        GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
        GLORIFIER_NEURAL_ORIGIN: undefined,
        GLORIFIER_NEURAL_ALLOWED_HOSTS: undefined,
      },
    );
    assert.equal(runtimeWithFailedSupabaseProbe.status, 502);
    const runtimeWithFailedSupabaseProbeBody = await runtimeWithFailedSupabaseProbe.json() as {
      checks: { database?: { code?: string }; neural?: { ok: boolean | null; status: string; code?: string } };
    };
    assert.equal(runtimeWithFailedSupabaseProbeBody.checks.database?.code, 'SUPABASE_PROBE_FAILED');
    assert.deepEqual(runtimeWithFailedSupabaseProbeBody.checks.neural, {
      ok: false,
      status: 'not-configured',
      code: 'NEURAL_ORIGIN_NOT_CONFIGURED',
    });
    assert.equal(
      getCapturedRequest().url,
      'https://project.supabase.co/rest/v1/connection_registry?select=*&limit=0',
    );
    upstreamResponse = previousUnhealthyRuntimeResponse;

    // A successful database probe must still disclose an unconfigured Neural execution plane.
    const previousRuntimeResponse = upstreamResponse;
    upstreamResponse = new Response(null, {
      status: 200,
      headers: { 'content-range': '0-0/0' },
    });
    capturedRequest = null;
    console.log('worker-test: begin runtimeWithSupabaseButNoNeural');
    const runtimeWithSupabaseButNoNeural = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
      {
        ...env,
        GLORIFIER_SUPABASE_URL: 'https://project.supabase.co',
        GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
        GLORIFIER_NEURAL_ORIGIN: undefined,
        GLORIFIER_NEURAL_ALLOWED_HOSTS: undefined,
      },
    );
    assert.equal(runtimeWithSupabaseButNoNeural.status, 200);
    const runtimeWithSupabaseButNoNeuralBody = await runtimeWithSupabaseButNoNeural.json() as {
      checks: { neural?: { ok: boolean | null; status: string; code?: string } };
    };
    assert.deepEqual(runtimeWithSupabaseButNoNeuralBody.checks.neural, {
      ok: false,
      status: 'not-configured',
      code: 'NEURAL_ORIGIN_NOT_CONFIGURED',
    });
    assert.equal(
      getCapturedRequest().url,
      'https://project.supabase.co/rest/v1/connection_registry?select=*&limit=0',
      'runtime verification must perform only its existing Supabase read-only probe when Neural is not configured',
    );
    // Runtime configuration reporting must distinguish invalid, blocked, and merely configured states.
    const neuralConfigurationCases = [
      {
        name: 'invalid origin',
        env: { GLORIFIER_NEURAL_ORIGIN: 'http://neural.example.test', GLORIFIER_NEURAL_ALLOWED_HOSTS: 'neural.example.test' },
        expected: { ok: false, status: 'invalid-origin', code: 'NEURAL_ORIGIN_INVALID' },
      },
      {
        name: 'missing allowlist',
        env: { GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test', GLORIFIER_NEURAL_ALLOWED_HOSTS: undefined },
        expected: { ok: false, status: 'allowlist-not-configured', code: 'NEURAL_EGRESS_ALLOWLIST_NOT_CONFIGURED' },
      },
      {
        name: 'host not allowlisted',
        env: { GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test', GLORIFIER_NEURAL_ALLOWED_HOSTS: 'other.example.test' },
        expected: { ok: false, status: 'not-allowlisted', code: 'NEURAL_ORIGIN_NOT_ALLOWLISTED' },
      },
      {
        name: 'origin and allowlist configured',
        env: { GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test', GLORIFIER_NEURAL_ALLOWED_HOSTS: 'neural.example.test' },
        expected: { ok: null, status: 'configured-not-probed' },
      },
    ] as const;

    upstreamResponse = new Response(null, {
      status: 200,
      headers: { 'content-range': '0-0/0' },
    });
    for (const neuralCase of neuralConfigurationCases) {
      capturedRequest = null;
      requestedUrls.length = 0;
      console.log('worker-test: begin runtimeResponse');
      const runtimeResponse = await worker.fetch(
        new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
        {
          ...env,
          ...neuralCase.env,
          GLORIFIER_SUPABASE_URL: 'https://project.supabase.co',
          GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
        },
      );
      assert.equal(runtimeResponse.status, 200, neuralCase.name);
      const runtimeBody = await runtimeResponse.json() as {
        checks: { neural?: { ok: boolean | null; status: string; code?: string } };
      };
      assert.deepEqual(runtimeBody.checks.neural, neuralCase.expected, neuralCase.name);
      assert.deepEqual(
        requestedUrls,
        ['https://project.supabase.co/rest/v1/connection_registry?select=*&limit=0'],
        `runtime verification must issue only the Supabase probe and no Neural request: ${neuralCase.name}`,
      );
    }
    upstreamResponse = previousRuntimeResponse;
    assert.equal(
      getCapturedRequest().url,
      'https://project.supabase.co/rest/v1/connection_registry?select=*&limit=0',
      'the last configuration-only probe must be the Supabase request',
    );
    capturedRequest = null;

    console.log('worker-test: begin nativeReportsWithoutSupabase');

    const nativeReportsWithoutSupabase = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/reports/summary'),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined, GLORIFIER_SUPABASE_URL: undefined, GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: undefined },
    );
    assert.equal(nativeReportsWithoutSupabase.status, 503);
    assert.equal(await nativeReportsWithoutSupabase.json().then((body: { code?: string }) => body.code), 'SUPABASE_NOT_CONFIGURED');
    assert.equal(capturedRequest, null, 'native reports must not proxy to a legacy backend');

    // With no backend configured, unauthenticated app-state requests must be rejected
    // by the authentication boundary rather than surfacing as a generic upstream 502.
    console.log('worker-test: begin unauthenticatedAppState');
    const unauthenticatedAppState = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/app-state'),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
    );
    assert.equal(unauthenticatedAppState.status, 401);
    assert.equal(await unauthenticatedAppState.json().then((body: { code?: string }) => body.code), 'AUTHENTICATION_REQUIRED');
    assert.equal(capturedRequest, null, 'unauthenticated app-state must be rejected before upstream routing');

    console.log('worker-test: begin emptyBearerAppState');

    const emptyBearerAppState = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
        headers: { Authorization: 'Bearer ' },
      }),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
    );
    assert.equal(emptyBearerAppState.status, 401, 'an empty bearer token is not a credential');
    assert.equal(await emptyBearerAppState.json().then((body: { code?: string }) => body.code), 'AUTHENTICATION_REQUIRED');

    console.log('worker-test: begin unrelatedCookieAppState');

    const unrelatedCookieAppState = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
        headers: { Cookie: 'old-session-data=anything; theme=dark' },
      }),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
    );
    assert.equal(unrelatedCookieAppState.status, 401, 'unrelated cookie names are not session credentials');
    assert.equal(await unrelatedCookieAppState.json().then((body: { code?: string }) => body.code), 'AUTHENTICATION_REQUIRED');

    for (const cookie of ['session', 'session=', 'session=   ', 'auth-token=', 'access-token']) {
      console.log('worker-test: begin emptySessionCookie');
      const emptySessionCookie = await worker.fetch(
        new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
          headers: { Cookie: cookie },
        }),
        { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
      );
      assert.equal(emptySessionCookie.status, 401, `empty cookie value must not count as a credential: ${cookie}`);
      assert.equal(await emptySessionCookie.json().then((body: { code?: string }) => body.code), 'AUTHENTICATION_REQUIRED');
    }

    console.log('worker-test: begin exactSessionCookieWithoutBackend');

    const exactSessionCookieWithoutBackend = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
        headers: { Cookie: 'session=test-value' },
      }),
      { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
    );
    assert.equal(exactSessionCookieWithoutBackend.status, 502);
    assert.equal(await exactSessionCookieWithoutBackend.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_NOT_CONFIGURED');

    console.log('worker-test: begin credentialedAppStateWithoutBackend');

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
    console.log('worker-test: begin configuredBackendResponse');
    const configuredBackendResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/configurable-backend?mode=probe'),
      { ...env, GLORIFIER_BACKEND_ORIGIN: 'https://api.example.test' },
    );
    assert.equal(configuredBackendResponse.status, 200);
    assert.equal(getCapturedRequest().url, 'https://api.example.test/api/configurable-backend?mode=probe');

    capturedRequest = null;
    console.log('worker-test: begin missingBackendAllowlist');
    const missingBackendAllowlist = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/allowlist-missing'),
      { ...env, GLORIFIER_BACKEND_ALLOWED_HOSTS: undefined },
    );
    assert.equal(missingBackendAllowlist.status, 502);
    assert.equal(await missingBackendAllowlist.json().then((body: { code?: string }) => body.code), 'BACKEND_EGRESS_ALLOWLIST_NOT_CONFIGURED');
    assert.equal(capturedRequest, null, 'backend egress must fail closed if no explicit allowlist exists');

    console.log('worker-test: begin nonAllowlistedBackend');

    const nonAllowlistedBackend = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/host-not-allowed'),
      { ...env, GLORIFIER_BACKEND_ALLOWED_HOSTS: 'other.example.test' },
    );
    assert.equal(nonAllowlistedBackend.status, 502);
    assert.equal(await nonAllowlistedBackend.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_NOT_ALLOWLISTED');
    assert.equal(capturedRequest, null, 'backend requests must not reach hosts outside the exact allowlist');

    capturedRequest = null;
    console.log('worker-test: begin invalidBackendResponse');
    const invalidBackendResponse = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/invalid-backend-config'),
      { ...env, GLORIFIER_BACKEND_ORIGIN: 'http://insecure.example.test' },
    );
    assert.equal(invalidBackendResponse.status, 502);
    assert.equal(await invalidBackendResponse.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_INVALID');
    assert.equal(capturedRequest, null, 'invalid backend origins must fail closed without making a request');

    console.log('worker-test: begin nonstandardBackendPort');

    const nonstandardBackendPort = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/nonstandard-port'),
      { ...env, GLORIFIER_BACKEND_ORIGIN: 'https://api.example.test:8443' },
    );
    assert.equal(nonstandardBackendPort.status, 502);
    assert.equal(await nonstandardBackendPort.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_INVALID');
    assert.equal(capturedRequest, null, 'nonstandard HTTPS ports must be rejected before backend egress');

    upstreamResponse = new Response('{"ok":false,"error":"not found"}', {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
    console.log('worker-test: begin missingRoute');
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
    console.log('worker-test: begin htmlApiResponse');
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
    console.log('worker-test: begin postResponse');
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

    upstreamResponse = new Response(JSON.stringify({ id: '123' }), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        Location: '/api/items/123',
      },
    });
    console.log('worker-test: begin createdResource');
    const createdResource = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'resource' }),
      }),
      env,
    );
    assert.equal(createdResource.status, 201, 'a successful creation response must not be converted to a redirect-policy error');
    assert.equal(createdResource.headers.get('location'), '/api/items/123', 'a non-redirect Location resource reference must retain its HTTP semantics');
    assert.equal(new URL(getCapturedRequest().url).origin, 'https://api.example.test');
    assert.equal(new URL(getCapturedRequest().url).pathname, '/api/items');

    upstreamResponse = new Response(null, {
      status: 302,
      headers: {
        Location: 'https://api.example.test/auth/broker/callback?state=test',
      },
    });
    const assetCallsBeforeAuth = assetCalls;
    console.log('worker-test: begin authRedirect');
    const authRedirect = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
      env,
    );
    assert.equal(authRedirect.status, 302);
    assert.equal(
      authRedirect.headers.get('location'),
      'https://glorifier.glorifier.workers.dev/auth/broker/callback?state=test',
      'backend auth redirects must be rewritten to the current public origin',
    );
    assert.equal(
      getCapturedRequest().url,
      'https://api.example.test/auth/provider/start',
    );
    assert.equal(getCapturedRequest().redirect, 'manual', 'backend redirects must not cause the Worker to follow a second outbound request');
    assert.equal(assetCalls, assetCallsBeforeAuth, 'auth routes must not fall through to the SPA assets');

    upstreamResponse = new Response(null, {
      status: 302,
      headers: {
        Location: 'https://api.example.test/auth/broker/callback?state=approved&next=https%3A%2F%2Fevil.example#untrusted-fragment',
      },
    });
    console.log('worker-test: begin sanitizedAuthRedirect');
    const sanitizedAuthRedirect = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
      env,
    );
    assert.equal(sanitizedAuthRedirect.status, 302);
    assert.equal(
      sanitizedAuthRedirect.headers.get('location'),
      'https://glorifier.glorifier.workers.dev/auth/broker/callback?state=approved',
      'same-origin redirects must use a Worker-approved route and only approved OAuth callback parameters',
    );

    upstreamResponse = new Response(null, {
      status: 302,
      headers: { Location: 'https://api.example.test/internal/admin?next=https://evil.example' },
    });
    console.log('worker-test: begin blockedInternalRedirect');
    const blockedInternalRedirect = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
      env,
    );
    assert.equal(blockedInternalRedirect.status, 502);
    assert.equal(
      await blockedInternalRedirect.json().then((body: { code?: string }) => body.code),
      'BACKEND_REDIRECT_NOT_ALLOWED',
    );
    assert.equal(blockedInternalRedirect.headers.get('location'), null);

    upstreamResponse = new Response(null, {
      status: 302,
      headers: { Location: 'https://login.example.test/oauth/authorize?client_id=glorifier' },
    });
    console.log('worker-test: begin blockedExternalRedirect');
    const blockedExternalRedirect = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
      env,
    );
    assert.equal(blockedExternalRedirect.status, 502);
    assert.equal(
      await blockedExternalRedirect.json().then((body: { code?: string }) => body.code),
      'BACKEND_REDIRECT_NOT_ALLOWED',
    );

    console.log('worker-test: begin allowedExternalRedirect');

    const allowedExternalRedirect = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
      { ...env, GLORIFIER_BACKEND_REDIRECT_ALLOWED_HOSTS: 'login.example.test' },
    );
    assert.equal(allowedExternalRedirect.status, 302);
    assert.equal(
      allowedExternalRedirect.headers.get('location'),
      'https://login.example.test/oauth/authorize?client_id=glorifier',
      'external OAuth redirects must require an explicit exact-host allowlist',
    );

    for (const rejectedLocation of [
      'http://login.example.test/oauth/authorize',
      'https://login.example.test:8443/oauth/authorize',
      'https://user:password@login.example.test/oauth/authorize',
      'https://evil.example/oauth/authorize',
      'https://api.example.test/auth/broker/callback?state=one&state=two',
    ]) {
      upstreamResponse = new Response(null, { status: 302, headers: { Location: rejectedLocation } });
      console.log('worker-test: begin rejectedRedirect');
      const rejectedRedirect = await worker.fetch(
        new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
        { ...env, GLORIFIER_BACKEND_REDIRECT_ALLOWED_HOSTS: 'login.example.test' },
      );
      assert.equal(rejectedRedirect.status, 502, rejectedLocation);
      assert.equal(
        await rejectedRedirect.json().then((body: { code?: string }) => body.code),
        'BACKEND_REDIRECT_NOT_ALLOWED',
        rejectedLocation,
      );
      assert.equal(rejectedRedirect.headers.get('location'), null, rejectedLocation);
    }

    // An attacker-controlled leading double slash is not a backend route and must
    // never be interpreted as an absolute URL by the upstream request constructor.
    capturedRequest = null;
    const assetCallsBeforeDoubleSlashPath = assetCalls;
    console.log('worker-test: begin doubleSlashPath');
    const doubleSlashPath = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev//attacker.example/steal?host=evil'),
      env,
    );
    assert.equal(doubleSlashPath.status, 200);
    assert.equal(capturedRequest, null, 'leading double-slash paths must not reach the backend');
    assert.equal(assetCalls, assetCallsBeforeDoubleSlashPath + 1);

    upstreamResponse = new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    capturedRequest = null;
    console.log('worker-test: begin upstreamQueryCannotChangeHost');
    const upstreamQueryCannotChangeHost = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/test-routing?target=https%3A%2F%2Fevil.example%2Fpath'),
      env,
    );
    assert.equal(upstreamQueryCannotChangeHost.status, 200);
    assert.equal(new URL(getCapturedRequest().url).origin, 'https://api.example.test');
    assert.equal(new URL(getCapturedRequest().url).pathname, '/api/test-routing');
    assert.equal(new URL(getCapturedRequest().url).searchParams.get('target'), 'https://evil.example/path');

    upstreamResponse = new Response('{"ok":true}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    upstreamResponse = new Response('upstream failure', { status: 500, headers: { 'Content-Type': 'text/plain' } });
    const openSeaEnv = { ...env, OPENSEA_API_KEY: 'test-opensea-key' } as TestEnv & { OPENSEA_API_KEY?: string };

    console.log('worker-test: begin openSeaServerError');

    const openSeaServerError = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
      openSeaEnv,
    );
    assert.equal(openSeaServerError.status, 502);
    const openSeaServerErrorBody = await openSeaServerError.json() as { code?: string; upstreamStatus?: number };
    assert.equal(openSeaServerErrorBody.code, 'OPENSEA_UPSTREAM_ERROR');
    assert.equal('upstreamStatus' in openSeaServerErrorBody, false, 'provider internals must not be disclosed');

    shouldThrow = true;
    console.log('worker-test: begin unavailable');
    const unavailable = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/test-unavailable'),
      env,
    );
    assert.equal(unavailable.status, 502);
    assert.equal(await unavailable.json().then((body: { ok?: boolean; code?: string }) => body.code), 'UPSTREAM_UNAVAILABLE');
    shouldThrow = false; // Restore the mocked upstream before testing Neural status forwarding.

    // Neural adapter exposes only the three documented routes, never a generic proxy.
    capturedRequest = null;
    console.log('worker-test: begin neuralNotConfigured');
    const neuralNotConfigured = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/health'), { ...env, GLORIFIER_NEURAL_ORIGIN: undefined });
    assert.equal(neuralNotConfigured.status, 503);
    assert.equal(await neuralNotConfigured.json().then((body: { code?: string }) => body.code), 'NEURAL_ORIGIN_NOT_CONFIGURED');
    assert.equal(capturedRequest, null);

    console.log('worker-test: begin neuralInvalidOrigin');

    const neuralInvalidOrigin = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/health'), { ...env, GLORIFIER_NEURAL_ORIGIN: 'http://neural.example.test' });
    assert.equal(neuralInvalidOrigin.status, 503);
    assert.equal(await neuralInvalidOrigin.json().then((body: { code?: string }) => body.code), 'NEURAL_ORIGIN_INVALID');

    console.log('worker-test: begin neuralNonstandardPort');

    const neuralNonstandardPort = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/neural/health'),
      { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test:8443' },
    );
    assert.equal(neuralNonstandardPort.status, 503);
    assert.equal(await neuralNonstandardPort.json().then((body: { code?: string }) => body.code), 'NEURAL_ORIGIN_INVALID');

    capturedRequest = null;
    console.log('worker-test: begin neuralMissingAllowlist');
    const neuralMissingAllowlist = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/neural/health'),
      { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test', GLORIFIER_NEURAL_ALLOWED_HOSTS: undefined },
    );
    assert.equal(neuralMissingAllowlist.status, 503);
    assert.equal(await neuralMissingAllowlist.json().then((body: { code?: string }) => body.code), 'NEURAL_EGRESS_ALLOWLIST_NOT_CONFIGURED');
    assert.equal(capturedRequest, null, 'Neural egress must fail closed without an allowlist');

    console.log('worker-test: begin neuralHostNotAllowed');

    const neuralHostNotAllowed = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/neural/health'),
      { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test', GLORIFIER_NEURAL_ALLOWED_HOSTS: 'another.example.test' },
    );
    assert.equal(neuralHostNotAllowed.status, 503);
    assert.equal(await neuralHostNotAllowed.json().then((body: { code?: string }) => body.code), 'NEURAL_ORIGIN_NOT_ALLOWLISTED');
    assert.equal(capturedRequest, null, 'Neural requests must not reach hosts outside the exact allowlist');

    console.log('worker-test: begin neuralTaskNoAuth');

    const neuralTaskNoAuth = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', { method: 'POST', body: '{"task":"summarize"}' }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
    assert.equal(neuralTaskNoAuth.status, 401);
    assert.equal(capturedRequest, null, 'unauthenticated task requests must not reach Neural');

    capturedRequest = null;
    const declaredOversizeBody = new Uint8Array(65_536 + 1);
    console.log('worker-test: begin declaredOversizeTask');
    const declaredOversizeTask = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer caller-token',
        'Content-Type': 'application/json',
        'Content-Length': String(declaredOversizeBody.byteLength),
      },
      body: declaredOversizeBody,
    }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
    assert.equal(declaredOversizeTask.status, 413, 'declared oversized task bodies must be rejected before upstream forwarding');
    assert.equal(await declaredOversizeTask.json().then((body: { code?: string }) => body.code), 'REQUEST_BODY_TOO_LARGE');
    assert.equal(capturedRequest, null, 'declared oversized bodies must never reach Neural');

    capturedRequest = null;
    const streamedOversizeBody = new Uint8Array(65_536 + 1);
    console.log('worker-test: begin streamedOversizeTask');
    const streamedOversizeTask = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
      method: 'POST',
      headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
      body: streamedOversizeBody,
    }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
    assert.equal(streamedOversizeTask.status, 413, 'actual streamed size must be enforced even without a trusted Content-Length');
    assert.equal(await streamedOversizeTask.json().then((body: { code?: string }) => body.code), 'REQUEST_BODY_TOO_LARGE');
    assert.equal(capturedRequest, null, 'oversized streamed bodies must never reach Neural');

    capturedRequest = null;
    console.log('worker-test: begin unsupportedTaskMediaType');
    const unsupportedTaskMediaType = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
      method: 'POST',
      headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'text/plain' },
      body: '{"task":"summarize"}',
    }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
    assert.equal(unsupportedTaskMediaType.status, 415, 'task requests must use JSON media types');
    assert.equal(await unsupportedTaskMediaType.json().then((body: { code?: string }) => body.code), 'UNSUPPORTED_MEDIA_TYPE');
    assert.equal(capturedRequest, null, 'non-JSON task bodies must never reach Neural');

    capturedRequest = null;
    console.log('worker-test: begin malformedJsonTask');
    const malformedJsonTask = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
      method: 'POST',
      headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
      body: '{"task":',
    }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
    assert.equal(malformedJsonTask.status, 400, 'invalid JSON must be rejected locally');
    assert.equal(await malformedJsonTask.json().then((body: { code?: string }) => body.code), 'INVALID_JSON_BODY');
    assert.equal(capturedRequest, null, 'malformed JSON must never reach Neural');

    upstreamResponse = new Response('{"status":"not-ready"}', { status: 503, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'must-not-forward=yes' } });
    console.log('worker-test: begin neuralReady');
    const neuralReady = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/ready'), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
    assert.equal(neuralReady.status, 503, 'Neural readiness status must be preserved');
    assert.equal(getCapturedRequest().url, 'https://neural.example.test/ready');
    assert.match(neuralReady.headers.get('x-correlation-id') || '', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.equal(getCapturedRequest().headers.get('x-correlation-id'), neuralReady.headers.get('x-correlation-id'), 'the same correlation ID must cross the Worker and Neural boundary');
    assert.equal(neuralReady.headers.get('set-cookie'), null, 'upstream cookies must not be forwarded');

    upstreamResponse = new Response('{"accepted":true}', { status: 202, headers: { 'Content-Type': 'application/json' } });
    const callerCorrelationId = '550e8400-e29b-41d4-a716-446655440000';
    console.log('worker-test: begin neuralTask');
    const neuralTask = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer caller-token',
        'Content-Type': 'application/json',
        'X-Correlation-ID': callerCorrelationId,
      },
      body: '{"task":"summarize"}',
    }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
    assert.equal(neuralTask.status, 202);
    assert.equal(getCapturedRequest().url, 'https://neural.example.test/v1/tasks');
    assert.equal(neuralTask.headers.get('x-correlation-id'), callerCorrelationId);
    assert.equal(getCapturedRequest().headers.get('x-correlation-id'), callerCorrelationId, 'validated correlation ID must be forwarded unchanged');
    assert.equal(getCapturedRequest().headers.get('authorization'), 'Bearer caller-token', 'caller token must be forwarded unchanged');
    assert.deepEqual(JSON.parse(await getCapturedRequest().text()), { task: 'summarize' });

    console.log('worker-test: begin neuralUnknown');

    const neuralUnknown = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/admin'), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
    assert.equal(neuralUnknown.status, 404, 'unmapped Neural namespace paths must not fall through to the legacy backend');
    assert.equal(await neuralUnknown.json().then((body: { code?: string }) => body.code), 'NEURAL_ROUTE_NOT_FOUND');
    assert.equal(getCapturedRequest().url, 'https://neural.example.test/v1/tasks', 'unknown routes must not trigger another upstream request');
    // The last valid upstream request remains the task request; unknown routes must not replace it.


    upstreamResponse = new Response(JSON.stringify({ collection: 'glorifier7', name: 'GLORIFIER' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    capturedRequest = null;
    console.log('worker-test: begin openSeaCollection');
    const openSeaCollection = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
      openSeaEnv,
    );
    assert.equal(openSeaCollection.status, 200);
    assert.equal(getCapturedRequest().url, 'https://api.opensea.io/api/v2/collections/glorifier7');
    assert.equal(getCapturedRequest().headers.get('x-api-key'), 'test-opensea-key');
    assert.equal(getCapturedRequest().headers.get('accept'), 'application/json');
    assert.equal(openSeaCollection.headers.get('cache-control'), 'public, max-age=60');
    assert.equal(JSON.stringify(await openSeaCollection.json()).includes('test-opensea-key'), false);

    capturedRequest = null;
    console.log('worker-test: begin openSeaMissingKey');
    const openSeaMissingKey = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
      { ...env, OPENSEA_API_KEY: undefined } as TestEnv & { OPENSEA_API_KEY?: string },
    );
    assert.equal(openSeaMissingKey.status, 503);
    assert.equal(await openSeaMissingKey.json().then((body: { code?: string }) => body.code), 'OPENSEA_API_KEY_NOT_CONFIGURED');
    assert.equal(capturedRequest, null, 'OpenSea requests must fail closed when the API key is absent');

    console.log('worker-test: begin openSeaInvalidSlug');

    const openSeaInvalidSlug = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/INVALID_SLUG'),
      openSeaEnv,
    );
    assert.equal(openSeaInvalidSlug.status, 400, 'invalid collection slugs must be rejected locally');
    assert.equal(await openSeaInvalidSlug.json().then((body: { code?: string }) => body.code), 'INVALID_COLLECTION_SLUG');

    // Account routes must be handled before the collection-only OpenSea adapter.
    capturedRequest = null;
    console.log('worker-test: begin openSeaInvalidAccountRoute');
    const openSeaInvalidAccountRoute = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/invalid%20name'),
      openSeaEnv,
    );
    assert.equal(openSeaInvalidAccountRoute.status, 400);
    assert.equal(await openSeaInvalidAccountRoute.json().then((body: { code?: string }) => body.code), 'INVALID_OPENSEA_ACCOUNT_IDENTIFIER');
    assert.equal(capturedRequest, null, 'invalid account identifiers must be rejected locally');

    console.log('worker-test: begin openSeaInvalidAccountCollectionsRoute');

    const openSeaInvalidAccountCollectionsRoute = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/invalid%20name/collections'),
      openSeaEnv,
    );
    assert.equal(openSeaInvalidAccountCollectionsRoute.status, 400);
    assert.equal(await openSeaInvalidAccountCollectionsRoute.json().then((body: { code?: string }) => body.code), 'INVALID_OPENSEA_ACCOUNT_IDENTIFIER');
    assert.equal(capturedRequest, null, 'invalid account collection identifiers must be rejected locally');

    // Only explicitly registered GLORIFIER collection slugs may reach OpenSea.
    capturedRequest = null;
    console.log('worker-test: begin openSeaUnregisteredSlug');
    const openSeaUnregisteredSlug = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/a'),
      openSeaEnv,
    );
    assert.equal(openSeaUnregisteredSlug.status, 404);
    assert.equal(await openSeaUnregisteredSlug.json().then((body: { code?: string }) => body.code), 'OPENSEA_ROUTE_NOT_FOUND');
    assert.equal(capturedRequest, null, 'unregistered collection slugs must not reach OpenSea');

    console.log('worker-test: begin openSeaWrongMethod');

    const openSeaWrongMethod = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7', { method: 'POST' }),
      openSeaEnv,
    );
    assert.equal(openSeaWrongMethod.status, 405);
    assert.equal(openSeaWrongMethod.headers.get('allow'), 'GET, HEAD');

    upstreamResponse = new Response(JSON.stringify({ detail: 'unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    console.log('worker-test: begin openSeaUnauthorized');
    const openSeaUnauthorized = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
      openSeaEnv,
    );
    assert.equal(openSeaUnauthorized.status, 502);
    assert.equal(await openSeaUnauthorized.json().then((body: { code?: string }) => body.code), 'OPENSEA_API_KEY_REJECTED');


    upstreamResponse = new Response(JSON.stringify({ detail: 'rate limited' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '7' },
    });
    console.log('worker-test: begin openSeaRateLimited');
    const openSeaRateLimited = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
      openSeaEnv,
    );
    assert.equal(openSeaRateLimited.status, 503);
    assert.equal(openSeaRateLimited.headers.get('retry-after'), '7');
    assert.equal(await openSeaRateLimited.json().then((body: { code?: string }) => body.code), 'OPENSEA_RATE_LIMITED');

    upstreamResponse = new Response(JSON.stringify({ collection: 'missing' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    console.log('worker-test: begin openSeaNotFound');
    const openSeaNotFound = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier1'),
      openSeaEnv,
    );
    assert.equal(openSeaNotFound.status, 404);
    assert.equal(await openSeaNotFound.json().then((body: { code?: string }) => body.code), 'OPENSEA_COLLECTION_NOT_FOUND');

    upstreamResponse = new Response(JSON.stringify({ collection: 'glorifier7' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    console.log('worker-test: begin openSeaHead');
    const openSeaHead = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7', { method: 'HEAD' }),
      openSeaEnv,
    );
    assert.equal(openSeaHead.status, 200);
    assert.equal(await openSeaHead.text(), '');
    assert.equal(openSeaHead.headers.get('content-type'), 'application/json');

    upstreamResponse = new Response('not-json', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    console.log('worker-test: begin openSeaInvalidContentType');
    const openSeaInvalidContentType = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
      openSeaEnv,
    );
    assert.equal(openSeaInvalidContentType.status, 502);
    assert.equal(await openSeaInvalidContentType.json().then((body: { code?: string }) => body.code), 'OPENSEA_INVALID_RESPONSE');

    upstreamResponse = new Response('x'.repeat(1_048_577), { status: 200, headers: { 'Content-Type': 'application/json' } });
    console.log('worker-test: begin openSeaOversized');
    const openSeaOversized = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
      openSeaEnv,
    );
    assert.equal(openSeaOversized.status, 502);
    assert.equal(await openSeaOversized.json().then((body: { code?: string }) => body.code), 'OPENSEA_RESPONSE_TOO_LARGE');

    shouldThrow = true;
    console.log('worker-test: begin openSeaUnavailable');
    const openSeaUnavailable = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
      openSeaEnv,
    );
    shouldThrow = false;
    assert.equal(openSeaUnavailable.status, 502);
    assert.equal(await openSeaUnavailable.json().then((body: { code?: string }) => body.code), 'OPENSEA_UPSTREAM_UNAVAILABLE');


    // Resolve the actual OpenSea username, then enumerate collections for its canonical wallet.
    upstreamResponses = [
      new Response(JSON.stringify({ address: '0xAbCd000000000000000000000000000000001234', username: 'GLORIFIER', ens_name: null }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
      new Response(JSON.stringify({ collections: [{ collection: 'glorifier-services', name: 'GLORIFIER Services' }], next: null }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
    ];
    capturedRequest = null;
    console.log('worker-test: begin glorifierCollections');
    const glorifierCollections = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections?limit=10'),
      openSeaEnv,
    );
    assert.equal(glorifierCollections.status, 200);
    const glorifierCollectionsBody = await glorifierCollections.json() as {
      account?: { address?: string; username?: string };
      collections?: { collections?: Array<{ collection?: string }> };
    };
    assert.equal(glorifierCollectionsBody.account?.username, 'GLORIFIER');
    assert.equal(glorifierCollectionsBody.account?.address, '0xAbCd000000000000000000000000000000001234');
    assert.equal(glorifierCollectionsBody.collections?.collections?.[0]?.collection, 'glorifier-services');
    assert.deepEqual(requestedUrls.slice(-2), [
      'https://api.opensea.io/api/v2/accounts/resolve/GLORIFIER',
      'https://api.opensea.io/api/v2/account/0xAbCd000000000000000000000000000000001234/collections?limit=10',
    ]);
    assert.equal(getCapturedRequest().headers.get('x-api-key'), 'test-opensea-key');

    upstreamResponses = [
      new Response(JSON.stringify({ address: '0xAbCd000000000000000000000000000000001234', username: 'somebody-else' }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }),
    ];
    console.log('worker-test: begin wrongAccountIdentity');
    const wrongAccountIdentity = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections'),
      openSeaEnv,
    );
    assert.equal(wrongAccountIdentity.status, 502, 'the resolved account username must match the requested GLORIFIER identity');
    assert.equal(await wrongAccountIdentity.json().then((body: { code?: string }) => body.code), 'OPENSEA_ACCOUNT_IDENTITY_MISMATCH');


    upstreamResponses = [];
    capturedRequest = null;
    console.log('worker-test: begin missingOpenSeaAccountKey');
    const missingOpenSeaAccountKey = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections'),
      { ...env, OPENSEA_API_KEY: undefined } as TestEnv & { OPENSEA_API_KEY?: string },
    );
    assert.equal(missingOpenSeaAccountKey.status, 503);
    assert.equal(capturedRequest, null, 'account resolution must fail closed without the API key');

    upstreamResponses = [];
    console.log('worker-test: begin invalidAccountLimit');
    const invalidAccountLimit = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections?limit=51'),
      openSeaEnv,
    );
    assert.equal(invalidAccountLimit.status, 400);
    assert.equal(await invalidAccountLimit.json().then((body: { code?: string }) => body.code), 'INVALID_PAGINATION');

    upstreamResponses = [
      new Response(JSON.stringify({ detail: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }),
    ];
    console.log('worker-test: begin missingOpenSeaAccount');
    const missingOpenSeaAccount = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections'),
      openSeaEnv,
    );
    assert.equal(missingOpenSeaAccount.status, 404);
    assert.equal(await missingOpenSeaAccount.json().then((body: { code?: string }) => body.code), 'OPENSEA_ACCOUNT_NOT_FOUND');

    upstreamResponses = [];
    capturedRequest = null;
    console.log('worker-test: begin invalidAccountIdentifier');
    const invalidAccountIdentifier = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/%2Fbad/collections'),
      openSeaEnv,
    );
    assert.equal(invalidAccountIdentifier.status, 400);
    assert.equal(capturedRequest, null, 'invalid account identifiers must be rejected before upstream access');
    // The GLORIFIER OpenSea username must be resolved to the canonical wallet address
    // before retrieving that account's owned collections.
    const openSeaAccountStart = requestedUrls.length;
    openSeaResponseQueue = [
      new Response(JSON.stringify({ address: '0x1234567890abcdef1234567890abcdef12345678', username: 'GLORIFIER', ens_name: 'glorifier.eth' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      new Response(JSON.stringify({ collections: [{ collection: 'glorifier-services', name: 'GLORIFIER Services' }], next: 'next-cursor-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ];
    console.log('worker-test: begin openSeaAccountCollections');
    const openSeaAccountCollections = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections?limit=25&after=cursor-one'),
      openSeaEnv,
    );
    assert.equal(openSeaAccountCollections.status, 200);
    const openSeaAccountBody = await openSeaAccountCollections.json() as {
      ok?: boolean;
      account?: { username?: string; address?: string; ens_name?: string | null };
      collections?: Array<{ collection?: string; name?: string }>;
      next?: string | null;
    };
    assert.equal(openSeaAccountBody.ok, true);
    assert.equal(openSeaAccountBody.account?.username, 'GLORIFIER');
    assert.equal(openSeaAccountBody.account?.address, '0x1234567890abcdef1234567890abcdef12345678');
    assert.equal(openSeaAccountBody.collections?.[0]?.collection, 'glorifier-services');
    assert.equal(openSeaAccountBody.next, 'next-cursor-1');
    assert.deepEqual(requestedUrls.slice(openSeaAccountStart), [
      'https://api.opensea.io/api/v2/accounts/resolve/GLORIFIER',
      'https://api.opensea.io/api/v2/account/0x1234567890abcdef1234567890abcdef12345678/collections?limit=25&after=cursor-one',
    ]);
    assert.equal(openSeaResponseQueue.length, 0);
    openSeaResponseQueue = null;

    // An account lookup that resolves to a different username must not enumerate that wallet.
    const openSeaMismatchStart = requestedUrls.length;
    openSeaResponseQueue = [
      new Response(JSON.stringify({ address: '0x1234567890abcdef1234567890abcdef12345678', username: 'not-glorifier', ens_name: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ];
    console.log('worker-test: begin openSeaAccountMismatch');
    const openSeaAccountMismatch = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections'),
      openSeaEnv,
    );
    assert.equal(openSeaAccountMismatch.status, 409);
    assert.equal(await openSeaAccountMismatch.json().then((body: { code?: string }) => body.code), 'OPENSEA_ACCOUNT_IDENTITY_MISMATCH');
    assert.equal(requestedUrls.length, openSeaMismatchStart + 1, 'a mismatched identity must not trigger the collections request');
    openSeaResponseQueue = null;

    // Account identifiers and pagination inputs are validated before any provider call.
    const openSeaInvalidLimitStart = requestedUrls.length;
    console.log('worker-test: begin openSeaInvalidLimit');
    const openSeaInvalidLimit = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections?limit=0'),
      openSeaEnv,
    );
    assert.equal(openSeaInvalidLimit.status, 400);
    assert.equal(await openSeaInvalidLimit.json().then((body: { code?: string }) => body.code), 'INVALID_OPENSEA_PAGE_LIMIT');
    assert.equal(requestedUrls.length, openSeaInvalidLimitStart);

    console.log('worker-test: begin openSeaInvalidAccount');

    const openSeaInvalidAccount = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER%2Fother/collections'),
      openSeaEnv,
    );
    assert.equal(openSeaInvalidAccount.status, 400);
    assert.equal(await openSeaInvalidAccount.json().then((body: { code?: string }) => body.code), 'INVALID_OPENSEA_ACCOUNT_IDENTIFIER');

    // Direct resolution exposes the account record without assuming a collection slug.
    const openSeaResolveStart = requestedUrls.length;
    openSeaResponseQueue = [
      new Response(JSON.stringify({ address: '0x1234567890abcdef1234567890abcdef12345678', username: 'GLORIFIER', ens_name: 'glorifier.eth' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ];
    console.log('worker-test: begin openSeaResolvedAccount');
    const openSeaResolvedAccount = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
      openSeaEnv,
    );
    assert.equal(openSeaResolvedAccount.status, 200);
    assert.equal(await openSeaResolvedAccount.json().then((body: { account?: { username?: string } }) => body.account?.username), 'GLORIFIER');
    assert.equal(requestedUrls[openSeaResolveStart], 'https://api.opensea.io/api/v2/accounts/resolve/GLORIFIER');
    openSeaResponseQueue = null;

    // A username named "resolve" must still reach the owned-collections route.
    const reservedUsernameStart = requestedUrls.length;
    openSeaResponseQueue = [
      new Response(JSON.stringify({ address: '0x1234567890abcdef1234567890abcdef12345678', username: 'resolve', ens_name: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      new Response(JSON.stringify({ collections: [{ collection: 'resolve-account-collection', name: 'Resolve Account Collection' }], next: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ];
    console.log('worker-test: begin reservedUsernameCollections');
    const reservedUsernameCollections = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/collections?limit=5'),
      openSeaEnv,
    );
    assert.equal(reservedUsernameCollections.status, 200);
    assert.equal(await reservedUsernameCollections.json().then((body: { account?: { username?: string }; collections?: Array<{ collection?: string }> }) => body.account?.username), 'resolve');
    assert.deepEqual(requestedUrls.slice(reservedUsernameStart), [
      'https://api.opensea.io/api/v2/accounts/resolve/resolve',
      'https://api.opensea.io/api/v2/account/0x1234567890abcdef1234567890abcdef12345678/collections?limit=5',
    ]);
    openSeaResponseQueue = null;

    // Percent-encoded account identifiers are decoded before local validation.
    const encodedUsernameStart = requestedUrls.length;
    openSeaResponseQueue = [
      new Response(JSON.stringify({ address: '0x1234567890abcdef1234567890abcdef12345678', username: 'GLORIFIER', ens_name: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
      new Response(JSON.stringify({ collections: [{ collection: 'glorifier7', name: 'GLORIFIER' }], next: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ];
    console.log('worker-test: begin encodedUsernameCollections');
    const encodedUsernameCollections = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/%47LORIFIER/collections?limit=5'),
      openSeaEnv,
    );
    assert.equal(encodedUsernameCollections.status, 200);
    assert.equal(await encodedUsernameCollections.json().then((body: { account?: { username?: string } }) => body.account?.username), 'GLORIFIER');
    assert.deepEqual(requestedUrls.slice(encodedUsernameStart), [
      'https://api.opensea.io/api/v2/accounts/resolve/GLORIFIER',
      'https://api.opensea.io/api/v2/account/0x1234567890abcdef1234567890abcdef12345678/collections?limit=5',
    ]);
    openSeaResponseQueue = null;

    // Malformed percent escapes fail closed, and HEAD route errors never include a body.
    console.log('worker-test: begin malformedEncodedHead');
    const malformedEncodedHead = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/%E0%A4%A/unknown', { method: 'HEAD' }),
      openSeaEnv,
    );
    assert.equal(malformedEncodedHead.status, 400);
    assert.equal(await malformedEncodedHead.text(), '');

    console.log('worker-test: begin missingAccountRouteHead');

    const missingAccountRouteHead = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/unknown', { method: 'HEAD' }),
      openSeaEnv,
    );
    assert.equal(missingAccountRouteHead.status, 404);
    assert.equal(await missingAccountRouteHead.text(), '');

    // Missing account identities retain their endpoint-specific error code.
    openSeaResponseQueue = [
      new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } }),
    ];
    console.log('worker-test: begin missingCollectionsAccount');
    const missingCollectionsAccount = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/NO_SUCH_ACCOUNT/collections'),
      openSeaEnv,
    );
    assert.equal(missingCollectionsAccount.status, 404);
    assert.equal(await missingCollectionsAccount.json().then((body: { code?: string }) => body.code), 'OPENSEA_ACCOUNT_NOT_FOUND');
    openSeaResponseQueue = null;

    // HEAD requests must not leak a response body on upstream errors.
    openSeaResponseQueue = [
      new Response('unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } }),
    ];
    console.log('worker-test: begin accountHeadError');
    const accountHeadError = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER', { method: 'HEAD' }),
      openSeaEnv,
    );
    assert.equal(accountHeadError.status, 502);
    assert.equal(await accountHeadError.text(), '');
    openSeaResponseQueue = null;

    // Retry-After may be a delay or an HTTP date; preserve a valid HTTP date.
    openSeaResponseQueue = [
      new Response('rate limited', {
        status: 429,
        headers: { 'Retry-After': 'Wed, 21 Oct 2015 07:28:00 GMT' },
      }),
    ];
    console.log('worker-test: begin accountRetryAfterDate');
    const accountRetryAfterDate = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
      openSeaEnv,
    );
    assert.equal(accountRetryAfterDate.status, 429);
    assert.equal(accountRetryAfterDate.headers.get('retry-after'), 'Wed, 21 Oct 2015 07:28:00 GMT');
    openSeaResponseQueue = null;

    // JSON-seq is not a JSON document and must be rejected.
    openSeaResponseQueue = [
      new Response('{"address":"0x1234567890abcdef1234567890abcdef12345678","username":"GLORIFIER"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json-seq' },
      }),
    ];
    console.log('worker-test: begin invalidJsonSequence');
    const invalidJsonSequence = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
      openSeaEnv,
    );
    assert.equal(invalidJsonSequence.status, 502);
    assert.equal(await invalidJsonSequence.json().then((body: { code?: string }) => body.code), 'OPENSEA_INVALID_CONTENT_TYPE');
    openSeaResponseQueue = null;

    // Request timeouts are surfaced as HTTP 504 with a stable machine-readable code.
    const openSeaTimeout = new Error('simulated OpenSea request timeout');
    openSeaTimeout.name = 'TimeoutError';
    openSeaFetchError = openSeaTimeout;
    console.log('worker-test: begin openSeaTimedOut');
    const openSeaTimedOut = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
      openSeaEnv,
    );
    assert.equal(openSeaTimedOut.status, 504);
    assert.equal(await openSeaTimedOut.json().then((body: { code?: string }) => body.code), 'OPENSEA_REQUEST_TIMEOUT');
    openSeaFetchError = null;

    // Reject malformed Retry-After values rather than forwarding JavaScript Date.parse quirks.
    for (const invalidRetryAfter of ['1.5', '-5', 'banana 1', 'Mon, 32 Nov 2015 07:28:00 GMT', 'Tue, 21 Oct 2015 07:28:00 GMT']) {
      openSeaResponseQueue = [
        new Response('rate limited', { status: 429, headers: { 'Retry-After': invalidRetryAfter } }),
      ];
      console.log('worker-test: begin malformedRetryAfter');
      const malformedRetryAfter = await worker.fetch(
        new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
        openSeaEnv,
      );
      assert.equal(malformedRetryAfter.status, 429);
      assert.equal(malformedRetryAfter.headers.get('retry-after'), null, invalidRetryAfter);
      openSeaResponseQueue = null;
    }

    // A non-timeout network failure remains a 502 and is not mislabeled as a timeout.
    openSeaFetchError = new Error('simulated OpenSea network failure');
    console.log('worker-test: begin openSeaUnavailableAccount');
    const openSeaUnavailableAccount = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
      openSeaEnv,
    );
    assert.equal(openSeaUnavailableAccount.status, 502);
    assert.equal(await openSeaUnavailableAccount.json().then((body: { code?: string }) => body.code), 'OPENSEA_UPSTREAM_UNAVAILABLE');
    openSeaFetchError = null;

    // Invalid JSON and oversized account responses fail closed with stable error codes.
    openSeaResponseQueue = [
      new Response('{invalid', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ];
    console.log('worker-test: begin malformedAccountJson');
    const malformedAccountJson = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
      openSeaEnv,
    );
    assert.equal(malformedAccountJson.status, 502);
    assert.equal(await malformedAccountJson.json().then((body: { code?: string }) => body.code), 'OPENSEA_INVALID_RESPONSE');
    openSeaResponseQueue = null;

    openSeaResponseQueue = [
      new Response('x'.repeat(1_048_577), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ];
    console.log('worker-test: begin oversizedAccountJson');
    const oversizedAccountJson = await worker.fetch(
      new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
      openSeaEnv,
    );
    assert.equal(oversizedAccountJson.status, 502);
    assert.equal(await oversizedAccountJson.json().then((body: { code?: string }) => body.code), 'OPENSEA_RESPONSE_TOO_LARGE');
    openSeaResponseQueue = null;

    console.log('Cloudflare Worker proxy tests passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

try {
  await run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
