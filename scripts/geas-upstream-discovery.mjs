#!/usr/bin/env node
/**
 * GEAS read-only upstream discovery.
 * No repository clone, package install, source copy, execution, credential write,
 * production deployment, license clearance, or permission to spend is performed.
 *
 * Usage:
 *   node scripts/geas-upstream-discovery.mjs --list   (offline)
 *   node scripts/geas-upstream-discovery.mjs --org openai
 *   node scripts/geas-upstream-discovery.mjs --all   (many GitHub API requests)
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const registry = JSON.parse(await readFile(
  new URL('../docs/architecture/geas-upstream-ecosystem-sources.json', import.meta.url),
  'utf8',
));
const safeSlug = /^[A-Za-z0-9_.-]+$/;
const API_ORIGIN = 'https://api.github.com';
export const SOURCE_ORGANIZATIONS = Object.freeze(registry.source_organizations);
export const REVIEW_CANDIDATES = Object.freeze(registry.candidates);

export function findRegisteredOwner(owner, organizations = SOURCE_ORGANIZATIONS) {
  if (typeof owner !== 'string' || !safeSlug.test(owner)) return null;
  return organizations.find((source) => source.owner.toLowerCase() === owner.toLowerCase()) || null;
}

export function normalizeGitHubRepository(record, owner) {
  const fullName = record?.full_name;
  if (!findRegisteredOwner(owner) || typeof fullName !== 'string' ||
      !fullName.includes('/') || fullName.split('/').length !== 2) {
    throw new Error('Unregistered repository owner or invalid repository name');
  }
  const [actualOwner, name] = fullName.split('/');
  const expectedURL = 'https://github.com/' + actualOwner + '/' + name;
  if (actualOwner.toLowerCase() !== owner.toLowerCase() || !safeSlug.test(name) ||
      typeof record.html_url !== 'string' || record.html_url.toLowerCase() !== expectedURL.toLowerCase()) {
    throw new Error('GitHub repository owner or URL mismatch');
  }
  const spdx = record.license?.spdx_id;
  return {
    repository: fullName,
    url: record.html_url,
    description: typeof record.description === 'string' ? record.description : '',
    archived: record.archived === true,
    fork: record.fork === true,
    default_branch: typeof record.default_branch === 'string' ? record.default_branch : '',
    reported_spdx: typeof spdx === 'string' && spdx !== 'NOASSERTION' ? spdx : 'NOT_VERIFIED',
    license_review: 'NOT_VERIFIED', // GitHub metadata is not legal review.
    source_copied: false,
  };
}

/** Metadata discovery is not an approval function. Always fail closed. */
export function evaluateAdoptionGate(_candidate) {
  return {
    approved: false,
    status: 'REVIEW_REQUIRED',
    reasons: [
      'Upstream provenance, commit and file-specific license review required',
      'Dependency and supply-chain security review required',
      'GEAS authorization, tests, cost controls and human approval required',
    ],
  };
}

export async function discoverOrganization(owner, {
  fetchImpl = globalThis.fetch,
  token = '',
  perPage = 100,
  maxPages = 100,
} = {}) {
  const selected = findRegisteredOwner(owner);
  if (!selected) throw new Error('Unknown or unapproved upstream GitHub owner');
  if (!Number.isSafeInteger(perPage) || perPage < 1 || perPage > 100 ||
      !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 100) {
    throw new Error('Invalid pagination bounds');
  }
  const repositories = new Map();
  let complete = false;
  for (let page = 1; page <= maxPages; page++) {
    const url = API_ORIGIN + '/orgs/' + encodeURIComponent(selected.owner) +
      '/repos?type=public&per_page=' + perPage + '&page=' + page;
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (typeof token === 'string' && token !== '') headers.Authorization = 'Bearer ' + token;
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('GitHub API HTTP ' + response.status + '; inventory incomplete');
    const records = await response.json();
    if (!Array.isArray(records)) throw new Error('Invalid GitHub repository response');
    for (const raw of records) {
      const item = normalizeGitHubRepository(raw, selected.owner);
      repositories.set(item.repository.toLowerCase(), item);
    }
    if (records.length < perPage) { complete = true; break; }
  }
  if (!complete) throw new Error('Inventory incomplete: maximum page count reached for ' + selected.owner);
  const sorted = [...repositories.values()].sort((a, b) => a.repository.localeCompare(b.repository));
  return {
    organization: selected.owner,
    ecosystem: selected.ecosystem,
    complete: true,
    repository_count: sorted.length,
    repositories: sorted,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--list') {
    process.stdout.write(JSON.stringify({
      schema: registry.schema,
      observed_on: registry.observed_on,
      organizations: SOURCE_ORGANIZATIONS,
      candidates: REVIEW_CANDIDATES,
      adoption_approved: false,
    }, null, 2) + '\n');
    return;
  }
  if ((args.length !== 1 || args[0] !== '--all') &&
      (args.length !== 2 || args[0] !== '--org')) {
    throw new Error('Use --list, --org <registered-owner>, or --all (read-only GitHub discovery)');
  }
  const selected = args[0] === '--all'
    ? SOURCE_ORGANIZATIONS
    : [findRegisteredOwner(args[1])].filter(Boolean);
  if (!selected.length) throw new Error('Owner not in GEAS approved read-only source registry');
  const organizations = [];
  for (const source of selected) {
    organizations.push(await discoverOrganization(source.owner, {
      token: process.env.GITHUB_TOKEN || '',
    }));
  }
  const result = {
    schema: 'glorifier.geas.upstream-inventory.v1',
    observed_at: new Date().toISOString(),
    complete: true,
    public_github_organizations_covered: organizations.length,
    repository_count: organizations.reduce((sum, entry) => sum + entry.repository_count, 0),
    source_copied: false,
    licenses_approved: false,
    production_connected: false,
    caution: 'Read-only catalog of a bounded organization allowlist, not all repositories on the internet.',
    organizations,
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Deliberately suppress external response bodies and secrets.
    process.stderr.write('GEAS upstream discovery failed: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
