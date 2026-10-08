import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/glorifier-token2022-js/package.json");
const { Connection, Keypair, PublicKey, Transaction } = require("@solana/web3.js");
const { TOKEN_2022_PROGRAM_ID, getTokenMetadata } = require("@solana/spl-token");
const { createUpdateAuthorityInstruction } = require("@solana/spl-token-metadata");

const mint = new PublicKey(process.argv[2]);
const secret = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/glorifier-mainnet-keypair.json", "utf8"));
const signer = Keypair.fromSecretKey(Uint8Array.from(secret));
const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");

async function sendAndConfirmHttp(instruction) {
  // Alchemy's HTTP RPC does not expose signatureSubscribe on the derived
  // websocket endpoint used by web3.js. Submit over HTTP and confirm by
  // polling signature status against the exact blockhash expiry window.
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: signer.publicKey,
    recentBlockhash: blockhash,
    lastValidBlockHeight,
  }).add(instruction);

  transaction.sign(signer);
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 8,
  });

  for (;;) {
    const statusResponse = await connection.getSignatureStatuses([signature]);
    const status = statusResponse.value[0];

    if (status?.err) {
      throw new Error(`Token Metadata authority transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return signature;
    }

    const blockHeight = await connection.getBlockHeight("confirmed");
    if (blockHeight > lastValidBlockHeight) {
      throw new Error(
        `Token Metadata authority transaction expired before confirmation: ${signature} (block height ${blockHeight} > last valid ${lastValidBlockHeight}).`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

const metadata = await getTokenMetadata(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
if (!metadata) throw new Error("Token Metadata extension is missing.");
if (!metadata.updateAuthority) throw new Error("Token Metadata update authority is already absent.");
if (!metadata.updateAuthority.equals(signer.publicKey)) {
  throw new Error("Token Metadata update authority is not held by the authorized deployment signer.");
}

const instruction = createUpdateAuthorityInstruction({
  programId: TOKEN_2022_PROGRAM_ID,
  metadata: mint,
  oldAuthority: signer.publicKey,
  newAuthority: null,
});
const signature = await sendAndConfirmHttp(instruction);

const finalMetadata = await getTokenMetadata(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
if (!finalMetadata || finalMetadata.updateAuthority) {
  throw new Error("Token Metadata update authority was not cleared on-chain.");
}
console.log(signature);
