import { assertCondition } from './test-assertion';
import assert from 'node:assert/strict';
import { glrAmountToBaseUnits, verifyEthereumGLRTransfer, ETHEREUM_GLR_CONTRACT } from './glr-ethereum-verifier';


assertCondition(glrAmountToBaseUnits('1') === 1000000000000000000n, 'one GLR must equal 1e18 base units');
assertCondition(glrAmountToBaseUnits('0.000000000000000001') === 1n, 'smallest GLR unit must be represented exactly');
let rejected = false;
try { glrAmountToBaseUnits('0.0000000000000000001'); } catch { rejected = true; }
assertCondition(rejected, 'more than 18 decimals must be rejected');

const txHash = '0x' + 'a'.repeat(64);
const recipient = '0x1111111111111111111111111111111111111111';
const payer = '0x2222222222222222222222222222222222222222';
const recipientTopic = '0x' + recipient.slice(2).padStart(64, '0');
const payerTopic = '0x' + payer.slice(2).padStart(64, '0');
const payloads: Record<string, unknown> = {
  eth_chainId: '0x1',
  eth_getTransactionByHash: { hash: txHash, to: ETHEREUM_GLR_CONTRACT },
  eth_getTransactionReceipt: {
    transactionHash: txHash,
    status: '0x1',
    blockNumber: '0x64',
    logs: [{
      address: ETHEREUM_GLR_CONTRACT,
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
const verified = await verifyEthereumGLRTransfer({
  transactionHash: txHash,
  expectedAmount: '1',
  expectedPayerWallet: payer,
  fetchImpl: mockFetch,
  env: { GLR_ETHEREUM_PAYMENT_RECIPIENT: recipient, GLR_ETHEREUM_MIN_CONFIRMATIONS: '12', GLR_ETHEREUM_RPC_URL: 'https://rpc.example/v2/private-key?api_key=secret' }
});
assertCondition(verified.verified && verified.confirmations === 13, 'valid mainnet receipt with exact GLR transfer and finality must verify');
assert.equal(verified.verifier, 'https://rpc.example', 'verification evidence must not expose RPC paths or query credentials');

let insecureRpcRejected = false;
let insecureFetchCalls = 0;
const insecureGuardFetch: typeof fetch = async (input, init) => {
  insecureFetchCalls++;
  return mockFetch(input, init);
};
try {
  await verifyEthereumGLRTransfer({
    transactionHash: txHash, expectedAmount: '1', expectedPayerWallet: payer, fetchImpl: insecureGuardFetch,
    env: { GLR_ETHEREUM_PAYMENT_RECIPIENT: recipient, GLR_ETHEREUM_RPC_URL: 'http://127.0.0.1:8545' }
  });
} catch (error) {
  insecureRpcRejected = error instanceof Error && error.message.includes('HTTPS');
}
assert.ok(insecureRpcRejected, 'non-HTTPS RPC URLs must be rejected before a request is made');
assert.equal(insecureFetchCalls, 0, 'insecure RPC URLs must be rejected before invoking the fetch implementation');
const duplicateFetch: typeof fetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body || '{}'));
  const result = body.method === 'eth_getTransactionReceipt'
    ? { ...(payloads.eth_getTransactionReceipt as Record<string, unknown>), logs: [
        ...((payloads.eth_getTransactionReceipt as { logs: Array<Record<string, unknown>> }).logs),
        ...((payloads.eth_getTransactionReceipt as { logs: Array<Record<string, unknown>> }).logs),
      ] }
    : payloads[body.method];
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
};
let duplicateTransferRejected = false;
try {
  await verifyEthereumGLRTransfer({
    transactionHash: txHash, expectedAmount: '1', expectedPayerWallet: payer, fetchImpl: duplicateFetch,
    env: { GLR_ETHEREUM_PAYMENT_RECIPIENT: recipient, GLR_ETHEREUM_RPC_URL: 'https://rpc.example' }
  });
} catch { duplicateTransferRejected = true; }
assert.ok(duplicateTransferRejected, 'multiple matching Transfer events must not be accepted as one payment');

let wrongPayerRejected = false;
try {
  await verifyEthereumGLRTransfer({
    transactionHash: txHash, expectedAmount: '1',
    expectedPayerWallet: '0x3333333333333333333333333333333333333333',
    fetchImpl: mockFetch,
    env: { GLR_ETHEREUM_PAYMENT_RECIPIENT: recipient, GLR_ETHEREUM_MIN_CONFIRMATIONS: '12' }
  });
} catch { wrongPayerRejected = true; }
assertCondition(wrongPayerRejected, 'transfer from a different payer wallet must be rejected');

let disabled = false;
try {
  await verifyEthereumGLRTransfer({ transactionHash: txHash, expectedAmount: '1', expectedPayerWallet: payer, fetchImpl: mockFetch, env: {} });
} catch { disabled = true; }
assertCondition(disabled, 'verifier must remain disabled until recipient is configured');

const wrongChainFetch: typeof fetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body || '{}'));
  const result = body.method === 'eth_chainId' ? '0x38' : payloads[body.method];
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
};
let wrongChainRejected = false;
try {
  await verifyEthereumGLRTransfer({
    transactionHash: txHash, expectedAmount: '1', expectedPayerWallet: payer, fetchImpl: wrongChainFetch,
    env: { GLR_ETHEREUM_PAYMENT_RECIPIENT: recipient }
  });
} catch { wrongChainRejected = true; }
assertCondition(wrongChainRejected, 'wrong chain must be rejected');

console.log('Ethereum GLR verifier tests passed.');
