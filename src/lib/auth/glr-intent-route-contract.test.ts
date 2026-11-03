import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('glr-intent-route-contract regression suite', async () => {
const server = readFileSync('server.ts', 'utf8');
assert.match(
  server,
  /app\.get\(\s*['"]\/api\/economy\/glr\/intents['"]\s*,\s*requireOwnerOrInternalService\s*,/,
  'listing payment intents must require owner or authenticated internal-service authorization',
);
assert.match(
  server,
  /app\.get\(\s*['"]\/api\/economy\/glr\/intents\/:id['"]\s*,\s*requireOwnerOrInternalService\s*,/,
  'reading a payment intent must require owner or authenticated internal-service authorization',
);

const creationStartPattern = /app\.post\(\s*['"]\/api\/economy\/glr\/intents['"]\s*,\s*requireAuthentication\s*,/;
const creationStartMatch = creationStartPattern.exec(server);
assert.ok(creationStartMatch, 'GLR intent creation route must require authentication');
const creationRouteStart = creationStartMatch.index;
const authorizeRoutePattern = /app\.post\(\s*['"]\/api\/economy\/glr\/intents\/:id\/authorize['"]/g;
authorizeRoutePattern.lastIndex = creationRouteStart + creationStartMatch[0].length;
const authorizeRouteMatch = authorizeRoutePattern.exec(server);
assert.ok(authorizeRouteMatch, 'GLR intent authorization route delimiter must remain defined');
const creationRoute = server.slice(creationRouteStart, authorizeRouteMatch.index);

assert.match(
  creationRoute,
  /createAuthenticatedPayerIntent\(\s*auth\?\.uid\s*,\s*req\.body\s*,/,
  'creation must route through the tested authenticated-payer boundary',
);
assert.match(
  creationRoute,
  /\(?\s*input\s*\)?\s*=>\s*createGLRPaymentIntent\(input as Parameters<typeof createGLRPaymentIntent>\[0\]\)/,
  'the authenticated-payer result must be the input to GLR intent persistence',
);

console.log('GLR payment-intent route authorization contract tests passed');
});
