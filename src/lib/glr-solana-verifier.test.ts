import assert from 'node:assert/strict';
import {
  SOLANA_GLR_MINT,
  SOLANA_TOKEN_2022_PROGRAM,
  solanaGLRAmountToBaseUnits,
  verifySolanaGLRTransfer,
} from './glr-solana-verifier';
import test from 'node:test';

const signature = '5'.repeat(87);
const payer = '11111111111111111111111111111111';
const recipient = 'SysvarRent111111111111111111111111111111111';
const destinationTokenAccount = 'TokenAccount111111111111111111111111111111';
const transaction = {
  slot: 123456,
  transaction: {
    signatures: [signature],
    message: { instructions: [{
      programId: SOLANA_TOKEN_2022_PROGRAM,
      parsed: { type: 'transferChecked', info: {
        authority: payer, mint: SOLANA_GLR_MINT, source: 'SourceTokenAccount11111111111111111111111',
        destination: destinationTokenAccount, tokenAmount: { amount: '1000000000', decimals: 9, uiAmountString: '1' },
      } },
    }] },
  },
  meta: { err: null, innerInstructions: [] },
};

const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const TRUNCATED_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

const createMockFetch = (genesisHash: string): typeof fetch => async (_input, init) => {
  const body = JSON.parse(String(init?.body || '{}'));
  let result: unknown;
  switch (body.method) {
    case 'getGenesisHash': result = genesisHash; break;
    case 'getSignatureStatuses': result = { value: [{ err: null, confirmationStatus: 'finalized' }] }; break;
    case 'getTransaction': result = transaction; break;
    case 'getAccountInfo': result = { value: { data: { parsed: { type: 'account', info: { mint: SOLANA_GLR_MINT, owner: recipient } } } } }; break;
    default: throw new Error('Unexpected RPC method: ' + body.method);
  }
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const mockFetch = createMockFetch(MAINNET_GENESIS_HASH);

test('Solana GLR amount conversion enforces nine-decimal Token-2022 precision', () => {
  assert.equal(solanaGLRAmountToBaseUnits('1'), 1000000000n);
  assert.equal(solanaGLRAmountToBaseUnits('0.000000001'), 1n);
  assert.throws(() => solanaGLRAmountToBaseUnits('0.0000000001'));
});

test('truncated Solana mainnet genesis hashes are rejected', async () => {
  await assert.rejects(verifySolanaGLRTransfer({
    transactionHash: signature,
    expectedAmount: '1',
    expectedPayerWallet: payer,
    fetchImpl: createMockFetch(TRUNCATED_GENESIS_HASH),
    env: { GLR_SOLANA_PAYMENT_RECIPIENT: recipient },
  }), /Configured RPC is not Solana mainnet-beta/);
});

test('a finalized Token-2022 GLR transfer verifies and redacts RPC credentials', async () => {
  const verified = await verifySolanaGLRTransfer({
    transactionHash: signature, expectedAmount: '1', expectedPayerWallet: payer, fetchImpl: mockFetch,
    env: { GLR_SOLANA_PAYMENT_RECIPIENT: recipient, GLR_SOLANA_RPC_URL: 'https://rpc.example/path?api_key=do-not-persist' },
  });
  assert.ok(verified.verified && verified.slot === 123456 && verified.decimals === 9);
  assert.equal(verified.verifier, 'https://rpc.example');
});

test('unsafe Solana RPC URLs are rejected before transfer verification', async () => {
  for (const rpcUrl of ['http://rpc.example', 'https://user:password@rpc.example']) {
    await assert.rejects(verifySolanaGLRTransfer({
      transactionHash: signature, expectedAmount: '1', expectedPayerWallet: payer, fetchImpl: mockFetch,
      env: { GLR_SOLANA_PAYMENT_RECIPIENT: recipient, GLR_SOLANA_RPC_URL: rpcUrl },
    }));
  }
});

test('Solana transfer verification remains disabled without a recipient', async () => {
  await assert.rejects(verifySolanaGLRTransfer({
    transactionHash: signature, expectedAmount: '1', expectedPayerWallet: payer, fetchImpl: mockFetch, env: {},
  }));
});
