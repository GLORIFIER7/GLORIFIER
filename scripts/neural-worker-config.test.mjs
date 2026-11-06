import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));

const expectedOrigin = 'https://glorifier-neural.glorifier.workers.dev';
const expectedHostname = 'glorifier-neural.glorifier.workers.dev';

assert.equal(
  config.vars?.GLORIFIER_NEURAL_ORIGIN,
  expectedOrigin,
  'production must point only to the verified GLORIFIER-NEURAL Worker origin',
);
assert.equal(
  config.vars?.GLORIFIER_NEURAL_ALLOWED_HOSTS,
  expectedHostname,
  'production must use an exact hostname allowlist for the Neural origin',
);
assert.equal(
  config.previews?.vars?.GLORIFIER_NEURAL_ORIGIN,
  '',
  'Cloudflare previews must not call the production Neural Worker',
);
assert.equal(
  config.previews?.vars?.GLORIFIER_NEURAL_ALLOWED_HOSTS,
  '',
  'Cloudflare previews must not inherit production Neural egress authorization',
);
assert.equal(
  new URL(config.vars.GLORIFIER_NEURAL_ORIGIN).hostname,
  config.vars.GLORIFIER_NEURAL_ALLOWED_HOSTS,
  'the allowed hostname must exactly match the configured HTTPS origin',
);
assert.ok(
  !config.vars.GLORIFIER_NEURAL_ALLOWED_HOSTS.includes('*'),
  'Neural egress must not use wildcard hostname authorization',
);

process.stdout.write('GLORIFIER production Neural origin and preview isolation contract passed.\n');
