import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  discoverOrganization,
  findRegisteredOwner,
  normalizeGitHubRepository,
  evaluateAdoptionGate,
} from './geas-upstream-discovery.mjs';

const config = JSON.parse(await readFile(new URL('../docs/architecture/geas-upstream-ecosystem-sources.json', import.meta.url), 'utf8'));
const entry = (name, override = {}) => ({
  full_name: 'openai/' + name,
  html_url: 'https://github.com/openai/' + name,
  description: 'A public repository',
  archived: false,
  fork: false,
  default_branch: 'main',
  license: { spdx_id: 'MIT' },
  ...override,
});
const response = (items, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => items,
});

test('registry is curated, uniquely keyed, and cannot approve external execution', () => {
  assert.ok(config.source_organizations.length >= 15);
  assert.ok(config.candidates.length >= 30);
  const owners = new Set(config.source_organizations.map((x) => x.owner.toLowerCase()));
  assert.equal(owners.size, config.source_organizations.length);
  for (const candidate of config.candidates) {
    assert.ok(owners.has(candidate.repository.split('/')[0].toLowerCase()));
    assert.equal(candidate.adoption_status, 'REVIEW_ONLY');
    assert.equal(candidate.source_code_imported, false);
    assert.equal(candidate.license_cleared, false);
    assert.equal(candidate.runtime_verified, false);
  }
  assert.equal(config.adoption_rules.deny_automatic_import, true);
  assert.equal(config.adoption_rules.deny_unapproved_spending, true);
});

test('case-insensitive selection stays inside the allowlisted organizations', () => {
  assert.equal(findRegisteredOwner('OPENAI', config.source_organizations).owner, 'openai');
  assert.equal(findRegisteredOwner('unknown-org', config.source_organizations), null);
  assert.equal(findRegisteredOwner('../openai', config.source_organizations), null);
});

test('normalizes metadata with an unverified license and no source import', () => {
  assert.deepEqual(normalizeGitHubRepository(entry('codex', {license: {spdx_id: 'Apache-2.0'}}), 'openai'), {
    repository: 'openai/codex',
    url: 'https://github.com/openai/codex',
    description: 'A public repository',
    archived: false,
    fork: false,
    default_branch: 'main',
    reported_spdx: 'Apache-2.0',
    license_review: 'NOT_VERIFIED',
    source_copied: false,
  });
});

test('rejects cross-organization and unsafe GitHub URL records', () => {
  assert.throws(() => normalizeGitHubRepository(entry('x', {full_name: 'evil/x'}), 'openai'), /owner|URL/);
  assert.throws(() => normalizeGitHubRepository(entry('x', {html_url: 'https://evil.example/x'}), 'openai'), /owner|URL/);
  assert.throws(() => normalizeGitHubRepository(entry('x', {html_url: 'https://github.com/openai/x/y'}), 'openai'), /owner|URL/);
});

test('discovers every page, deduplicates, and preserves archive metadata', async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return response(new URL(url).searchParams.get('page') === '1' ? [entry('z'), entry('a')] :
      new URL(url).searchParams.get('page') === '2' ? [entry('a'), entry('b', {archived: true})] : []);
  };
  const inventory = await discoverOrganization('openai', {fetchImpl, perPage: 2, maxPages: 3, token: ''});
  assert.equal(inventory.complete, true);
  assert.equal(inventory.repository_count, 3);
  assert.deepEqual(inventory.repositories.map((x) => x.repository), ['openai/a', 'openai/b', 'openai/z']);
  assert.equal(inventory.repositories[1].archived, true);
  assert.equal(urls.length, 3);
  assert.ok(urls.every((url) => url.startsWith('https://api.github.com/orgs/openai/repos?')));
});

test('fails closed for HTTP errors, bad payloads, or page limit', async () => {
  await assert.rejects(discoverOrganization('openai', {fetchImpl: async () => response({}, 403)}), /HTTP 403/);
  await assert.rejects(discoverOrganization('openai', {fetchImpl: async () => response({repositories: []})}), /Invalid GitHub/);
  await assert.rejects(discoverOrganization('openai', {fetchImpl: async () => response([entry('a')]), perPage: 1, maxPages: 1}), /incomplete/);
});

test('no authorization header is sent without an explicit token', async () => {
  let headers;
  await discoverOrganization('openai', {
    token: '',
    fetchImpl: async (_url, options) => {headers = options.headers; return response([]);},
  });
  assert.equal(Object.hasOwn(headers, 'Authorization'), false);
  assert.equal(evaluateAdoptionGate({license_review: 'NOT_VERIFIED'}).approved, false);
  assert.equal(evaluateAdoptionGate({license_review: 'VERIFIED'}).approved, false);
});
