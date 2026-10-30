import { strict as assert } from 'node:assert';
import { discoverGlobalProviders, getGlobalProviderDiscoverySnapshot, recordProviderInferenceVerification } from './provider-discovery.ts';

const environmentKeys = [
  'QWEN_API_KEY',
  'QWEN_BASE_URL',
  'META_API_KEY',
  'META_BASE_URL',
  'META_AUTHORIZED',
  'GEMINI_API_KEY',
  'GEMINI_AUTHORIZED',
  'NVIDIA_API_KEY',
  'NVIDIA_BASE_URL',
  'NVIDIA_MODEL',
  'NVIDIA_AUTHORIZED',
] as const;
const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]] as const));
const originalFetch = globalThis.fetch;
const requests: Array<{ url: string; method: string }> = [];
let nvidiaProbeStatus = 200;
let metaProbeStatus = 400;
let metaProbeThrows = false;

try {
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

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    const method = (init?.method || 'GET').toUpperCase();
    requests.push({ url, method });
    const hostname = new URL(url).hostname;
    if (hostname === 'meta.example.test' && metaProbeThrows) {
      throw new Error(`request failed for ${url}`);
    }
    const payload = hostname === 'generativelanguage.googleapis.com'
      ? { models: [{ name: 'models/gemini-2.5-flash' }] }
      : hostname === 'meta.example.test'
        ? { error: { message: `invalid api_key: ${process.env.META_API_KEY}` } }
        : nvidiaProbeStatus >= 400
          ? { error: { message: 'NVIDIA credential rejected' } }
          : { data: [{ id: 'nvidia/test-model' }] };
    const status = hostname === 'generativelanguage.googleapis.com' ? 200
      : hostname === 'meta.example.test' ? metaProbeStatus : nvidiaProbeStatus;
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const providers = await discoverGlobalProviders('provider-discovery-regression-test', {
    persistConnections: false,
  });
  const ids = new Set(providers.map((provider) => provider.id));
  const qwen = providers.find((provider) => provider.id === 'qwen');
  const nvidia = providers.find((provider) => provider.id === 'nvidia');
  const meta = providers.find((provider) => provider.id === 'meta');

  assert.equal(ids.has('qwen'), true, 'Qwen must be represented in discovery');
  assert.equal(ids.has('openai'), true, 'OpenAI discovery remains registered');
  assert.equal(ids.has('ollama'), true, 'self-hosted Ollama discovery remains registered');
  assert.equal(providers.length, ids.size, 'provider discovery IDs must be unique');

  assert.ok(qwen, 'Qwen discovery entry must exist');
  assert.equal(qwen.configured, false, 'Qwen without a base URL must remain unconfigured');
  assert.equal(qwen.availability, 'unconfigured');
  assert.match(qwen.reason || '', /QWEN_BASE_URL/, 'configuration guidance must name the required environment variable');

  assert.ok(meta, 'Meta discovery entry must exist');
  assert.equal(meta.availability, 'error', 'a malformed-credential response remains an endpoint error');
  assert.equal(meta.authenticated, false, 'HTTP 400 must not be interpreted as successful authentication');
  assert.equal(meta.authorization, 'configured', 'operator authorization remains distinct from provider authentication');
  assert.equal(meta.endpoint, 'https://meta.example.test/v1', 'diagnostic endpoints must omit URL credentials and query parameters');
  assert.equal(meta.reason?.includes('test-meta-api-key-secret'), false, 'provider error messages must redact echoed API credentials');
  assert.equal(meta.reason?.includes('meta-url-secret'), false, 'provider diagnostics must not expose endpoint query credentials');
  assert.equal(meta.reason?.includes('[REDACTED]'), true, 'redacted provider errors should remain diagnosable');

  metaProbeStatus = 429;
  const afterRateLimit = await discoverGlobalProviders('provider-discovery-rate-limit-auth-regression', { persistConnections: false });
  const rateLimitedMeta = afterRateLimit.find((provider) => provider.id === 'meta');
  assert.equal(rateLimitedMeta?.availability, 'rate_limited');
  assert.equal(rateLimitedMeta?.authenticated, false, 'HTTP 429 does not prove successful model-list authentication');

  metaProbeStatus = 503;
  const afterServerError = await discoverGlobalProviders('provider-discovery-server-error-auth-regression', { persistConnections: false });
  const unavailableMeta = afterServerError.find((provider) => provider.id === 'meta');
  assert.equal(unavailableMeta?.availability, 'unreachable');
  assert.equal(unavailableMeta?.authenticated, false, 'HTTP 5xx must not be interpreted as successful authentication');
  metaProbeStatus = 400;
  metaProbeThrows = true;
  const afterNetworkError = await discoverGlobalProviders('provider-discovery-network-error-redaction-regression', { persistConnections: false });
  const networkErrorMeta = afterNetworkError.find((provider) => provider.id === 'meta');
  assert.equal(networkErrorMeta?.availability, 'unreachable');
  assert.equal(networkErrorMeta?.reason?.includes('meta-user'), false, 'network diagnostics must redact endpoint usernames');
  assert.equal(networkErrorMeta?.reason?.includes('meta-password'), false, 'network diagnostics must redact endpoint passwords');
  assert.equal(networkErrorMeta?.reason?.includes('meta-url-secret'), false, 'network diagnostics must redact endpoint query secrets');
  assert.equal(networkErrorMeta?.reason?.includes('[REDACTED]'), true, 'network diagnostics should remain useful after redaction');
  metaProbeThrows = false;

  assert.ok(nvidia, 'NVIDIA discovery entry must exist');
  assert.equal(nvidia.availability, 'available', 'the read-only models endpoint should be discoverable');
  assert.equal(nvidia.authenticated, false, 'NVIDIA model-list access must not claim inference authentication');
  assert.equal(nvidia.authorization, 'pending', 'read-only model discovery must not mark NVIDIA inference authorization as verified');
  assert.equal(nvidia.authenticated, false, 'a successful models list is not inference authentication');
  assert.match(nvidia.reason || '', /inference verification requires a separately authorized user request/i);

  assert.ok(nvidia.models.includes('nvidia/test-model'), 'NVIDIA discovery should retain advertised model IDs');
  const beforeInference = getGlobalProviderDiscoverySnapshot().find((provider) => provider.id === 'nvidia');
  assert.equal(beforeInference?.authorization, 'pending');
  await recordProviderInferenceVerification('nvidia', 'nvidia/inference-confirmed-only');
  const afterInference = getGlobalProviderDiscoverySnapshot().find((provider) => provider.id === 'nvidia');
  assert.equal(afterInference?.authenticated, true, 'only successful, separately authorized inference promotes NVIDIA authentication');
  assert.equal(afterInference?.authorization, 'configured');
  assert.ok(afterInference?.models.includes('nvidia/inference-confirmed-only'), 'successful inference must add the exact model ID used by the inference check');
  await discoverGlobalProviders('provider-discovery-refresh-regression-test', { persistConnections: false });
  const afterReadOnlyRefresh = getGlobalProviderDiscoverySnapshot().find((provider) => provider.id === 'nvidia');
  assert.equal(afterReadOnlyRefresh?.authenticated, true, 'read-only refresh must preserve an earlier successful inference proof for the unchanged key and endpoint');
  assert.equal(afterReadOnlyRefresh?.authorization, 'configured');
  assert.ok(afterReadOnlyRefresh?.models.includes('nvidia/inference-confirmed-only'));

  process.env.NVIDIA_API_KEY = 'rotated-nvidia-test-key';
  await discoverGlobalProviders('provider-discovery-rotated-key-regression-test', { persistConnections: false });
  const afterCredentialRotation = getGlobalProviderDiscoverySnapshot().find((provider) => provider.id === 'nvidia');
  assert.equal(afterCredentialRotation?.authenticated, false, 'a credential change must invalidate prior inference proof');
  assert.equal(afterCredentialRotation?.authorization, 'pending');

  // A fresh 401/403 must revoke any prior inference proof for the same credential.
  await recordProviderInferenceVerification('nvidia', 'nvidia/inference-confirmed-only');
  nvidiaProbeStatus = 401;
  await discoverGlobalProviders('provider-discovery-nvidia-401-revocation', { persistConnections: false });
  const afterUnauthorizedRefresh = getGlobalProviderDiscoverySnapshot().find((provider) => provider.id === 'nvidia');
  assert.equal(afterUnauthorizedRefresh?.availability, 'auth_failure');
  assert.equal(afterUnauthorizedRefresh?.authenticated, false, 'a fresh 401 must revoke stale inference authentication');
  assert.equal(afterUnauthorizedRefresh?.authorization, 'pending', 'a fresh 401 must revoke stale authorization');
  assert.equal(afterUnauthorizedRefresh?.models.includes('nvidia/inference-confirmed-only'), false);

  await recordProviderInferenceVerification('nvidia', 'nvidia/inference-confirmed-only');
  nvidiaProbeStatus = 403;
  await discoverGlobalProviders('provider-discovery-nvidia-403-revocation', { persistConnections: false });
  const afterForbiddenRefresh = getGlobalProviderDiscoverySnapshot().find((provider) => provider.id === 'nvidia');
  assert.equal(afterForbiddenRefresh?.availability, 'auth_failure');
  assert.equal(afterForbiddenRefresh?.authenticated, false, 'a fresh 403 must revoke stale inference authentication');
  assert.equal(afterForbiddenRefresh?.authorization, 'pending', 'a fresh 403 must revoke stale authorization');
  assert.equal(afterForbiddenRefresh?.models.includes('nvidia/inference-confirmed-only'), false);

  const gemini = providers.find((provider) => provider.id === 'gemini');
  assert.ok(gemini, 'Gemini discovery entry must exist');
  assert.ok(gemini.models.includes('gemini-2.5-flash'), 'Gemini model resource names must be normalized to request model IDs');
  assert.equal(
    requests.some((request) => request.method !== 'GET'),
    false,
    'provider discovery must not issue billable non-GET requests',
  );
  assert.equal(
    requests.some((request) => request.url.endsWith('/chat/completions')),
    false,
    'provider discovery must not call inference endpoints',
  );
} finally {
  globalThis.fetch = originalFetch;
  for (const key of environmentKeys) {
    const previous = originalEnvironment.get(key);
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

console.log('provider discovery behavior tests: PASS');
