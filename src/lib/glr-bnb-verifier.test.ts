import assert from 'node:assert/strict';
import { glrAmountToBaseUnits, verifyBnbGLRTransfer, BNB_GLR_CONTRACT } from './glr-bnb-verifier';
import test from 'node:test';

test("BNB GLR transfer verifier regression cases", async () => {
  assert.ok(glrAmountToBaseUnits('1') === 1000000000000000000n, 'one GLR must equal 1e18 base units');
  assert.ok(glrAmountToBaseUnits('0.000000000000000001') === 1n, 'smallest GLR unit must be represented exactly');
  let rejected = false;
  try { glrAmountToBaseUnits('0.0000000000000000001'); } catch { rejected = true; }
  assert.ok(rejected, 'more than 18 decimals must be rejected');
  
  const txHash = '0x' + 'a'.repeat(64);
  const recipient = '0x1111111111111111111111111111111111111111';
  const payer = '0x2222222222222222222222222222222222222222';
  const recipientTopic = '0x' + recipient.slice(2).padStart(64, '0');
  const payerTopic = '0x' + payer.slice(2).padStart(64, '0');
  const payloads: Record<string, unknown> = {
    eth_chainId: '0x38',
    eth_getTransactionByHash: { hash: txHash, to: BNB_GLR_CONTRACT },
    eth_getTransactionReceipt: {
      transactionHash: txHash,
      status: '0x1',
      blockNumber: '0x64',
      logs: [{
        address: BNB_GLR_CONTRACT,
        topics: [['0xddf252ad1be2c89b69c2b068fc378daa', '952ba7f163c4a11628f55a4df523b3ef'].join(''), payerTopic, recipientTopic],
        data: '0xde0b6b3a7640000'
      }]
    },
    eth_blockNumber: '0x70'
  };
  const mockFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: payloads[body.method] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const verified = await verifyBnbGLRTransfer({
    transactionHash: txHash,
    expectedAmount: '1',
    expectedPayerWallet: payer,
    fetchImpl: mockFetch,
    env: { GLR_BNB_PAYMENT_RECIPIENT: recipient, GLR_BNB_MIN_CONFIRMATIONS: '12' }
  });
  assert.ok(verified.verified && verified.confirmations === 13, 'valid mainnet receipt with exact GLR transfer and finality must verify');
  let wrongPayerRejected = false;
  try {
    await verifyBnbGLRTransfer({
      transactionHash: txHash, expectedAmount: '1',
      expectedPayerWallet: '0x3333333333333333333333333333333333333333',
      fetchImpl: mockFetch,
      env: { GLR_BNB_PAYMENT_RECIPIENT: recipient, GLR_BNB_MIN_CONFIRMATIONS: '12' }
    });
  } catch { wrongPayerRejected = true; }
  assert.ok(wrongPayerRejected, 'transfer from a different payer wallet must be rejected');
  
  let disabled = false;
  try {
    await verifyBnbGLRTransfer({ transactionHash: txHash, expectedAmount: '1', expectedPayerWallet: payer, fetchImpl: mockFetch, env: {} });
  } catch { disabled = true; }
  assert.ok(disabled, 'verifier must remain disabled until recipient is configured');
  
  const wrongChainFetch: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const result = body.method === 'eth_chainId' ? '0x1' : payloads[body.method];
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  let wrongChainRejected = false;
  try {
    await verifyBnbGLRTransfer({
      transactionHash: txHash, expectedAmount: '1', expectedPayerWallet: payer, fetchImpl: wrongChainFetch,
      env: { GLR_BNB_PAYMENT_RECIPIENT: recipient }
    });
  } catch { wrongChainRejected = true; }
  assert.ok(wrongChainRejected, 'wrong chain must be rejected');
  
  console.log('BNB GLR verifier tests passed.');
});
