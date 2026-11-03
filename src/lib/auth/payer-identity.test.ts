import assert from 'node:assert/strict';
import test from 'node:test';
import { createAuthenticatedPayerIntent, resolveAuthenticatedPayer } from './payer-identity';

test('payer identity must be authenticated and cannot be spoofed', () => {
  assert.deepEqual(resolveAuthenticatedPayer(undefined, 'payer-a'), { ok: false, status: 401, error: 'Authenticated payer identity required' });
  assert.deepEqual(resolveAuthenticatedPayer('firebase-uid-a'), { ok: true, payerAgentId: 'firebase-uid-a' });
  assert.deepEqual(resolveAuthenticatedPayer('firebase-uid-a', ' firebase-uid-a '), { ok: true, payerAgentId: 'firebase-uid-a' });
  assert.deepEqual(resolveAuthenticatedPayer('firebase-uid-a', 'firebase-uid-b'), { ok: false, status: 403, error: 'Payer identity must match the authenticated principal' });
  assert.deepEqual(resolveAuthenticatedPayer('firebase-uid-a', 123), { ok: true, payerAgentId: 'firebase-uid-a' });
});

test('payer intent persistence runs only after the authenticated identity is bound', async () => {
  const captured: Record<string, unknown>[] = [];
  const persist = async (input: Record<string, unknown>) => {
    captured.push(input);
    return { id: 'intent-test', truthStatus: 'NOT_SETTLED' };
  };
  const denied = await createAuthenticatedPayerIntent(
    'firebase-uid-a', { payerAgentId: 'attacker-selected-payer', amount: '5', memo: 'test' }, persist,
  );
  assert.deepEqual(denied, { ok: false, status: 403, error: 'Payer identity must match the authenticated principal' });
  assert.equal(captured.length, 0);
  const valid = await createAuthenticatedPayerIntent('firebase-uid-a', { amount: '5', memo: 'test' }, persist);
  assert.ok(valid.ok);
  assert.equal(captured[0]?.payerAgentId, 'firebase-uid-a');
  assert.equal(captured[0]?.amount, '5');
});
