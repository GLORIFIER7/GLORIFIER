import assert from 'node:assert/strict';
import test from 'node:test';
import { githubMcpRoute } from '../src/lib/github-mcp.ts';

// Offline contract tests for the real MCP route. Unlike a live anonymous
// api.github.com call, these do not depend on shared GitHub API rate limits.
const createToolRequest = (name = 'github_get_repository', args) => new Request('http://127.0.0.1:8787/mcp', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    accept: 'application/json',
    origin: 'http://127.0.0.1:8787',
    'MCP-Protocol-Version': '2026-07-28',
    'Mcp-Method': 'tools/call',
    'Mcp-Name': name,
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 'ci-read-only-repository',
    method: 'tools/call',
    params: {
      name,
      arguments: args,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  }),
});

const rateLimiter = { async limit() { return { success: true }; } };

const withMockGithubFetch = async (upstreamStatus, callback) => {
  const originalFetch = globalThis.fetch;
  let upstreamRequests = 0;
  globalThis.fetch = async (input, init) => {
    upstreamRequests += 1;
    const url = input instanceof Request ? input.url : String(input);
    assert.equal(url, 'https://api.github.com/repos/GLORIFIER7/GLORIFIER');
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'manual');
    assert.equal(new Headers(init?.headers).has('authorization'), false,
      'CI must never forward a credential to code from a pull request');

    if (upstreamStatus === 403) {
      return Response.json({ message: 'API rate limit exceeded' }, { status: 403 });
    }
    return Response.json({ full_name: 'GLORIFIER7/GLORIFIER', private: false }, { status: 200 });
  };
  try {
    await callback();
    assert.equal(upstreamRequests, 1, 'MCP must perform exactly one read-only upstream request');
  } finally {
    globalThis.fetch = originalFetch;
  }
};

test('modern MCP tools/call returns a canonical repository from the pinned read-only GitHub endpoint', async () => {
  await withMockGithubFetch(200, async () => {
    const response = await githubMcpRoute(createToolRequest(), rateLimiter);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.jsonrpc, '2.0');
    assert.equal(payload.id, 'ci-read-only-repository');
    assert.equal(payload.error, undefined);
    assert.notEqual(payload.result?.isError, true);
    const text = payload.result?.content?.find((part) => part.type === 'text')?.text;
    assert.equal(typeof text, 'string');
    const repository = JSON.parse(text);
    assert.equal(repository.full_name, 'GLORIFIER7/GLORIFIER');
    assert.equal(repository.private, false);
  });
});

test('GitHub HTTP 403 is explicitly reported as an MCP tool error, not a successful repository read', async () => {
  await withMockGithubFetch(403, async () => {
    const response = await githubMcpRoute(createToolRequest(), rateLimiter);
    assert.equal(response.status, 200, 'tools/call errors are represented within the JSON-RPC result');
    const payload = await response.json();
    assert.equal(payload.id, 'ci-read-only-repository');
    assert.equal(payload.result?.isError, true);
    const text = payload.result?.content?.find((part) => part.type === 'text')?.text;
    assert.match(text, /^GitHub API request failed with HTTP 403\.$/);
    assert.doesNotMatch(text, /API rate limit exceeded/,
      'Do not expose upstream response bodies as evidence or tool errors');
  });
});

test('arguments outside the advertised tool schemas are rejected before upstream quota', async (t) => {
  const limit = t.mock.fn(async () => ({ success: false }));
  const fetch = t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Unexpected upstream request');
  });
  for (const [name, args] of [
    ['github_get_repository', null],
    ['github_get_repository', []],
    ['github_list_workflow_runs', 'ten'],
    ['github_get_repository', { extra: true }],
    ['github_list_open_pull_requests', { state: 'open', unknown: 1 }],
    ['github_list_workflow_runs', { per_page: 1, other: true }],
    ['github_read_file', { path: 'README.md', other: true }],
  ]) {
    const response = await githubMcpRoute(createToolRequest(name, args), { limit });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.id, 'ci-read-only-repository');
    assert.equal(payload.result?.isError, true);
  }
  assert.equal(limit.mock.callCount(), 0);
  assert.equal(fetch.mock.callCount(), 0);
});
