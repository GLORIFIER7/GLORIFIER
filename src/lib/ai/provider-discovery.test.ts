import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { discoverGlobalProviders, getGlobalProviderDiscoverySnapshot, recordProviderInferenceVerification } from './provider-discovery.ts';

const environmentKeys = [
  'QWEN_API_KEY', 'QWEN_BASE_URL', 'META_API_KEY', 'META_BASE_URL', 'META_AUTHORIZED',
  'GEMINI_API_KEY', 'GEMINI_AUTHORIZED', 'NVIDIA_API_KEY', 'NVIDIA_BASE_URL', 'NVIDIA_MODEL',
  'NVIDIA_AUTHORIZED', 'OLLAMA_AUTH_TOKEN', 'OLLAMA_BASE_URL',
] as const;
const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]] as const));
const originalFetch = globalThis.fetch;
const requests: Array<{ url: string; method: string; headers: Headers }> = [];
let nvidiaProbeStatus = 200;
let metaProbeStatus = 400;
let metaProbeErrorMessage = 'temporary provider failure';
let metaProbeThrows = false;
let metaProbeMalformed = false;
let providers: Awaited<ReturnType<typeof discoverGlobalProviders>> = [];

before(() => {
  process.env.QWEN_API_KEY = 'test-qwen-key';
  process.env.QWEN_BASE_URL = '';
  process.env.META_API_KEY = 'test-meta-api-key-secret';
  process.env.META_BASE_URL = 'https://meta-user:meta-password@meta.example.test/v1?api_key=meta-url-secret';
  process.env.META_AUTHORIZED = 'true';
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  process.env.GEMINI_AUTHORIZED = 'true';
  process.env.NVIDIA_API_KEY = 'test-nvidia-key';
  process.env.NVIDIA_BASE_URL = 'https://nvidia.example.test/v1';
  process.env.NVIDIA_MODEL = 'nvidia/test-model';
  process.env.NVIDIA_AUTHORIZED = 'true';
  process.env.OLLAMA_AUTH_TOKEN = 'test-ollama-token';
  process.env.OLLAMA_BASE_URL = 'http://ollama-user:ollama-password@ollama.example.test:11434?token=ollama-url-secret';
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method || 'GET').toUpperCase();
    requests.push({ url, method, headers: new Headers(init?.headers) });
    const hostname = new URL(url).hostname;
    if (hostname === 'meta.example.test' && metaProbeThrows) throw new Error(`request failed for ${url}`);
    const payload = hostname === 'generativelanguage.googleapis.com'
      ? { models: [{ name: 'models/gemini-2.5-flash' }] }
      : hostname === 'meta.example.test'
        ? metaProbeMalformed
          ? { error: { message: 'upstream proxy returned an unsupported response' } }
          : metaProbeStatus < 400
            ? { data: [{ id: 'meta/test-model' }] }
            : metaProbeStatus === 400
              ? { error: { message: `invalid api_key: ${process.env.META_API_KEY}` } }
              : { error: { message: metaProbeErrorMessage } }
        : hostname === 'ollama.example.test'
          ? { models: [{ name: 'llama3' }] }
          : nvidiaProbeStatus >= 400
            ? { error: { message: 'NVIDIA credential rejected' } }
            : { data: [{ id: 'nvidia/test-model' }] };
    const status = hostname === 'generativelanguage.googleapis.com' ? 200
      : hostname === 'meta.example.test' ? metaProbeStatus : nvidiaProbeStatus;
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  for (const key of environmentKeys) {
    const previous = originalEnvironment.get(key);
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test('provider discovery reports configuration, availability and unique provider IDs', async () => {
  providers = await discoverGlobalProviders('provider-discovery-regression-test', { persistConnections: false });
  const ids = new Set(providers.map((provider) => provider.id));
  assert.equal(ids.has('qwen'), true);
  assert.equal(ids.has('openai'), true);
  assert.equal(ids.has('ollama'), true);
  assert.equal(providers.length, ids.size);
  const qwen = providers.find((provider) => provider.id === 'qwen');
  assert.ok(qwen);
  assert.equal(qwen.configured, false);
  assert.equal(qwen.availability, 'unconfigured');
  assert.match(qwen.reason || '', /QWEN_BASE_URL/);
});

test('provider discovery sanitizes credentials and distinguishes endpoint errors', () => {
  const meta = providers.find((provider) => provider.id === 'meta');
  assert.ok(meta);
  assert.equal(meta.availability, 'error');
  assert.equal(meta.authenticated, false);
  assert.equal(meta.authorization, 'configured');
  assert.equal(meta.endpoint, 'https://meta.example.test/v1');
  assert.equal(meta.reason?.includes('test-meta-api-key-secret'), false);
  assert.equal(meta.reason?.includes('meta-url-secret'), false);
  assert.equal(meta.reason?.includes('[REDACTED]'), true);
});

test('Gemini discovery sends its API key in a header, never in the request URL', () => {
  const request = requests.find((item) => new URL(item.url).hostname === 'generativelanguage.googleapis.com');
  assert.ok(request);
  const url = new URL(request.url);
  assert.equal(url.pathname, '/v1beta/models');
  assert.equal(url.search, '');
  assert.equal(request.headers.get('x-goog-api-key'), process.env.GEMINI_API_KEY);
  assert.equal(request.headers.get('authorization'), null);
});

test('Ollama and Meta discovery requests never forward credentials in URLs', () => {
  const ollamaRequest = requests.find((request) => new URL(request.url).hostname === 'ollama.example.test');
  assert.ok(ollamaRequest);
  const ollamaUrl = new URL(ollamaRequest.url);
  assert.equal(ollamaUrl.pathname, '/api/tags');
  assert.equal(ollamaUrl.username, '');
  assert.equal(ollamaUrl.password, '');
  assert.equal(ollamaUrl.search, '');
  const metaRequest = requests.find((request) => new URL(request.url).hostname === 'meta.example.test');
  assert.ok(metaRequest);
  const metaUrl = new URL(metaRequest.url);
  assert.equal(metaUrl.pathname, '/v1/models');
  assert.equal(metaUrl.username, '');
  assert.equal(metaUrl.password, '');
  assert.equal(metaUrl.search, '');
});

test('malformed and rate-limited model-list responses do not authenticate Meta', async () => {
  metaProbeStatus = 200;
  metaProbeMalformed = true;
  const malformed = await discoverGlobalProviders('provider-discovery-malformed-success-regression', { persistConnections: false });
  assert.equal(malformed.find((provider) => provider.id === 'meta')?.availability, 'error');
  assert.equal(malformed.find((provider) => provider.id === 'meta')?.authenticated, false);
  metaProbeMalformed = false;
  metaProbeStatus = 429;
  const rateLimited = await discoverGlobalProviders('provider-discovery-rate-limit-auth-regression', { persistConnections: false });
  const meta = rateLimited.find((provider) => provider.id === 'meta');
  assert.equal(meta?.availability, 'rate_limited');
  assert.equal(meta?.authenticated, false);
  assert.equal(meta?.reason?.includes('test-meta-api-key-secret'), false);
});

test('classifies billing responses as quota exhaustion without authenticating Meta', async () => {
  metaProbeStatus = 402;
  const billing = await discoverGlobalProviders('provider-discovery-billing-limit-regression', { persistConnections: false });
  const meta = billing.find((provider) => provider.id === 'meta');
  assert.equal(meta?.availability, 'quota_exhausted');
  assert.equal(meta?.authenticated, false);
  assert.equal(meta?.reason, 'quota_or_billing_limit');
});

test('preserves legacy classification for non-400 4xx billing wording', async () => {
  metaProbeStatus = 404;
  metaProbeErrorMessage = 'upstream quota exceeded';
  const notFound = await discoverGlobalProviders('provider-discovery-404-quota-wording-regression', { persistConnections: false });
  const missingMeta = notFound.find((provider) => provider.id === 'meta');
  assert.equal(missingMeta?.availability, 'error');
  assert.equal(missingMeta?.reason, 'quota_or_billing_limit');

  metaProbeStatus = 429;
  metaProbeErrorMessage = 'provider billing maintenance';
  const billingRateLimit = await discoverGlobalProviders('provider-discovery-429-billing-wording-regression', { persistConnections: false });
  const rateLimitedMeta = billingRateLimit.find((provider) => provider.id === 'meta');
  assert.equal(rateLimitedMeta?.availability, 'rate_limited');
  assert.equal(rateLimitedMeta?.reason, 'quota_or_billing_limit');

  metaProbeStatus = 400;
  metaProbeErrorMessage = 'temporary provider failure';
});

test('does not classify provider 5xx quota wording as a billing-limit reason', async () => {
  metaProbeStatus = 503;
  metaProbeErrorMessage = 'upstream quota exceeded';
  const failure = await discoverGlobalProviders('provider-discovery-5xx-quota-wording-regression', { persistConnections: false });
  const meta = failure.find((provider) => provider.id === 'meta');
  assert.equal(meta?.availability, 'unreachable');
  assert.equal(meta?.reason, 'provider_service_error');
  metaProbeStatus = 429;
  const quotaLimited = await discoverGlobalProviders('provider-discovery-429-quota-reason-regression', { persistConnections: false });
  const limitedMeta = quotaLimited.find((provider) => provider.id === 'meta');
  assert.equal(limitedMeta?.availability, 'quota_exhausted');
  assert.equal(limitedMeta?.reason, 'quota_or_billing_limit');
  metaProbeStatus = 400;
  metaProbeErrorMessage = 'temporary provider failure';
});

test('server and network errors fail closed and redact endpoint credentials', async () => {
  metaProbeStatus = 503;
  const serverError = await discoverGlobalProviders('provider-discovery-server-error-auth-regression', { persistConnections: false });
  const unavailable = serverError.find((provider) => provider.id === 'meta');
  assert.equal(unavailable?.availability, 'unreachable');
  assert.equal(unavailable?.authenticated, false);
  assert.equal(unavailable?.reason?.includes('test-meta-api-key-secret'), false);
  metaProbeStatus = 400;
  metaProbeThrows = true;
  const networkError = await discoverGlobalProviders('provider-discovery-network-error-redaction-regression', { persistConnections: false });
  const meta = networkError.find((provider) => provider.id === 'meta');
  assert.equal(meta?.availability, 'unreachable');
  assert.equal(meta?.reason?.includes('meta-user'), false);
  assert.equal(meta?.reason?.includes('meta-password'), false);
  assert.equal(meta?.reason?.includes('meta-url-secret'), false);
  assert.match(meta?.reason || '', /request failed for https:\/\/meta\.example\.test\/v1\/models/);
  assert.equal(meta?.reason?.includes('[REDACTED]'), false);
  metaProbeThrows = false;
});

test('read-only NVIDIA model discovery does not imply inference authorization', async () => {
  const nvidia = providers.find((provider) => provider.id === 'nvidia');
  assert.ok(nvidia);
  assert.equal(nvidia.availability, 'available');
  assert.equal(nvidia.authenticated, false);
  assert.equal(nvidia.authorization, 'pending');
  assert.match(nvidia.reason || '', /inference verification requires a separately authorized user request/i);
  assert.ok(nvidia.models.includes('nvidia/test-model'));
  const before = getGlobalProviderDiscoverySnapshot().find((provider) => provider.id === 'nvidia');
  assert.equal(before?.authorization, 'pending');
  await recordProviderInferenceVerification('nvidia', 'nvidia/inference-confirmed-only');
  const afterInference = getGlobalProviderDiscoverySnapshot().find((provider) => provider.id === 'nvidia');
  assert.equal(afterInference?.authenticated, true);
  assert.equal(afterInference?.authorization, 'configured');
  assert.ok(afterInference?.models.includes('nvidia/inference-confirmed-only'));
  const refreshedProviders = await discoverGlobalProviders('provider-discovery-refresh-regression-test', { persistConnections: false });
  const returnedAfterRefresh = refreshedProviders.find((provider) => provider.id === 'nvidia');
  assert.equal(returnedAfterRefresh?.authenticated, true,
    'the refresh result must expose the preserved inference proof, not the raw unauthenticated model-list probe');
  assert.equal(returnedAfterRefresh?.authorization, 'configured');
  assert.ok(returnedAfterRefresh?.models.includes('nvidia/inference-confirmed-only'));
  const afterRefresh = getGlobalProviderDiscoverySnapshot().find((provider) => provider.id === 'nvidia');
  assert.equal(afterRefresh?.authenticated, true);
  assert.equal(afterRefresh?.authorization, 'configured');
  assert.ok(afterRefresh?.models.includes('nvidia/inference-confirmed-only'));
});

test('credential rotation invalidates prior NVIDIA inference proof', async () => {
  process.env.NVIDIA_API_KEY = 'rotated-nvidia-test-key';
  await discoverGlobalProviders('provider-discovery-rotated-key-regression-test', { persistConnections: false });
  const provider = getGlobalProviderDiscoverySnapshot().find((entry) => entry.id === 'nvidia');
  assert.equal(provider?.authenticated, false);
  assert.equal(provider?.authorization, 'pending');
});

test('fresh NVIDIA 401 and 403 responses revoke previous inference proof', async () => {
  await recordProviderInferenceVerification('nvidia', 'nvidia/inference-confirmed-only');
  nvidiaProbeStatus = 401;
  await discoverGlobalProviders('provider-discovery-nvidia-401-revocation', { persistConnections: false });
  let provider = getGlobalProviderDiscoverySnapshot().find((entry) => entry.id === 'nvidia');
  assert.equal(provider?.availability, 'auth_failure');
  assert.equal(provider?.authenticated, false);
  assert.equal(provider?.authorization, 'pending');
  assert.equal(provider?.models.includes('nvidia/inference-confirmed-only'), false);
  await recordProviderInferenceVerification('nvidia', 'nvidia/inference-confirmed-only');
  nvidiaProbeStatus = 403;
  await discoverGlobalProviders('provider-discovery-nvidia-403-revocation', { persistConnections: false });
  provider = getGlobalProviderDiscoverySnapshot().find((entry) => entry.id === 'nvidia');
  assert.equal(provider?.availability, 'auth_failure');
  assert.equal(provider?.authenticated, false);
  assert.equal(provider?.authorization, 'pending');
  assert.equal(provider?.models.includes('nvidia/inference-confirmed-only'), false);
});

test('provider discovery uses GET only and never invokes inference endpoints', () => {
  const gemini = providers.find((provider) => provider.id === 'gemini');
  assert.ok(gemini);
  assert.ok(gemini.models.includes('gemini-2.5-flash'));
  assert.equal(requests.some((request) => request.method !== 'GET'), false);
  assert.equal(requests.some((request) => request.url.endsWith('/chat/completions')), false);
});
