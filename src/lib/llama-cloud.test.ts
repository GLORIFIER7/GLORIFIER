import { strict as assert } from 'node:assert';
import { getLlamaCloudStatus, listLlamaCloudIndexes, LlamaCloudIntegrationError, retrieveLlamaCloudContext } from './llama-cloud.ts';
import { test } from 'node:test';

test('llama-cloud regression suite', async () => {
const oldKey = process.env.LLAMA_CLOUD_API_KEY;
const oldProject = process.env.LLAMA_CLOUD_PROJECT_ID;
const oldBase = process.env.LLAMA_CLOUD_BASE_URL;
try {
  process.env.LLAMA_CLOUD_PROJECT_ID = 'f7d2b46c-8e2b-4b9a-9b65-9a4d9c2f1e70';
  delete process.env.LLAMA_CLOUD_BASE_URL;
  delete process.env.LLAMA_CLOUD_API_KEY;
  let calls = 0;
  const noFetch = (async () => { calls++; throw new Error('unexpected network call'); }) as typeof fetch;
  const missing = await getLlamaCloudStatus(noFetch);
  assert.equal(missing.status, 'not-configured');
  assert.equal(missing.connected, false);
  assert.equal(calls, 0);

  process.env.LLAMA_CLOUD_API_KEY = 'test-key';
  delete process.env.LLAMA_CLOUD_BASE_URL;
  const captured: Array<{ url: string; init?: RequestInit }> = [];
  const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({ url: String(input), init });
    if (String(input).includes('/api/v1/indexes')) return new Response(JSON.stringify({ items: [
      { id: 'index-a', name: 'GLORIFIER Knowledge', project_id: 'f7d2b46c-8e2b-4b9a-9b65-9a4d9c2f1e70' },
      { id: 'foreign-index', name: 'Other project', project_id: '00000000-0000-0000-0000-000000000000' },
    ] }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ results: [{ content: 'Governed retrieval result', score: 0.91, static_fields: { page_range_start: 2 } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const indexes = await listLlamaCloudIndexes(mockFetch);
  assert.equal(indexes.length, 1);
  assert.equal(indexes[0].id, 'index-a');
  assert.equal((captured[0].init?.headers as Record<string, string>).authorization, 'Bearer test-key');
  assert.ok(captured[0].url.includes('project_id=f7d2b46c-8e2b-4b9a-9b65-9a4d9c2f1e70'));
  const status = await getLlamaCloudStatus(mockFetch);
  assert.equal(status.connected, true);
  assert.equal(status.indexCount, 1);

  const retrieved = await retrieveLlamaCloudContext({ indexId: 'index-a', query: 'What is GLORIFIER?', topK: 3 }, mockFetch);
  assert.equal(retrieved.results[0].content, 'Governed retrieval result');
  assert.equal(retrieved.results[0].page_range_start, 2);
  assert.equal(JSON.parse(String(captured.at(-1)?.init?.body)).top_k, 3);

  await assert.rejects(() => retrieveLlamaCloudContext({ indexId: 'foreign-index', query: 'test' }, mockFetch),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'index_not_found');
  await assert.rejects(() => retrieveLlamaCloudContext({ indexId: 'index-a', query: 'test', topK: 11 }, mockFetch),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'invalid_top_k');

  const paginatedFetch = (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.searchParams.get('page_token') === 'page-2') {
      return new Response(JSON.stringify({ items: [
        { id: 'index-b', name: 'Second page', project_id: 'f7d2b46c-8e2b-4b9a-9b65-9a4d9c2f1e70' },
      ] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      items: [{ id: 'index-a', name: 'First page', project_id: 'f7d2b46c-8e2b-4b9a-9b65-9a4d9c2f1e70' }],
      next_page_token: 'page-2',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const paginatedIndexes = await listLlamaCloudIndexes(paginatedFetch);
  assert.deepEqual(paginatedIndexes.map((item) => item.id), ['index-a', 'index-b']);

  const malformedIndexesFetch = (async () => new Response(JSON.stringify({}), {
    status: 200, headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
  await assert.rejects(() => listLlamaCloudIndexes(malformedIndexesFetch),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'invalid_upstream_response');

  const malformedRetrievalFetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('/api/v1/indexes')) {
      return new Response(JSON.stringify({ items: [{ id: 'index-a', project_id: 'f7d2b46c-8e2b-4b9a-9b65-9a4d9c2f1e70' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  await assert.rejects(() => retrieveLlamaCloudContext({ indexId: 'index-a', query: 'test' }, malformedRetrievalFetch),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'invalid_upstream_response');

  const invalidInputs: Array<{ input: any; code: string }> = [
    { input: { indexId: 123, query: 'test' }, code: 'invalid_index_id' },
    { input: { indexId: ['index-a'], query: 'test' }, code: 'invalid_index_id' },
    { input: { indexId: {}, query: 'test' }, code: 'invalid_index_id' },
    { input: { indexId: 'index-a', query: 123 }, code: 'invalid_query' },
    { input: { indexId: 'index-a', query: ['test'] }, code: 'invalid_query' },
    { input: { indexId: 'index-a', query: {} }, code: 'invalid_query' },
  ];
  for (const { input, code } of invalidInputs) {
    await assert.rejects(
      () => retrieveLlamaCloudContext(input, mockFetch),
      (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === code,
    );
  }

  const unscopedIndexFetch = (async () => new Response(JSON.stringify({
    items: [{ id: 'unscoped-index', name: 'Unscoped index' }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
  await assert.rejects(() => listLlamaCloudIndexes(unscopedIndexFetch),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'invalid_upstream_response');

  const malformedIndexEntryFetch = (async () => new Response(JSON.stringify({ items: [{}] }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })) as typeof fetch;
  await assert.rejects(() => listLlamaCloudIndexes(malformedIndexEntryFetch),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'invalid_upstream_response');

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

  const malformedContentFetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('/api/v1/indexes')) {
      return new Response(JSON.stringify({ items: [{ id: 'index-a', project_id: 'f7d2b46c-8e2b-4b9a-9b65-9a4d9c2f1e70' }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ results: [{ score: 0.91 }] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  await assert.rejects(() => retrieveLlamaCloudContext({ indexId: 'index-a', query: 'test' }, malformedContentFetch),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'invalid_upstream_response');

  const unauthorizedFetch = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch;
  await assert.rejects(() => getLlamaCloudStatus(unauthorizedFetch),
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === 'upstream_auth_failure');
  console.log('LlamaCloud integration tests: PASS');
} finally {
  if (oldKey === undefined) delete process.env.LLAMA_CLOUD_API_KEY; else process.env.LLAMA_CLOUD_API_KEY = oldKey;
  if (oldProject === undefined) delete process.env.LLAMA_CLOUD_PROJECT_ID; else process.env.LLAMA_CLOUD_PROJECT_ID = oldProject;
  if (oldBase === undefined) delete process.env.LLAMA_CLOUD_BASE_URL; else process.env.LLAMA_CLOUD_BASE_URL = oldBase;
}
});
