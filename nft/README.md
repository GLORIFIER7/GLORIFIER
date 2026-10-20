# GLORIFIER SERVICES NFT — preparation status

## Identity to preserve

- Name: `GLORIFIER SERVICES — Official Logo #001`
- Artwork: existing circular GLORIFIER SERVICES logo, including “EST 2022”
- Owner-designated artwork CID: `QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv`
- Owner-supplied metadata CID: `QmZ1Na7Bdn23fKJdWK5JSvLTThTZ8j1r8W5SujHbVhX3wX`
- Expected metadata URI for review: `ipfs://QmZ1Na7Bdn23fKJdWK5JSvLTThTZ8j1r8W5SujHbVhX3wX`
- Previously recorded artwork SHA-256: `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513`
- Metadata draft: [metadata.json](./metadata.json)

## Evidence status

| Check | Status | Meaning |
|---|---|---|
| Metadata draft committed to GitHub | RECORDED | Repository copy only; not an IPFS publication |
| Previous image CID public gateway retrieval (historical evidence) | PARTIALLY VERIFIED | On 2026-10-18, the Pinata public gateway returned HTTP 200 with `Content-Type: image/png`; displayed content identified GLORIFIER / EST 2022 / SERVICES |
| Previous image CID embedded digest matches recorded artwork hash (historical evidence) | MATCH | Decoding the existing CIDv1 raw-codec multihash yields SHA-256 `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513`, matching the recorded artwork digest |
| Raw downloaded image bytes separately hashed | MISMATCH | Fresh designated-CID retrieval returned 55,886 bytes with SHA-256 `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790`, not the previously recorded source file size/hash; see 2026-10-20 evidence below |
| Designated metadata CID gateway retrieval | VERIFIED AT TIME CHECKED | Filebase gateway and Pinata gateway returned HTTP 200 and 1,850 bytes of JSON on 2026-10-20 |
| Metadata name and image URI | MATCH | Retrieved JSON name is `GLORIFIER SERVICES — Official Logo #001`; its `image` field is `ipfs://QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv` |
| Exact metadata bytes across gateways | MATCH AT TIME CHECKED | Both gateways returned 1,850 bytes with SHA-256 `a95dc173646d7c68d87cf2be7429d55b86e437074de99a29e9d0338d82303700` |
| Image pinned by a durable provider | OWNER-REPORTED PINNED | Owner reports both designated CIDs are pinned in Filebase; pin receipt/retention details have not been independently inspected |
| Metadata pinned with durable retention | OWNER-REPORTED PINNED | Owner reports both designated CIDs are pinned in Filebase; gateway reachability is not itself a pinning receipt |
| NFT minted | NOT PERFORMED | No mint transaction submitted |
| Funds spent | NONE | No transaction or paid service was initiated |

## Fresh designated-CID evidence captured on 2026-10-20

- Metadata URL: `https://deep-copper-firefly.myfilebase.com/ipfs/QmZ1Na7Bdn23fKJdWK5JSvLTThTZ8j1r8W5SujHbVhX3wX`
- Metadata alternate gateway: `https://gateway.pinata.cloud/ipfs/QmZ1Na7Bdn23fKJdWK5JSvLTThTZ8j1r8W5SujHbVhX3wX`
- Both metadata gateways returned HTTP 200, `Content-Type: application/json`, 1,850 bytes, SHA-256 `a95dc173646d7c68d87cf2be7429d55b86e437074de99a29e9d0338d82303700`.
- The retrieved JSON contains the expected NFT name and points its `image` field at the designated artwork CID.
- Artwork URL: `https://deep-copper-firefly.myfilebase.com/ipfs/QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv`
- Artwork alternate gateway: `https://gateway.pinata.cloud/ipfs/QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv`
- Both artwork gateways returned HTTP 200 and `Content-Type: image/png`, 55,886 bytes, SHA-256 `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790`.
- The retrieved artwork's byte size and SHA-256 do not match the previously recorded source PNG (151,445 bytes; SHA-256 `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513`). This proves the downloaded bytes are not byte-for-byte identical to that recorded source file. It does not, by itself, prove the visible artwork is different; visual/pixel comparison is still required.
- The currently published metadata's description/attributes claim the historical source PNG hash matches the uploaded artwork. The fresh raw-byte result does not support byte-for-byte identity. The owner has confirmed the designated artwork and image reference are the intended/correct content. This PR updates the repository metadata drafts to report the retrieved artwork hash and distinguish it from the historical source hash. These corrected drafts are not yet published: they require upload to IPFS, a new metadata CID, and an update/review of the contract's fixed URI before deployment.
- The gateway responses prove retrieval at the time observed, not durable pinning or future availability. Filebase pinning is owner-reported; no account receipt was independently inspected.

## Required safe completion procedure

1. The owner confirms the designated artwork and reference are intended. Preserve the distinction between owner confirmation and byte-level evidence: the retrieved PNG is not byte-for-byte identical to the historical source PNG. Do not claim byte identity.
2. If exact original bytes are required, re-pin the exact approved source PNG and update metadata to reference that artwork CID. If the artwork is intentionally re-encoded, correct metadata wording so it does not claim byte-for-byte hash identity.
3. Publish corrected metadata to IPFS, obtain its new CID, retrieve it through independent gateways, and confirm its exact `image` URI. Do not silently reuse the existing metadata CID for different bytes.
4. Verify provider pin records/receipts for the exact artwork and metadata CIDs. Do not incur a charge without explicit authorization.
5. Rebuild and test the contract with the final approved metadata CID. The current reviewed contract has the existing metadata CID compiled into bytecode, so a changed metadata CID requires a reviewed source change and a new deployment artifact.
6. Only after the content mismatch is resolved, contract review is complete, and exact deployment/mint transaction costs are estimated, proceed through the owner's wallet. No private key or seed phrase should be shared.

## Important

A metadata file committed to GitHub is not the same as metadata published to IPFS. A CID's embedded digest is useful integrity evidence, but it is not a provider pinning receipt. A gateway error alone does not prove content is lost, and a successful gateway response alone does not prove durable availability. Preserve the original artwork and document both owner-designated CIDs.
