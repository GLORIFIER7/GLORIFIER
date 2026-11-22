import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const allowedTargets = Object.freeze({
  'cloudflare-pages': ['cloudflare', 'public-health', 'https://glorifier.pages.dev/api/health'],
  'github-pages': ['github', 'public-static', 'https://glorifier7.github.io/GLORIFIER/'],
  'github-profile': ['github', 'independent-repository', null],
  'github-neural': ['github', 'independent-repository', null],
  vercel: ['vercel', 'not-connected', null],
  railway: ['railway', 'no-code-deploy', null],
  neon: ['neon', 'data-authority', null],
  supabase: ['supabase', 'data-authority', null],
  'wordpress-public': ['wordpress', 'profile-only', null],
  'wordpress-private': ['wordpress', 'profile-only', null],
});

export function validateManifest(manifest) {
  const issues = [];
  if (manifest?.version !== 1 ||
      manifest?.canonicalRepository !== 'GLORIFIER7/GLORIFIER' ||
      manifest?.canonicalBranch !== 'main') issues.push('Invalid canonical source');
  if (!Array.isArray(manifest?.targets)) return { ok: false, issues: [...issues, 'No inventory'] };
  const seen = new Set();
  for (const target of manifest.targets) {
    const expected = allowedTargets[target?.id];
    if (!expected || seen.has(target.id)) {
      issues.push('Unknown or duplicate target');
      continue;
    }
    seen.add(target.id);
    if (target.platform !== expected[0] || target.mode !== expected[1] ||
        (target.url ?? null) !== expected[2] || target.writeEnabled !== false) {
      issues.push('Unauthorized target settings: ' + target.id);
    }
  }
  for (const id of Object.keys(allowedTargets)) {
    if (!seen.has(id)) issues.push('Missing target: ' + id);
  }
  return { ok: issues.length === 0, issues };
}

export function evaluateProbe(target, response, sourceSha) {
  const base = {
    id: target.id, platform: target.platform, mode: target.mode,
    sourceCommit: sourceSha, releaseParity: 'NOT VERIFIED',
  };
  if (!allowedTargets[target.id]?.[2]) {
    return { ...base, status: 'NOT VERIFIED', detail: 'No authorized public code-parity probe' };
  }
  if (!response || !Number.isInteger(response.status)) {
    return { ...base, status: 'NOT OBSERVABLE', detail: 'No trustworthy HTTP response' };
  }
  if (response.status < 200 || response.status >= 300) {
    return { ...base, status: 'DEGRADED', detail: 'HTTP ' + response.status };
  }
  if (target.mode === 'public-static') {
    return { ...base, status: 'PARTIALLY VERIFIED', detail: 'Site reachable; deployed SHA unknown' };
  }
  if (response.body?.ok === true && response.body?.status === 'worker-ready' &&
      response.body?.layer === 'cloudflare-worker') {
    return { ...base, status: 'PARTIALLY VERIFIED', detail: 'Worker health valid; release SHA unknown' };
  }
  return { ...base, status: 'NOT VERIFIED', detail: 'Unexpected Worker health contract' };
}

async function readHealthBody(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    const value = await response.text();
    return value.length <= 8192 ? value : '';
  }
  const chunks = [];
  let bytes = 0;
  try {
    while (bytes <= 8192) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 8192) return '';
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function runProbes(manifest, sourceSha, request = fetch) {
  const check = validateManifest(manifest);
  assert.ok(check.ok, check.issues.join('; '));
  assert.match(sourceSha, /^[a-f0-9]{40}$/i, 'Exact Git SHA required');
  const reports = [];
  for (const target of manifest.targets) {
    const url = allowedTargets[target.id][2];
    if (!url) {
      reports.push(evaluateProbe(target, null, sourceSha));
      continue;
    }
    try {
      const response = await request(url, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Accept: 'application/json, text/html;q=0.8' },
      });
      let body = null;
      if (target.mode === 'public-health' && response.status >= 200 && response.status < 300) {
        try { body = JSON.parse(await readHealthBody(response)); } catch { /* unverified */ }
      }
      reports.push(evaluateProbe(target, { status: response.status, body }, sourceSha));
    } catch {
      reports.push(evaluateProbe(target, null, sourceSha));
    }
  }
  return reports;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = JSON.parse(readFileSync(new URL('../config/platform-sync-targets.json', import.meta.url), 'utf8'));
  const sha = process.env.GITHUB_SHA ?? '';
  const reports = await runProbes(config, sha);
  const summary = [
    '## GLORIFIER platform reconciliation — read-only',
    'Source: GLORIFIER7/GLORIFIER @ ' + sha,
    'Reachability does not prove deployed source parity or authorize data replication.',
    '| Target | Evidence | Release parity |',
    '| --- | --- | --- |',
    ...reports.map((r) => '| ' + r.id + ' | ' + r.status + ' | ' + r.releaseParity + ' |'),
  ].join('\n') + '\n';
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}
