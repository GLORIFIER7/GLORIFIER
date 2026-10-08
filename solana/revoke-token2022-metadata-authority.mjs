import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/tmp/glorifier-token2022-js/package.json");
const { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } = require("@solana/web3.js");
const { TOKEN_2022_PROGRAM_ID, getTokenMetadata } = require("@solana/spl-token");
const { createUpdateAuthorityInstruction } = require("@solana/spl-token-metadata");

const mint = new PublicKey(process.argv[2]);
const secret = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/glorifier-mainnet-keypair.json", "utf8"));
const signer = Keypair.fromSecretKey(Uint8Array.from(secret));
const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");

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
const signature = await sendAndConfirmTransaction(
  connection,
  new Transaction().add(instruction),
  [signer],
  { commitment: "confirmed" },
);

const finalMetadata = await getTokenMetadata(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
if (finalMetadata?.updateAuthority) {
  throw new Error("Token Metadata update authority was not cleared on-chain.");
}
console.log(signature);
