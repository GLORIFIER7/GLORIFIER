#!/usr/bin/env node
/**
 * Read-only discovery of public Anthropic GitHub repositories.
 * No upstream source code is downloaded, installed, executed or approved.
 * GitHub license metadata is a hint, not a substitute for license review.
 */
import { pathToFileURL } from 'node:url';

const REPOSITORY_API = 'https://api.github.com/orgs/anthropics/repos';
const REPOSITORY_URL = /^https:\/\/github\.com\/anthropics\/[A-Za-z0-9_.-]+$/;

export function normalizeAnthropicRepository(record) {
  if (!record || typeof record !== 'object' ||
      typeof record.full_name !== 'string' ||
      !/^anthropics\/[A-Za-z0-9_.-]+$/.test(record.full_name) ||
      !REPOSITORY_URL.test(record.html_url)) {
    throw new Error('GitHub returned a repository with an unexpected owner or URL');
  }
  return {
    repository: record.full_name,
    url: record.html_url,
    description: typeof record.description === 'string' ? record.description : '',
    default_branch: typeof record.default_branch === 'string' ? record.default_branch : '',
    archived: record.archived === true,
    fork: record.fork === true,
    license_spdx: typeof record.license?.spdx_id === 'string' &&
      record.license.spdx_id !== 'NOASSERTION' ? record.license.spdx_id : 'NOT_VERIFIED',
  };
}

export async function collectAnthropicRepositories({
  fetchImpl = globalThis.fetch,
  token = process.env.GITHUB_TOKEN || '',
  perPage = 100,
  maxPages = 20,
  now = () => new Date().toISOString(),
} = {}) {
  if (!Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) {
    throw new Error('Invalid pagination limits');
  }
  const repositories = new Map();
  let complete = false;
  for (let page = 1; page <= maxPages; page++) {
    const url = REPOSITORY_API + '?type=public&per_page=' + perPage + '&page=' + page;
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('GitHub API HTTP ' + response.status + '; inventory incomplete');
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error('Invalid GitHub repository response');
    for (const record of records) {
      const normalized = normalizeAnthropicRepository(record);
      repositories.set(normalized.repository, normalized);
    }
    if (records.length < perPage) { complete = true; break; }
  }
  if (!complete) throw new Error('GitHub repository page limit reached; inventory incomplete');
  const list = [...repositories.values()].sort((a, b) => a.repository.localeCompare(b.repository, 'en'));
  return {
    source: 'https://github.com/anthropics',
    observed_at: now(),
    count: list.length,
    repositories: list,
    notice: 'Metadata only. No repository source was copied; license and execution approval remain separate reviews.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const inventory = await collectAnthropicRepositories();
    process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
  } catch (error) {
    process.stderr.write('Anthropic public repository inventory failed: ' + error.message + '\n');
    process.exitCode = 1;
  }
}
