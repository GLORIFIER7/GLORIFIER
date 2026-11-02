import { SOLANA_GLR_MINT, SOLANA_TOKEN_2022_PROGRAM, solanaGLRAmountToBaseUnits, verifySolanaGLRTransfer } from './glr-solana-verifier';

function assertCondition(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

assertCondition(solanaGLRAmountToBaseUnits('1') === 1000000000n, 'one GLR must equal 1e9 Solana base units');
assertCondition(solanaGLRAmountToBaseUnits('0.000000001') === 1n, 'smallest Solana GLR unit must be represented exactly');
let excessDecimalsRejected = false;
try { solanaGLRAmountToBaseUnits('0.0000000001'); } catch { excessDecimalsRejected = true; }
assertCondition(excessDecimalsRejected, 'more than 9 decimals must be rejected');

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
        destination: destinationTokenAccount, tokenAmount: { amount: '1000000000', decimals: 9, uiAmountString: '1' }
      }}
    }]}
  },
  meta: { err: null, innerInstructions: [] }
};
const mockFetch: typeof fetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body || '{}'));
  let result: unknown;
  switch (body.method) {
    case 'getGenesisHash': result = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'; break;
    case 'getSignatureStatuses': result = { value: [{ err: null, confirmationStatus: 'finalized' }] }; break;
    case 'getTransaction': result = transaction; break;
    case 'getAccountInfo': result = { value: { data: { parsed: { type: 'account', info: { mint: SOLANA_GLR_MINT, owner: recipient } } } } }; break;
    default: throw new Error('Unexpected RPC method: ' + body.method);
  }
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const verified = await verifySolanaGLRTransfer({
  transactionHash: signature, expectedAmount: '1', expectedPayerWallet: payer, fetchImpl: mockFetch,
  env: { GLR_SOLANA_PAYMENT_RECIPIENT: recipient, GLR_SOLANA_RPC_URL: 'https://rpc.example/path?api_key=do-not-persist' }
});
assertCondition(verified.verified && verified.slot === 123456 && verified.decimals === 9, 'valid finalized Token-2022 GLR transfer must verify');
assertCondition(verified.verifier === 'https://rpc.example', 'persisted verifier evidence must omit RPC path and query credentials');

for (const rpcUrl of [
  'http://rpc.example',
  'https://user:password@rpc.example',
]) {
  let rejected = false;
  try {
    await verifySolanaGLRTransfer({
      transactionHash: signature, expectedAmount: '1', expectedPayerWallet: payer, fetchImpl: mockFetch,
      env: { GLR_SOLANA_PAYMENT_RECIPIENT: recipient, GLR_SOLANA_RPC_URL: rpcUrl },
    });
  } catch { rejected = true; }
  assertCondition(rejected, `unsafe RPC URL must be rejected: ${rpcUrl.split('@').pop()}`);
}

let disabled = false;
try {
  await verifySolanaGLRTransfer({ transactionHash: signature, expectedAmount: '1', expectedPayerWallet: payer, fetchImpl: mockFetch, env: {} });
} catch { disabled = true; }
assertCondition(disabled, 'verifier must remain disabled until recipient is configured');

console.log('Solana GLR verifier tests passed.');
