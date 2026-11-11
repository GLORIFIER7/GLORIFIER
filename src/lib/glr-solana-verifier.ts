import { amountToBaseUnits, createRpcClient, parseSecureRpcUrl, type GLRTransferVerifierInput } from './glr-rpc-verifier-common';
export const SOLANA_GLR_MINT = '7Mqd7dSqbE4pgQvozYdCQ1EMABj2ecTrUxLTHceBvkv9';
export const SOLANA_TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

export interface SolanaGLRVerification {
  verified: true;
  network: 'solana:mainnet';
  transactionHash: string;
  slot: number;
  mint: string;
  recipient: string;
  amountGLR: string;
  decimals: 9;
  verifier: string;
  evidenceRef: string;
}

export function solanaGLRAmountToBaseUnits(amount: string): bigint {
  return amountToBaseUnits(amount, 9, 'Solana GLR');
}

export async function verifySolanaGLRTransfer(input: GLRTransferVerifierInput): Promise<SolanaGLRVerification> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const signature = input.transactionHash.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature)) throw new Error('Solana transaction signature is invalid');
  const expectedUnits = solanaGLRAmountToBaseUnits(input.expectedAmount);
  if (expectedUnits <= 0n) throw new Error('Expected GLR amount must be greater than zero');
  const payer = input.expectedPayerWallet.trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(payer)) throw new Error('Expected Solana payer wallet is missing or invalid');
  const recipient = String(env.GLR_SOLANA_PAYMENT_RECIPIENT || '').trim();
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(recipient)) throw new Error('Solana GLR payment recipient is not configured; verification is disabled');
  const rpcUrl = String(env.GLR_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com').trim();
  const parsedRpcUrl = parseSecureRpcUrl(rpcUrl, 'Solana');
  const rpc = createRpcClient(parsedRpcUrl.href, 'Solana', fetchImpl, 10000);

  const genesisHash = String(await rpc('getGenesisHash', []));
  if (genesisHash !== MAINNET_GENESIS_HASH) throw new Error('Configured RPC is not Solana mainnet-beta');
  const statuses: any = await rpc('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
  const status = statuses?.value?.[0];
  if (!status || status.err || status.confirmationStatus !== 'finalized') throw new Error('Solana transaction is missing, failed, or not finalized');
  const tx: any = await rpc('getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }]);
  if (!tx || !Number.isSafeInteger(tx.slot) || tx.slot <= 0) throw new Error('Finalized Solana transaction was not found');
  const signatures = tx.transaction?.signatures;
  if (!Array.isArray(signatures) || !signatures.includes(signature)) throw new Error('Solana transaction signature mismatch');
  if (tx.meta?.err) throw new Error('Solana transaction failed');
  const message = tx.transaction?.message;
  const instructions: any[] = [
    ...(Array.isArray(message?.instructions) ? message.instructions : []),
    ...(Array.isArray(tx.meta?.innerInstructions) ? tx.meta.innerInstructions.flatMap((entry: any) => Array.isArray(entry.instructions) ? entry.instructions : []) : [])
  ];
  const matches = instructions.filter((instruction: any) => {
    const parsed = instruction?.parsed;
    const info = parsed?.info;
    const type = parsed?.type;
    if (instruction?.programId !== SOLANA_TOKEN_2022_PROGRAM || !['transferChecked', 'transfer'].includes(type) || !info) return false;
    if (String(info.authority || '') !== payer || String(info.mint || '') !== SOLANA_GLR_MINT) return false;
    if (String(info.destination || '') === '' || !info.tokenAmount && type === 'transferChecked') return false;
    let amount: bigint;
    try {
      amount = type === 'transferChecked'
        ? BigInt(String(info.tokenAmount.amount))
        : BigInt(String(info.amount));
    } catch { return false; }
    const decimals = type === 'transferChecked' ? Number(info.tokenAmount.decimals) : 9;
    return amount === expectedUnits && decimals === 9;
  });
  if (matches.length !== 1) throw new Error('Transaction must contain exactly one Token-2022 GLR transfer matching payer, mint, and exact intent amount');
  const destinationTokenAccount = String(matches[0].parsed.info.destination);
  const destinationInfo: any = await rpc('getAccountInfo', [destinationTokenAccount, { encoding: 'jsonParsed', commitment: 'finalized' }]);
  const parsedAccount = destinationInfo?.value?.data?.parsed;
  if (!destinationInfo?.value || parsedAccount?.type !== 'account'
    || String(parsedAccount?.info?.mint || '') !== SOLANA_GLR_MINT
    || String(parsedAccount?.info?.owner || '') !== recipient) {
    throw new Error('Destination Token-2022 account is not owned by the configured GLR payment recipient');
  }

  return {
    verified: true,
    network: 'solana:mainnet',
    transactionHash: signature,
    slot: tx.slot,
    mint: SOLANA_GLR_MINT,
    recipient,
    amountGLR: input.expectedAmount,
    decimals: 9,
    verifier: parsedRpcUrl.origin,
    evidenceRef: `solana-mainnet-rpc:${signature}:slot:${tx.slot}:finalized`
  };
}
