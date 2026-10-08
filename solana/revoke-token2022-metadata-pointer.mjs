import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/glorifier-token2022-js/package.json");
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } = require("@solana/web3.js");
const {
  AuthorityType,
  TOKEN_2022_PROGRAM_ID,
  createSetAuthorityInstruction,
  getMint,
  getMetadataPointerState,
} = require("@solana/spl-token");

const mint = new PublicKey(process.argv[2]);
const secret = JSON.parse(
  fs.readFileSync(process.env.HOME + "/.config/solana/glorifier-mainnet-keypair.json", "utf8"),
);
const signer = Keypair.fromSecretKey(Uint8Array.from(secret));
const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");

const state = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
const pointer = getMetadataPointerState(state);

if (!pointer?.authority) {
  throw new Error("Metadata Pointer authority is already absent or unreadable.");
}
if (!pointer.authority.equals(signer.publicKey)) {
  throw new Error("Metadata Pointer authority is not held by the authorized deployment signer.");
}

const instruction = createSetAuthorityInstruction(
  mint,
  signer.publicKey,
  AuthorityType.MetadataPointer,
  null,
  [],
  TOKEN_2022_PROGRAM_ID,
);

const signature = await sendAndConfirmTransaction(
  connection,
  new Transaction().add(instruction),
  [signer],
  { commitment: "confirmed" },
);

const finalState = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
const finalPointer = getMetadataPointerState(finalState);

if (finalPointer?.authority) {
  throw new Error("Metadata Pointer authority was not cleared on-chain.");
}

console.log(signature);
