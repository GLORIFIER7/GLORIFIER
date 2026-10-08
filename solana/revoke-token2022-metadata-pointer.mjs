import fs from "node:fs";
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "/tmp/glorifier-token2022-js/node_modules/@solana/web3.js/lib/index.js";
import { AuthorityType, TOKEN_2022_PROGRAM_ID, createSetAuthorityInstruction, getMint, getMetadataPointerState } from "/tmp/glorifier-token2022-js/node_modules/@solana/spl-token/lib/cjs/index.js";

const mint = new PublicKey(process.argv[2]);
const secret = JSON.parse(fs.readFileSync(process.env.HOME + "/.config/solana/glorifier-mainnet-keypair.json", "utf8"));
const signer = Keypair.fromSecretKey(Uint8Array.from(secret));
const connection = new Connection(process.env.SOLANA_RPC_URL, "confirmed");
const state = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
const pointer = getMetadataPointerState(state);
if (!pointer?.authority) throw new Error("Metadata Pointer authority is already absent or unreadable.");
if (!pointer.authority.equals(signer.publicKey)) throw new Error("Metadata Pointer authority is not held by the authorized deployment signer.");
const ix = createSetAuthorityInstruction(mint, signer.publicKey, AuthorityType.MetadataPointer, null, [], TOKEN_2022_PROGRAM_ID);
const tx = await sendAndConfirmTransaction(connection, new Transaction().add(ix), [signer], {commitment:"confirmed"});
const finalState = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
const finalPointer = getMetadataPointerState(finalState);
if (finalPointer?.authority) throw new Error("Metadata Pointer authority was not cleared on-chain.");
console.log(tx);
