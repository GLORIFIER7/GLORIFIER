import { strict as assert } from 'node:assert';
import { getLlamaCloudStatus, listLlamaCloudIndexes, LlamaCloudIntegrationError, retrieveLlamaCloudContext } from './llama-cloud.ts';
import { test } from 'node:test';

const PROJECT_ID = 'f7d2b46c-8e2b-4b9a-9b65-9a4d9c2f1e70';

const withLlamaCloudEnvironment = async (
  hasApiKey: boolean,
  run: () => Promise<void>,
): Promise<void> => {
  const oldKey = process.env.LLAMA_CLOUD_API_KEY;
  const oldProject = process.env.LLAMA_CLOUD_PROJECT_ID;
  const oldBase = process.env.LLAMA_CLOUD_BASE_URL;

  process.env.LLAMA_CLOUD_PROJECT_ID = PROJECT_ID;
  if (hasApiKey) process.env.LLAMA_CLOUD_API_KEY = 'test-key';
  else delete process.env.LLAMA_CLOUD_API_KEY;
  delete process.env.LLAMA_CLOUD_BASE_URL;

  try {
    await run();
  } finally {
    if (oldKey === undefined) delete process.env.LLAMA_CLOUD_API_KEY;
    else process.env.LLAMA_CLOUD_API_KEY = oldKey;
    if (oldProject === undefined) delete process.env.LLAMA_CLOUD_PROJECT_ID;
    else process.env.LLAMA_CLOUD_PROJECT_ID = oldProject;
    if (oldBase === undefined) delete process.env.LLAMA_CLOUD_BASE_URL;
    else process.env.LLAMA_CLOUD_BASE_URL = oldBase;
  }
};

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const assertLlamaCloudError = async (
  run: () => Promise<unknown>,
  code: string,
): Promise<void> => {
  await assert.rejects(
    run,
    (error: unknown) => error instanceof LlamaCloudIntegrationError && error.code === code,
  );
};

void test('LlamaCloud remains explicitly not configured without an API key', async () => {
  await withLlamaCloudEnvironment(false, async () => {
    let calls = 0;
    const noFetch = (async () => {
      calls++;
      throw new Error('unexpected network call');
    }) as typeof fetch;
    const missing = await getLlamaCloudStatus(noFetch);
    assert.equal(missing.status, 'not-configured');
    assert.equal(missing.connected, false);
    assert.equal(calls, 0);
  });
});

void test('LlamaCloud lists only project indexes and retrieves scoped context', async () => {
  await withLlamaCloudEnvironment(true, async () => {
    const captured: Array<{ url: string; init?: RequestInit }> = [];
    const mockFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      captured.push({ url, init });
      if (url.includes('/api/v1/indexes')) {
        return jsonResponse({ items: [
          { id: 'index-a', name: 'GLORIFIER Knowledge', project_id: PROJECT_ID },
          { id: 'foreign-index', name: 'Other project', project_id: '00000000-0000-0000-0000-000000000000' },
        ] });
      }
      return jsonResponse({
        results: [{ content: 'Governed retrieval result', score: 0.91, static_fields: { page_range_start: 2 } }],
      });
    }) as typeof fetch;

    const indexes = await listLlamaCloudIndexes(mockFetch);
    assert.equal(indexes.length, 1);
    assert.equal(indexes[0].id, 'index-a');
    assert.equal((captured[0].init?.headers as Record<string, string>).authorization, 'Bearer test-key');
    assert.ok(captured[0].url.includes('project_id=' + PROJECT_ID));

    const status = await getLlamaCloudStatus(mockFetch);
    assert.equal(status.connected, true);
    assert.equal(status.indexCount, 1);

    const retrieved = await retrieveLlamaCloudContext(
      { indexId: 'index-a', query: 'What is GLORIFIER?', topK: 3 },
      mockFetch,
    );
    assert.equal(retrieved.results[0].content, 'Governed retrieval result');
    assert.equal(retrieved.results[0].page_range_start, 2);
    assert.equal(JSON.parse(String(captured.at(-1)?.init?.body)).top_k, 3);

    await assertLlamaCloudError(
      () => retrieveLlamaCloudContext({ indexId: 'foreign-index', query: 'test' }, mockFetch),
      'index_not_found',
    );
    await assertLlamaCloudError(
      () => retrieveLlamaCloudContext({ indexId: 'index-a', query: 'test', topK: 11 }, mockFetch),
      'invalid_top_k',
    );
  });
});

void test('LlamaCloud follows pagination and rejects malformed index responses', async () => {
  await withLlamaCloudEnvironment('test-key', async () => {
    const paginatedFetch = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get('page_token') === 'page-2') {
        return jsonResponse({ items: [
          { id: 'index-b', name: 'Second page', project_id: PROJECT_ID },
        ] });
      }
      return jsonResponse({
        items: [{ id: 'index-a', name: 'First page', project_id: PROJECT_ID }],
        next_page_token: 'page-2',
      });
    }) as typeof fetch;
    const paginatedIndexes = await listLlamaCloudIndexes(paginatedFetch);
    assert.deepEqual(paginatedIndexes.map((item) => item.id), ['index-a', 'index-b']);

    const malformedIndexesFetch = (async () => jsonResponse({})) as typeof fetch;
    await assertLlamaCloudError(() => listLlamaCloudIndexes(malformedIndexesFetch), 'invalid_upstream_response');

    const unscopedIndexFetch = (async () => jsonResponse({
      items: [{ id: 'unscoped-index', name: 'Unscoped index' }],
    })) as typeof fetch;
    await assertLlamaCloudError(() => listLlamaCloudIndexes(unscopedIndexFetch), 'invalid_upstream_response');

    const malformedIndexEntryFetch = (async () => jsonResponse({ items: [{}] })) as typeof fetch;
    await assertLlamaCloudError(() => listLlamaCloudIndexes(malformedIndexEntryFetch), 'invalid_upstream_response');
  });
});

void test('LlamaCloud rejects invalid retrieval inputs and malformed content', async () => {
  await withLlamaCloudEnvironment('test-key', async () => {
    const mockFetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/v1/indexes')) {
        return jsonResponse({ items: [{ id: 'index-a', project_id: PROJECT_ID }] });
      }
      return jsonResponse({ results: [{ content: 'valid response', score: 0.91 }] });
    }) as typeof fetch;

    const invalidInputs: Array<{ input: any; code: string }> = [
      { input: { indexId: 123, query: 'test' }, code: 'invalid_index_id' },
      { input: { indexId: ['index-a'], query: 'test' }, code: 'invalid_index_id' },
      { input: { indexId: {}, query: 'test' }, code: 'invalid_index_id' },
      { input: { indexId: 'index-a', query: 123 }, code: 'invalid_query' },
      { input: { indexId: 'index-a', query: ['test'] }, code: 'invalid_query' },
      { input: { indexId: 'index-a', query: {} }, code: 'invalid_query' },
    ];
    for (const { input, code } of invalidInputs) {
      await assertLlamaCloudError(() => retrieveLlamaCloudContext(input, mockFetch), code);
    }

    const malformedRetrievalFetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/v1/indexes')) {
        return jsonResponse({ items: [{ id: 'index-a', project_id: PROJECT_ID }] });
      }
      return jsonResponse({});
    }) as typeof fetch;
    await assertLlamaCloudError(
      () => retrieveLlamaCloudContext({ indexId: 'index-a', query: 'test' }, malformedRetrievalFetch),
      'invalid_upstream_response',
    );

    const malformedContentFetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/v1/indexes')) {
        return jsonResponse({ items: [{ id: 'index-a', project_id: PROJECT_ID }] });
      }
      return jsonResponse({ results: [{ score: 0.91 }] });
    }) as typeof fetch;
    await assertLlamaCloudError(
      () => retrieveLlamaCloudContext({ indexId: 'index-a', query: 'test' }, malformedContentFetch),
      'invalid_upstream_response',
    );
  });
});

void test('LlamaCloud rejects unsafe configured base URLs', async () => {
  await withLlamaCloudEnvironment('test-key', async () => {
    const mockFetch = (async () => jsonResponse({ items: [] })) as typeof fetch;
    for (const unsafeBase of [
      'https://user:password@api.cloud.llamaindex.ai',
      'https://api.cloud.llamaindex.ai/?token=secret',
      'https://api.cloud.llamaindex.ai/#fragment',
      'https://api.cloud.llamaindex.ai:8443',
    ]) {
      process.env.LLAMA_CLOUD_BASE_URL = unsafeBase;
      await assertLlamaCloudError(() => listLlamaCloudIndexes(mockFetch), 'invalid_base_url');
    }
  });
});

void test('LlamaCloud surfaces upstream authentication failures', async () => {
  await withLlamaCloudEnvironment('test-key', async () => {
    const unauthorizedFetch = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch;
    await assertLlamaCloudError(() => getLlamaCloudStatus(unauthorizedFetch), 'upstream_auth_failure');
    console.log('LlamaCloud integration tests: PASS');
  });
});
