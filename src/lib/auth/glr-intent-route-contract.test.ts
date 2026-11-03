import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const server = readFileSync('server.ts', 'utf8');

test('GLR payment-intent reads require owner or internal-service authorization', () => {
  assert.match(server, /app\.get\(\s*['"]\/api\/economy\/glr\/intents['"]\s*,\s*requireOwnerOrInternalService\s*,/);
  assert.match(server, /app\.get\(\s*['"]\/api\/economy\/glr\/intents\/:id['"]\s*,\s*requireOwnerOrInternalService\s*,/);
});

test('GLR payment-intent creation requires authentication and binds the payer', () => {
  const startPattern = /app\.post\(\s*['"]\/api\/economy\/glr\/intents['"]\s*,\s*requireAuthentication\s*,/;
  const match = startPattern.exec(server);
  assert.ok(match, 'GLR intent creation route must require authentication');
  const endPattern = /app\.post\(\s*['"]\/api\/economy\/glr\/intents\/:id\/authorize['"]/g;
  endPattern.lastIndex = match.index + match[0].length;
  const end = endPattern.exec(server);
  assert.ok(end, 'GLR intent authorization route delimiter must remain defined');
  const route = server.slice(match.index, end.index);
  assert.match(route, /createAuthenticatedPayerIntent\(\s*auth\?\.uid\s*,\s*req\.body\s*,/);
  assert.match(route, /\(?\s*input\s*\)?\s*=>\s*createGLRPaymentIntent\(input as Parameters<typeof createGLRPaymentIntent>\[0\]\)/);
});
