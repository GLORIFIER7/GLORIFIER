import test from 'node:test';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { createModelCouncilRateLimit } from './model-council-rate-limit.mjs';
import assert from 'node:assert/strict';
import {
  executeModelCouncilProviders,
  isValidModelCouncilResponse,
  resolveModelCouncilParticipants,
  resolveModelCouncilProviderIds,
  validateModelCouncilProviderIds,
} from './model-council-routing.mjs';

const knownProviders = ['openai', 'gemini', 'anthropic', 'meta', 'nvidia', 'mistral', 'deepseek', 'qwen', 'groq'];

test('provider selection requires at least one known provider', () => {
  assert.throws(() => validateModelCouncilProviderIds(undefined, knownProviders), /array/i);
  assert.throws(() => validateModelCouncilProviderIds([], knownProviders), /at least one/i);
  assert.throws(() => validateModelCouncilProviderIds(['unknown-provider'], knownProviders), /unknown provider/i);
});

test('provider selection rejects blank, duplicate, and excessive provider IDs', () => {
  assert.throws(() => validateModelCouncilProviderIds(['openai', ' '], knownProviders), /non-empty/i);
  assert.throws(() => validateModelCouncilProviderIds(['openai', 'openai'], knownProviders), /duplicate/i);
  assert.throws(() => validateModelCouncilProviderIds(knownProviders, knownProviders), /at most/i);
});

test('provider selection trims IDs and preserves the owner-selected order', () => {
  assert.deepEqual(
    validateModelCouncilProviderIds([' openai ', 'anthropic', 'gemini'], knownProviders),
    ['openai', 'anthropic', 'gemini'],
  );
});

test('council executes exactly the selected providers and reports actual identities', async () => {
  const calls = [];
  const result = await executeModelCouncilProviders({
    providerIds: ['openai', 'anthropic', 'gemini'],
    messages: [{ role: 'user', content: 'Review this change.' }],
    generate: async (providerId, messages) => {
      calls.push({ providerId, messages });
      return {
        provider: providerId,
        model: `${providerId}-actual-model`,
        text: `Independent findings from ${providerId}.`,
      };
    },
  });

  assert.deepEqual(calls.map(({ providerId }) => providerId), ['openai', 'anthropic', 'gemini']);
  assert.equal(result.status, 'complete');
  assert.equal(result.participantCount, 3);
  assert.equal(result.providerDiversity, 3);
  assert.deepEqual(result.participants.map(({ provider }) => provider), ['openai', 'anthropic', 'gemini']);
  assert.deepEqual(result.participants.map(({ model }) => model), [
    'openai-actual-model', 'anthropic-actual-model', 'gemini-actual-model',
  ]);
  assert.deepEqual(result.failures, []);
});

test('failed providers are reported without substituting an unselected provider', async () => {
  const calls = [];
  const result = await executeModelCouncilProviders({
    providerIds: ['openai', 'anthropic'],
    messages: [{ role: 'user', content: 'Review this change.' }],
    generate: async (providerId) => {
      calls.push(providerId);
      if (providerId === 'anthropic') throw new Error('credential details must not be exposed');
      return { provider: providerId, model: 'gpt-test', text: 'One independent response.' };
    },
  });

  assert.deepEqual(calls, ['openai', 'anthropic']);
  assert.equal(result.status, 'partial');
  assert.equal(result.participantCount, 1);
  assert.equal(result.providerDiversity, 1);
  assert.deepEqual(result.failures, [{ providerId: 'anthropic', modelId: null, code: 'provider_execution_failed' }]);
  assert.equal(JSON.stringify(result).includes('credential details'), false);
});

test('council rejects a response that claims a different provider or contains no text', async () => {
  const mismatch = await executeModelCouncilProviders({
    providerIds: ['openai'],
    messages: [],
    generate: async () => ({ provider: 'gemini', model: 'model-x', text: 'misattributed response' }),
  });
  assert.equal(mismatch.status, 'unavailable');
  assert.equal(mismatch.participantCount, 0);
  assert.deepEqual(mismatch.failures, [{ providerId: 'openai', modelId: null, code: 'provider_execution_failed' }]);

  const empty = await executeModelCouncilProviders({
    providerIds: ['openai'],
    messages: [],
    generate: async () => ({ provider: 'openai', model: 'gpt-test', text: '   ' }),
  });
  assert.equal(empty.status, 'unavailable');
  assert.equal(empty.participantCount, 0);
});

test('legacy model selection rejects unknown IDs instead of silently dropping them', async () => {
  assert.deepEqual(
    resolveModelCouncilProviderIds({
      activeModels: ['gpt-4o', 'claude', 'gemini-3.8-flash'],
      availableProviderIds: knownProviders,
    }),
    ['openai', 'anthropic', 'gemini'],
  );
  assert.throws(
    () => resolveModelCouncilProviderIds({
      activeModels: ['gpt-4o', 'unrecognized-model'],
      availableProviderIds: knownProviders,
    }),
    /unknown provider/i,
  );
  assert.throws(
    () => resolveModelCouncilProviderIds({
      activeModels: ['gpt-4o', 42],
      availableProviderIds: knownProviders,
    }),
    /non-empty string/i,
  );
});

test('AI council route requires owner authorization and has a principal-scoped spend limit', async () => {
  const serverSource = await readFile(new URL('../../../server.ts', import.meta.url), 'utf8');
  assert.match(
    serverSource,
    /app\.post\('\/api\/ai\/council',\s*requireOwnerOrInternalService,\s*aiCouncilRateLimit,/,
  );
  assert.match(serverSource, /createModelCouncilRateLimit\(\{[\s\S]*?limit:\s*2/);
  assert.match(serverSource, /singleInstanceConfirmed:\s*process\.env\.AI_COUNCIL_SINGLE_INSTANCE === 'true'/);
  assert.match(serverSource, /handler:\s*\(_req,\s*res\)\s*=>\s*\{[\s\S]*?error:\s*'AI council usage is limited to two requests per minute/);
  assert.match(serverSource, /model:\s*modelId,\s*messages,[^}]*\bsignal\s*\}/);
  assert.match(serverSource, /isValidModelCouncilResponse\(synthesisResponse,\s*synthesisProvider,\s*synthesisModel\)/);
});

test('malformed explicit providerIds are not ignored in favor of legacy activeModels', () => {
  assert.throws(
    () => resolveModelCouncilProviderIds({
      providerIds: 'openai',
      activeModels: ['gpt-4o'],
      availableProviderIds: knownProviders,
    }),
    /array/i,
  );
});

async function withCouncilRateLimit(handler) {
  const app = express();
  app.use((req, _res, next) => {
    const principalId = req.get('x-test-principal');
    if (principalId) req.auth = { uid: principalId };
    next();
  });
  app.use(createModelCouncilRateLimit({ windowMs: 60_000, limit: 2, production: false }));
  app.post('/council', (_req, res) => res.status(200).json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/council`;
  try {
    await handler(url);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test('council rate limit is enforced independently per authenticated principal', async () => {
  await withCouncilRateLimit(async (url) => {
    const call = (principal) => fetch(url, {
      method: 'POST',
      headers: { 'x-test-principal': principal },
    });
    assert.equal((await call('owner-a')).status, 200);
    assert.equal((await call('owner-a')).status, 200);
    assert.equal((await call('owner-a')).status, 429);
    assert.equal((await call('owner-b')).status, 200);
  });
});

test('trusted internal-service calls without a user principal are rate-limited by IP', async () => {
  await withCouncilRateLimit(async (url) => {
    const call = () => fetch(url, { method: 'POST' });
    assert.equal((await call()).status, 200);
    assert.equal((await call()).status, 200);
    assert.equal((await call()).status, 429);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'x-real-ip': '203.0.113.10' } })).status, 200);
    assert.equal((await fetch(url, { method: 'POST', headers: { 'x-real-ip': 'not-an-ip' } })).status, 429);
  });
});

const providerCatalog = [
  { id: 'openai', models: ['gpt-4o', 'gpt-4.1'] },
  { id: 'anthropic', models: ['claude-opus-5'] },
  { id: 'gemini', models: ['gemini-3.1-flash-lite'] },
  { id: 'meta', models: ['llama-3.3'] },
];

test('model council resolves exact provider/model pairs and permits distinct models from one provider', () => {
  const selected = resolveModelCouncilParticipants({
    participants: [
      { providerId: 'openai', modelId: 'gpt-4o' },
      { providerId: 'openai', modelId: 'gpt-4.1' },
      { providerId: 'anthropic', modelId: 'claude-opus-5' },
    ],
    availableProviders: providerCatalog,
  });
  assert.deepEqual(selected, [
    { providerId: 'openai', modelId: 'gpt-4o' },
    { providerId: 'openai', modelId: 'gpt-4.1' },
    { providerId: 'anthropic', modelId: 'claude-opus-5' },
  ]);
  assert.throws(() => resolveModelCouncilParticipants({
    participants: [
      { providerId: 'openai', modelId: 'gpt-4o' },
      { providerId: 'openai', modelId: 'gpt-4o' },
    ],
    availableProviders: providerCatalog,
  }), /duplicate/i);
  assert.throws(() => resolveModelCouncilParticipants({
    participants: [{ providerId: 'openai', modelId: 'not-advertised' }],
    availableProviders: providerCatalog,
  }), /unknown model/i);
});

test('model council forwards the exact model and complete agenda messages to each provider', async () => {
  const messages = [
    { role: 'system', content: 'Policy context must be preserved.' },
    { role: 'user', content: 'Review the repository.' },
  ];
  const calls = [];
  const result = await executeModelCouncilProviders({
    participants: [
      { providerId: 'openai', modelId: 'gpt-4o' },
      { providerId: 'openai', modelId: 'gpt-4.1' },
    ],
    messages,
    timeoutMs: 100,
    generate: async (providerId, modelId, forwardedMessages, signal) => {
      calls.push({ providerId, modelId, messages: forwardedMessages, signal });
      return { provider: providerId, model: modelId, text: `Response from ${modelId}` };
    },
  });
  assert.deepEqual(calls.map((call) => [call.providerId, call.modelId]), [
    ['openai', 'gpt-4o'],
    ['openai', 'gpt-4.1'],
  ]);
  assert.deepEqual(calls.map((call) => call.messages), [messages, messages]);
  assert.equal(calls.every((call) => call.signal instanceof AbortSignal), true);
  assert.equal(result.participantCount, 2);
  assert.equal(result.providerDiversity, 1);
  assert.deepEqual(result.participants.map((participant) => participant.model), ['gpt-4o', 'gpt-4.1']);
});

test('a provider timeout aborts the request and reports a sanitized timeout failure', async () => {
  let capturedSignal;
  const result = await executeModelCouncilProviders({
    participants: [{ providerId: 'gemini', modelId: 'gemini-3.1-flash-lite' }],
    messages: [{ role: 'user', content: 'timeout test' }],
    timeoutMs: 5,
    generate: async (_providerId, _modelId, _messages, signal) => {
      capturedSignal = signal;
      return new Promise(() => {});
    },
  });
  assert.equal(capturedSignal.aborted, true);
  assert.deepEqual(result.failures, [{
    providerId: 'gemini',
    modelId: 'gemini-3.1-flash-lite',
    code: 'provider_timeout',
  }]);
});

test('model council response attribution validates both provider and selected model', () => {
  assert.equal(isValidModelCouncilResponse(
    { provider: 'openai', model: 'gpt-4o', text: 'valid response' },
    'openai',
    'gpt-4o',
  ), true);
  assert.equal(isValidModelCouncilResponse(
    { provider: 'gemini', model: 'gpt-4o', text: 'wrong provider' },
    'openai',
    'gpt-4o',
  ), false);
  assert.equal(isValidModelCouncilResponse(
    { provider: 'openai', model: 'gpt-4.1', text: 'wrong model' },
    'openai',
    'gpt-4o',
  ), false);
  assert.equal(isValidModelCouncilResponse(
    { provider: 'openai', model: 'gpt-4o', text: '  ' },
    'openai',
    'gpt-4o',
  ), false);
});

test('both council UIs submit exact configured model pairs and expose provider failures', async () => {
  const managementSource = await readFile(new URL('../../components/AiModelsCollaborationManagement.tsx', import.meta.url), 'utf8');
  const modalSource = await readFile(new URL('../../components/AllAiCollaborationModal.tsx', import.meta.url), 'utf8');
  assert.match(managementSource, /discoverConfiguredModelCouncilParticipants/);
  assert.match(managementSource, /submitAuthenticatedModelCouncilRequest/);
  assert.match(managementSource, /const agendaToRun = customAgenda\.trim\(\) \|\| selectedTopic;/);
  assert.match(managementSource, /setCouncilResult\(null\);\s*setStatusFeedback\(null\);/);
  assert.match(managementSource, /Provider-backed Nodes/);
  assert.match(managementSource, /Submit an agenda with \{activeProviderNodeCount\} enabled provider-backed nodes/);
  assert.match(managementSource, /failureSummary/);
  assert.match(managementSource, /Council execution failed\. No provider fallback or synthetic response was substituted/);
  assert.match(modalSource, /discoverConfiguredModelCouncilParticipants/);
  assert.match(modalSource, /submitAuthenticatedModelCouncilRequest/);
  assert.match(modalSource, /Provider execution failures/);
  assert.match(modalSource, /p\.provider === 'openai'/);
  assert.match(modalSource, /setCouncilResult\(result\)/);
  assert.match(modalSource, /Council execution failed\. No consensus result was produced/);
});

test('council UI clients delegate owner-token handling to the shared client', async () => {
  const managementSource = await readFile(new URL('../../components/AiModelsCollaborationManagement.tsx', import.meta.url), 'utf8');
  const modalSource = await readFile(new URL('../../components/AllAiCollaborationModal.tsx', import.meta.url), 'utf8');
  const clientSource = await readFile(new URL('./model-council-client.ts', import.meta.url), 'utf8');
  assert.match(managementSource, /getToken:\s*getIdToken/);
  assert.match(modalSource, /getToken:\s*getIdToken/);
  assert.match(clientSource, /Authorization:\s*\x60Bearer \$\{token\}\x60/);
});
test('production council execution fails closed without a confirmed single-instance boundary', async () => {
  const app = express();
  app.use(createModelCouncilRateLimit({
    windowMs: 60_000,
    limit: 2,
    production: true,
    singleInstanceConfirmed: false,
  }));
  app.post('/council', (_req, res) => res.status(200).json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/council`, { method: 'POST' });
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.match(body.error, /shared store|exactly one backend instance/i);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('legacy activeModels preserves exact model IDs and maps them to their provider', () => {
  const selected = resolveModelCouncilParticipants({
    activeModels: ['gpt-4o', 'claude-opus-5'],
    availableProviders: providerCatalog,
  });
  assert.deepEqual(selected, [
    { providerId: 'openai', modelId: 'gpt-4o' },
    { providerId: 'anthropic', modelId: 'claude-opus-5' },
  ]);
  assert.throws(() => resolveModelCouncilParticipants({
    activeModels: ['claude'],
    availableProviders: providerCatalog,
  }), /unknown model ID/i);
  assert.throws(() => resolveModelCouncilParticipants({
    activeModels: ['constructor'],
    availableProviders: providerCatalog,
  }), /unknown legacy model ID/i);
});
