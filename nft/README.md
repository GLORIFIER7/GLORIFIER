# GLORIFIER SERVICES NFT — preparation status

## Identity to preserve

- Name: `GLORIFIER SERVICES — Official Logo #001`
- Artwork: owner-designated circular GLORIFIER SERVICES logo, including “EST 2022”
- Artwork CID: `QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv`
- Previously supplied metadata CID (not yet confirmed as the final corrected publication): `QmZ1Na7Bdn23fKJdWK5JSvLTThTZ8j1r8W5SujHbVhX3wX`
- Previously recorded source PNG SHA-256: `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513`
- Fresh gateway retrieval recorded on 2026-10-20: 55,886 bytes, SHA-256 `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790`

## Evidence status

| Check | Status | Meaning |
|---|---|---|
| Corrected metadata draft committed to GitHub | RECORDED | Repository copy only; not proof of a new IPFS publication |
| Designated image gateway retrieval | VERIFIED AT TIME CHECKED | Two gateways reportedly returned PNG bytes for the designated CID on 2026-10-20 |
| Fresh retrieved image bytes equal historical source PNG bytes | MISMATCH | The raw-byte SHA-256 and byte length differ; this does not by itself prove a visible image difference |
| Metadata gateway retrieval | VERIFIED AT TIME CHECKED | Existing owner-supplied metadata CID was retrieved from two gateways on 2026-10-20 |
| Corrected metadata published to IPFS | NOT VERIFIED | A corrected repository draft requires a new IPFS publication and CID verification |
| Durable provider pin receipt | OWNER-REPORTED PINNED | Gateway reachability does not independently prove provider pin records or retention |
| ERC-721 source | REVIEW ONLY | Proposed single-token contract; not independently audited |
| Wallet | USER-CONFIRMED ADDRESS | Public address supplied as the Binance GLORIFIER Agentic Wallet; live connection, balance, and transaction permissions not independently verified |
| Mainnet deployment | NOT PERFORMED / NOT VERIFIED | No verified deployed contract address established |
| Mint | NOT PERFORMED | No mint transaction submitted through this workflow |
| Funds spent | NONE REPORTED | No transaction or paid service initiated through this workflow |

## Corrected metadata requirements

The repository draft describes the designated artwork and distinguishes its freshly retrieved byte hash from the historical source PNG hash. Do not claim byte-for-byte identity. Owner confirmation identifies the intended artwork, but a visual/pixel comparison and any desired source-file reconciliation should remain explicit.

The current metadata JSON in GitHub is a draft, not automatically the same bytes as the already published metadata CID. Publish the approved corrected JSON to IPFS, obtain its CID, retrieve it through independent gateways, and verify its `image` URI. Confirm provider pin receipts without starting a paid service unless separately authorized.

## Contract preparation

The review contract accepts the final metadata URI as a constructor argument and stores it without a public mutation method. This avoids hardcoding an unfinalized metadata CID into source code. The final URI must still be verified before any deployment transaction is proposed. Deployment does not mint the token; token ID `1` is minted separately by the owner-only function at most once.

## Required gates before any transaction

1. Verify the final corrected metadata CID and image URI through independent gateways.
2. Review the exact contract source and passing compile/test results on the proposed commit.
3. Verify the wallet address/network and independently inspect available balance and permissions.
4. Simulate the exact deployment and mint transactions, including recipient and costs.
5. Present each transaction for explicit review and approval before any signature, payment, deployment, or mint.

Never request or share a private key, seed phrase, or recovery code. This workflow does not deploy, mint, sign, or spend funds.
