import assert from 'node:assert/strict';
import test from 'node:test';
import { collectAnthropicRepositories, normalizeAnthropicRepository } from './anthropic-upstream-inventory.mjs';

const repo = (name, extra = {}) => ({
  full_name: 'anthropics/' + name,
  html_url: 'https://github.com/anthropics/' + name,
  description: name + ' description',
  license: { spdx_id: 'MIT' },
  default_branch: 'main',
  archived: false,
  fork: false,
  ...extra,
});
const response = (items, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => items,
});

test('missing license metadata never counts as license verification', () => {
  assert.deepEqual(normalizeAnthropicRepository(repo('skills', { license: null, archived: true })), {
    repository: 'anthropics/skills',
    url: 'https://github.com/anthropics/skills',
    description: 'skills description',
    default_branch: 'main',
    archived: true,
    fork: false,
    license_spdx: 'NOT_VERIFIED',
  });
});

test('collects every page, deduplicates and sorts results', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return response(url.includes('&page=1') ? [repo('zeta'), repo('alpha')] :
      url.includes('&page=2') ? [repo('alpha'), repo('beta')] : []);
  };
  const result = await collectAnthropicRepositories({
    fetchImpl, perPage: 2, maxPages: 3, now: () => '2026-11-21T00:00:00.000Z',
  });
  assert.deepEqual(result.repositories.map((r) => r.repository), [
    'anthropics/alpha', 'anthropics/beta', 'anthropics/zeta',
  ]);
  assert.equal(result.count, 3);
  assert.equal(urls.length, 3);
  assert.equal(result.observed_at, '2026-11-21T00:00:00.000Z');
});

test('rejects unexpected repository owners and URLs', () => {
  assert.throws(() => normalizeAnthropicRepository(repo('x', { full_name: 'unknown/x' })), /unexpected owner/);
  assert.throws(() => normalizeAnthropicRepository(repo('x', { html_url: 'https://example.org/x' })), /unexpected owner/);
});

test('fails closed when page limit or API error prevents a complete inventory', async () => {
  await assert.rejects(collectAnthropicRepositories({
    fetchImpl: async () => response([repo('only')]), perPage: 1, maxPages: 1,
  }), /page limit/);
  await assert.rejects(collectAnthropicRepositories({
    fetchImpl: async () => response({ message: 'rate limit' }, 403),
  }), /GitHub API HTTP 403/);
});

test('does not send an authorization header without a supplied token', async () => {
  let headers;
  await collectAnthropicRepositories({
    fetchImpl: async (_url, opts) => { headers = opts.headers; return response([]); },
    token: '',
  });
  assert.equal(Object.hasOwn(headers, 'Authorization'), false);
});
