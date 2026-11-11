import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
assert.ok(config && typeof config === 'object' && !Array.isArray(config),
  'Wrangler configuration must be a JSON object');

const productionVars = config.vars;
const previewVars = config.previews?.vars;
const neuralServices = Array.isArray(config.services) ? config.services : [];
assert.deepEqual(
  neuralServices.filter((binding) => binding.binding === 'GLORIFIER_NEURAL'),
  [{ binding: 'GLORIFIER_NEURAL', service: 'glorifier-neural' }],
  'GLORIFIER must call the deployed NEURAL Worker through a same-account Service Binding',
);
assert.ok(productionVars && typeof productionVars === 'object' && !Array.isArray(productionVars),
  'production Wrangler variables must be present as an object');
assert.ok(previewVars && typeof previewVars === 'object' && !Array.isArray(previewVars),
  'preview Wrangler variables must be present as an object');

const inferenceAuthorizationFlags = [
  'GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS',
  'GLORIFIER_ENABLE_INFERENCE',
  'GLORIFIER_PAID_INFERENCE_AUTHORIZED',
];
for (const flag of inferenceAuthorizationFlags) {
  assert.equal(productionVars[flag], 'false', `production must default ${flag} to false`);
  assert.equal(previewVars[flag], 'false', `previews must default ${flag} to false`);
}

const expectedOrigin = 'https://glorifier-neural.glorifier.workers.dev';
const expectedHostname = 'glorifier-neural.glorifier.workers.dev';

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
