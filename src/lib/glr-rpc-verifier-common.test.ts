import assert from 'node:assert/strict';
import { amountToBaseUnits, parseSecureRpcUrl, createRpcClient } from './glr-rpc-verifier-common';
import test from 'node:test';

test("Shared GLR RPC verifier helper regression cases", async () => {
  
  assert.ok(amountToBaseUnits('1', 18, 'GLR') === 1_000_000_000_000_000_000n, '18-decimal amount must parse exactly');
  assert.ok(amountToBaseUnits('0.000000001', 9, 'Solana GLR') === 1n, '9-decimal amount must parse exactly');
  let excessDecimalsRejected = false;
  try { amountToBaseUnits('0.0000000001', 9, 'Solana GLR'); } catch { excessDecimalsRejected = true; }
  assert.ok(excessDecimalsRejected, 'excess decimals must be rejected');
  let httpRejected = false;
  try { parseSecureRpcUrl('http://rpc.example', 'Test'); } catch { httpRejected = true; }
  assert.ok(httpRejected, 'insecure RPC URLs must be rejected');
  let credentialsRejected = false;
  try { parseSecureRpcUrl('https://user:pass@rpc.example', 'Test'); } catch { credentialsRejected = true; }
  assert.ok(credentialsRejected, 'RPC URLs containing credentials must be rejected');
  let invalidAmountRejected = false;
  try { amountToBaseUnits('-1', 9, 'Test'); } catch { invalidAmountRejected = true; }
  assert.ok(invalidAmountRejected, 'negative token amounts must be rejected');
  
  let request: RequestInit | undefined;
  const rpc = createRpcClient('https://rpc.example', 'Test', (async (_input: RequestInfo | URL, init?: RequestInit) => {
    request = init;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'ok' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch);
  const result = await rpc('test_method', []);
  assert.ok(result === 'ok', 'RPC result should be returned');
  assert.ok(request?.redirect === 'error', 'RPC redirects must be rejected');
  console.log('Shared GLR verifier helper tests passed.');
});
