import { strict as assert } from 'node:assert';
import {
  discoverConfiguredModelCouncilParticipants,
  ModelCouncilClientError,
  submitAuthenticatedModelCouncilRequest,
} from './model-council-client.ts';

const registryResponse = new Response(JSON.stringify({
  providers: [
    { id: 'openai', status: 'connected', models: ['gpt-4o', 'gpt-4.1'] },
    { id: 'anthropic', status: 'connected', models: ['claude-opus-5'] },
    { id: 'gemini', status: 'disconnected', models: ['gemini-3.1-flash-lite'] },
    { id: 'meta', status: 'connected', models: [] },
    ...Array.from({ length: 9 }, (_, index) => ({
      id: `provider-${index}`, status: 'connected', models: [`model-${index}`],
    })),
  ],
}), { status: 200, headers: { 'content-type': 'application/json' } });

const discovered = await discoverConfiguredModelCouncilParticipants(
  async () => registryResponse.clone(),
);
assert.equal(discovered.length, 8, 'participant discovery must respect the server council maximum');
assert.deepEqual(discovered.slice(0, 2), [
  { providerId: 'openai', modelId: 'gpt-4o' },
  { providerId: 'anthropic', modelId: 'claude-opus-5' },
]);
assert.equal(discovered.some((selection) => selection.providerId === 'gemini'), false);
assert.equal(discovered.some((selection) => selection.providerId === 'meta'), false);

let capturedUrl = '';
let capturedInit: RequestInit | undefined;
const responseBody = {
  ok: true,
  agenda: 'Review',
  timestamp: '2026-10-31T00:00:00.000Z',
  participants: [{
    modelId: 'openai/gpt-4o',
    name: 'gpt-4o',
    provider: 'openai',
    role: 'Independent provider analysis',
    color: 'emerald',
    badge: 'Live provider response',
    status: 'completed',
    output: 'Evidence-based response',
    perspective: 'Independent output',
  }],
  unifiedConsensus: 'No consensus is inferred.',
  consensusScore: null,
  recommendedEpsilon: null,
  recommendedFloorUsd: null,
  actionDirectives: [],
  participantCount: 1,
  providerDiversity: 1,
  failures: [],
};
const result = await submitAuthenticatedModelCouncilRequest({
  agenda: 'Review',
  participants: [{ providerId: 'openai', modelId: 'gpt-4o' }],
  currentPolicy: { globalEpsilon: null },
  footprints: [],
  getToken: async () => 'verified-test-token',
  fetcher: async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init;
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  },
});
assert.equal(capturedUrl, '/api/ai/council');
assert.equal(capturedInit?.headers && (capturedInit.headers as Record<string, string>).Authorization, 'Bearer verified-test-token');
assert.deepEqual(JSON.parse(String(capturedInit?.body)).participants, [{ providerId: 'openai', modelId: 'gpt-4o' }]);
assert.equal(result.participants[0].provider, 'openai');

let normalizedError: ModelCouncilClientError | null = null;
try {
  await submitAuthenticatedModelCouncilRequest({
    agenda: 'Review',
    participants: [{ providerId: 'gemini', modelId: 'gemini-3.1-flash-lite' }],
    getToken: async () => 'verified-test-token',
    fetcher: async () => new Response(JSON.stringify({
      ok: false,
      error: 'No selected provider returned a usable response.',
      failures: [{ providerId: 'gemini', modelId: 'gemini-3.1-flash-lite', code: 'provider_timeout', rawError: 'must not be surfaced' }],
    }), { status: 503, headers: { 'content-type': 'application/json' } }),
  });
} catch (error) {
  if (error instanceof ModelCouncilClientError) normalizedError = error;
}
assert.ok(normalizedError);
assert.equal(normalizedError.status, 503);
assert.deepEqual(normalizedError.failures, [{
  providerId: 'gemini',
  modelId: 'gemini-3.1-flash-lite',
  code: 'provider_timeout',
}]);

let authError: ModelCouncilClientError | null = null;
try {
  await submitAuthenticatedModelCouncilRequest({
    agenda: 'Review',
    participants: [{ providerId: 'openai', modelId: 'gpt-4o' }],
    getToken: async () => null,
    fetcher: async () => { throw new Error('fetch must not run without a token'); },
  });
} catch (error) {
  if (error instanceof ModelCouncilClientError) authError = error;
}
assert.equal(authError?.status, 401);

console.log('Model council client tests: PASS');
