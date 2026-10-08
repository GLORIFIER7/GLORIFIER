import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/glorifier-token2022-js/package.json");
const { Connection, Keypair, PublicKey, Transaction } = require("@solana/web3.js");
const { AuthorityType, TOKEN_2022_PROGRAM_ID, createSetAuthorityInstruction, getMint, getMetadataPointerState } = require("@solana/spl-token");

const mint = new PublicKey(process.argv[2]);
const secret = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/glorifier-mainnet-keypair.json", "utf8"));
const signer = Keypair.fromSecretKey(Uint8Array.from(secret));
const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
async function sendAndConfirmHttp(instruction) {
  // Use the HTTP RPC confirmation path. This avoids web3.js websocket
  // signatureSubscribe, which is not exposed by the configured Alchemy RPC URL.
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
      throw new Error(`Metadata Pointer authority transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return signature;
    }

    const blockHeight = await connection.getBlockHeight("confirmed");
    if (blockHeight > lastValidBlockHeight) {
      throw new Error(
        `Metadata Pointer authority transaction expired before confirmation: ${signature} (block height ${blockHeight} > last valid ${lastValidBlockHeight}).`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

const state = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
const pointer = getMetadataPointerState(state);
if (!pointer?.authority) throw new Error("Metadata Pointer authority is already absent or unreadable.");
if (!pointer.authority.equals(signer.publicKey)) throw new Error("Metadata Pointer authority is not held by the authorized deployment signer.");
const instruction = createSetAuthorityInstruction(mint, signer.publicKey, AuthorityType.MetadataPointer, null, [], TOKEN_2022_PROGRAM_ID);
const signature = await sendAndConfirmHttp(instruction);
const finalState = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
if (getMetadataPointerState(finalState)?.authority) throw new Error("Metadata Pointer authority was not cleared on-chain.");
console.log(signature);