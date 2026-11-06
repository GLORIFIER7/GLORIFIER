import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

const expectedOrigin = 'https://glorifier-neural.glorifier.workers.dev';
const expectedHostname = 'glorifier-neural.glorifier.workers.dev';
const productionVars = config && typeof config === 'object' ? config.vars : undefined;
const previewVars = config && typeof config === 'object' ? config.previews?.vars : undefined;

assert.ok(productionVars && typeof productionVars === 'object',
  'production Wrangler variables must be present');
assert.ok(previewVars && typeof previewVars === 'object',
  'preview Wrangler variables must be present');

assert.equal(
  productionVars.GLORIFIER_NEURAL_ORIGIN,
  expectedOrigin,
  'production must point only to the verified GLORIFIER-NEURAL Worker origin',
);
assert.equal(
  productionVars.GLORIFIER_NEURAL_ALLOWED_HOSTS,
  expectedHostname,
  'production must use an exact hostname allowlist for the Neural origin',
);
assert.equal(
  previewVars.GLORIFIER_NEURAL_ORIGIN,
  '',
  'Cloudflare previews must not call the production Neural Worker',
);
assert.equal(
  previewVars.GLORIFIER_NEURAL_ALLOWED_HOSTS,
  '',
  'Cloudflare previews must not inherit production Neural egress authorization',
);
assert.equal(
  new URL(productionVars.GLORIFIER_NEURAL_ORIGIN).hostname,
  productionVars.GLORIFIER_NEURAL_ALLOWED_HOSTS,
  'the allowed hostname must exactly match the configured HTTPS origin',
);
assert.ok(
  !productionVars.GLORIFIER_NEURAL_ALLOWED_HOSTS.includes('*'),
  'Neural egress must not use wildcard hostname authorization',
);

process.stdout.write('GLORIFIER production Neural origin and preview isolation contract passed.\n');
