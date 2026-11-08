import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const publicOrigin = 'https://glorifier.pages.dev';

test('production and monitoring smoke checks use the public Pages origin', () => {
  const productionSmoke = read('scripts/cloudflare-production-smoke.mjs');
  assert.match(productionSmoke, /const PRODUCTION_PUBLIC_ORIGIN = 'https:\/\/glorifier\.pages\.dev';/);
  assert.doesNotMatch(productionSmoke, /https:\/\/glorifier\.glorifier\.workers\.dev/);

  const infrastructureHealth = read('.github/workflows/infrastructure-health.yml');
  for (const path of ['/api/health', '/api/runtime-verification?probeAi=false', '/api/app-state']) {
    assert.ok(infrastructureHealth.includes('url="' + publicOrigin + path + '"'),
      'infrastructure health must probe ' + path + ' through Pages');
  }
  assert.match(infrastructureHealth, /Check Worker, assets, and Neon Hyperdrive operational readiness/);
  assert.match(infrastructureHealth, /Neon Hyperdrive exact-count probe passed/);
  assert.doesNotMatch(infrastructureHealth, /Supabase operational readiness|Supabase exact-count probe/);
  assert.doesNotMatch(infrastructureHealth, /https:\/\/glorifier\.glorifier\.workers\.dev/);

  const systemHealth = read('.github/workflows/system-health-guardian.yml');
  for (const path of ['/api/health', '/api/runtime-verification?probeAi=false', '/api/app-state']) {
    assert.ok(systemHealth.includes(publicOrigin + path),
      'system health guardian must probe ' + path + ' through Pages');
  }
  assert.match(systemHealth, /Verify Cloudflare Worker and Neon Hyperdrive runtime state/);
  assert.match(systemHealth, /Neon Hyperdrive probe verified/);
  assert.doesNotMatch(systemHealth, /Supabase runtime state|Supabase probe verified/);
  assert.doesNotMatch(systemHealth, /https:\/\/glorifier\.glorifier\.workers\.dev/);

  const cloudflareWorkflow = read('.github/workflows/cloudflare-worker.yml');
  for (const path of ['/api/health', '/api/business-model', '/api/app-state']) {
    assert.ok(cloudflareWorkflow.includes(publicOrigin + path),
      'Cloudflare deployment smoke must probe ' + path + ' through Pages');
  }
  assert.ok(cloudflareWorkflow.includes(publicOrigin + '$path'),
    'parameterized deployment probes must use the public Pages origin');
  assert.doesNotMatch(cloudflareWorkflow, /https:\/\/glorifier\.glorifier\.workers\.dev/);
});
