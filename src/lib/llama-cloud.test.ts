import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import {
  getLlamaCloudStatus,
  listLlamaCloudIndexes,
  LlamaCloudIntegrationError,
  retrieveLlamaCloudContext,
} from './llama-cloud.ts';

const projectId = 'f7d2b46c-8e2b-4b9a-9b65-9a4d9c2f1e70';
const originalEnvironment = {
  key: process.env.LLAMA_CLOUD_API_KEY,
  project: process.env.LLAMA_CLOUD_PROJECT_ID,
  base: process.env.LLAMA_CLOUD_BASE_URL,
};

before(() => {
  process.env.LLAMA_CLOUD_PROJECT_ID = projectId;
  process.env.LLAMA_CLOUD_API_KEY = 'test-key';
  delete process.env.LLAMA_CLOUD_BASE_URL;
});

afterEach(() => {
  process.env.LLAMA_CLOUD_PROJECT_ID = projectId;
  process.env.LLAMA_CLOUD_API_KEY = 'test-key';
  delete process.env.LLAMA_CLOUD_BASE_URL;
});

after(() => {
  if (originalEnvironment.key === undefined) delete process.env.LLAMA_CLOUD_API_KEY;
  else process.env.LLAMA_CLOUD_API_KEY = originalEnvironment.key;
  if (originalEnvironment.project === undefined) delete process.env.LLAMA_CLOUD_PROJECT_ID;
  else process.env.LLAMA_CLOUD_PROJECT_ID = originalEnvironment.project;
  if (originalEnvironment.base === undefined) delete process.env.LLAMA_CLOUD_BASE_URL;
  else process.env.LLAMA_CLOUD_BASE_URL = originalEnvironment.base;
});

const mockFetch: typeof fetch = async (input, init) => {
  if (String(input).includes('/api/v1/indexes')) {
    return new Response(JSON.stringify({ items: [
      { id: 'index-a', name: 'GLORIFIER Knowledge', project_id: projectId },
      { id: 'foreign-index', name: 'Other project', project_id: '00000000-0000-0000-0000-000000000000' },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({ results: [{ content: 'Governed retrieval result', score: 0.91, static_fields: { page_range_start: 2 } }] }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
};

test('LlamaCloud remains unconfigured without an API key and performs no network request', async () => {
  delete process.env.LLAMA_CLOUD_API_KEY;
  let calls = 0;
  const noFetch = (async () => { calls += 1; throw new Error('unexpected network call'); }) as typeof fetch;
  const result = await getLlamaCloudStatus(noFetch);
  assert.equal(result.status, 'not-configured');
  assert.equal(result.connected, false);
  assert.equal(calls, 0);
});

test('LlamaCloud lists only project-owned indexes and retrieves context', async () => {
  const captured: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    captured.push({ url: String(input), init });
    return mockFetch(input, init);
  };
  const indexes = await listLlamaCloudIndexes(fetcher);
  assert.deepEqual(indexes.map((item) => item.id), ['index-a']);
  assert.equal((captured[0].init?.headers as Record<string, string>).authorization, 'Bearer test-key');
  assert.ok(captured[0].url.includes('project_id=' + projectId));
  const status = await getLlamaCloudStatus(fetcher);
  assert.equal(status.connected, true);
  assert.equal(status.indexCount, 1);
  const result = await retrieveLlamaCloudContext({ indexId: 'index-a', query: 'What is GLORIFIER?', topK: 3 }, fetcher);
  assert.equal(result.results[0].content, 'Governed retrieval result');
  assert.equal(result.results[0].page_range_start, 2);
  assert.equal(JSON.parse(String(captured.at(-1)?.init?.body)).top_k, 3);
  await assert.rejects(
    () => retrieveLlamaCloudContext({ indexId: 'foreign-index', query: 'test' }, fetcher),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'index_not_found',
  );
  await assert.rejects(
    () => retrieveLlamaCloudContext({ indexId: 'index-a', query: 'test', topK: 11 }, fetcher),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'invalid_top_k',
  );
});

test('LlamaCloud index pagination collects all project-owned pages', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = new URL(String(input));
    if (url.searchParams.get('page_token') === 'page-2') {
      return new Response(JSON.stringify({ items: [{ id: 'index-b', name: 'Second page', project_id: projectId }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      items: [{ id: 'index-a', name: 'First page', project_id: projectId }],
      next_page_token: 'page-2',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const indexes = await listLlamaCloudIndexes(fetcher);
  assert.deepEqual(indexes.map((item) => item.id), ['index-a', 'index-b']);
});

test('LlamaCloud rejects malformed index and retrieval responses', async () => {
  const malformedIndexes: typeof fetch = async () => new Response(JSON.stringify({}), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(() => listLlamaCloudIndexes(malformedIndexes),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'invalid_upstream_response');
  const malformedIndexEntry: typeof fetch = async () => new Response(JSON.stringify({ items: [{}] }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(() => listLlamaCloudIndexes(malformedIndexEntry),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'invalid_upstream_response');
  const malformedRetrieval: typeof fetch = async (input) => {
    if (String(input).includes('/api/v1/indexes')) {
      return new Response(JSON.stringify({ items: [{ id: 'index-a', project_id: projectId }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await assert.rejects(() => retrieveLlamaCloudContext({ indexId: 'index-a', query: 'test' }, malformedRetrieval),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'invalid_upstream_response');
  const missingProject: typeof fetch = async () => new Response(JSON.stringify({
    items: [{ id: 'unscoped-index', name: 'Unscoped index' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await assert.rejects(() => listLlamaCloudIndexes(missingProject),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'invalid_upstream_response');
});

test('LlamaCloud rejects invalid index identifiers, queries, and limits', async () => {
  const invalidInputs: Array<{ input: any; code: string }> = [
    { input: { indexId: 123, query: 'test' }, code: 'invalid_index_id' },
    { input: { indexId: ['index-a'], query: 'test' }, code: 'invalid_index_id' },
    { input: { indexId: {}, query: 'test' }, code: 'invalid_index_id' },
    { input: { indexId: 'index-a', query: 123 }, code: 'invalid_query' },
    { input: { indexId: 'index-a', query: ['test'] }, code: 'invalid_query' },
    { input: { indexId: 'index-a', query: {} }, code: 'invalid_query' },
  ];
  for (const item of invalidInputs) {
    await assert.rejects(
      () => retrieveLlamaCloudContext(item.input, mockFetch),
      (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === item.code,
    );
  }
});

test('LlamaCloud rejects unsafe base URLs and reports upstream authentication failures', async () => {
  for (const unsafeBase of [
    'https://user:password@api.cloud.llamaindex.ai',
    'https://api.cloud.llamaindex.ai/?token=secret',
    'https://api.cloud.llamaindex.ai/#fragment',
    'https://api.cloud.llamaindex.ai:8443',
  ]) {
    process.env.LLAMA_CLOUD_BASE_URL = unsafeBase;
    await assert.rejects(() => listLlamaCloudIndexes(mockFetch),
      (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'invalid_base_url');
  }
  delete process.env.LLAMA_CLOUD_BASE_URL;
  const unauthorized: typeof fetch = async () => new Response('unauthorized', { status: 401 });
  await assert.rejects(() => getLlamaCloudStatus(unauthorized),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'upstream_auth_failure');
});
