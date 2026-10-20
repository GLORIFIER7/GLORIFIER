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
| Raw downloaded image bytes separately hashed | NOT VERIFIED | The available fetch path did not provide the raw image file for a separate local SHA-256 calculation |
| Previous metadata CID public gateway retrieval (historical evidence) | PARTIALLY VERIFIED | On 2026-10-18, a public dweb.link gateway returned HTTP 200 and the returned JSON referenced the existing image CID |
| Image pinned by a durable provider | NOT VERIFIED | No provider pin receipt or account/dashboard evidence was independently confirmed |
| Metadata pinned with durable retention | NOT VERIFIED | Gateway reachability alone is not proof of a pinning receipt or persistence guarantee |
| NFT minted | NOT PERFORMED | No mint transaction submitted |
| Funds spent | NOT AUTHORIZED | No paid service or transaction is authorized by this task |

## Evidence captured on 2026-10-18

- Image gateway: `https://gateway.pinata.cloud/ipfs/bafkreiakbvnq4sc5xvff5vzyhj572kemre5sfwedi2almqkhlqz53hefcm`
- Metadata gateway: `https://bafkreig7fyy4shnubajnzzflqrnlnd3dsb3acyuqomr7miiomtb2p5e4ai.ipfs.dweb.link`
- Image CID's embedded SHA-256 digest matches the previously recorded artwork SHA-256.
- The earlier metadata gateway response referenced the earlier image CID. The owner has now designated the new artwork CID and supplied a new metadata CID; exact correspondence between the supplied metadata bytes and repository draft remains to be independently confirmed.
- These checks prove gateway reachability at the time observed, not durable pinning, independent raw-byte hashing, legal clearance, or NFT minting.

## Required safe completion procedure

1. Retrieve the owner-designated artwork CID `QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv` with an IPFS-aware client or direct HTTP download, compute SHA-256 locally, and confirm it equals the recorded hash above.
2. Verify provider pinning for the designated image CID and owner-supplied metadata CID using an authorized storage/pinning provider; record the provider receipt/ID and retention status. Do not incur a charge without explicit authorization.
3. Verify durable pinning specifically for the owner-designated artwork CID `QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv` and owner-supplied metadata CID `QmZ1Na7Bdn23fKJdWK5JSvLTThTZ8j1r8W5SujHbVhX3wX` in the provider account. The previous pinning report, if any, applied to the older CIDs and does not establish pinning for these new CIDs. Record receipt/ID and retention status; do not treat gateway reachability alone as proof of pinning.
4. Retrieve the owner-supplied metadata CID `QmZ1Na7Bdn23fKJdWK5JSvLTThTZ8j1r8W5SujHbVhX3wX` and artwork CID independently. Record timestamps, HTTP results, raw byte hashes, and the metadata's exact `image` URI.
5. Do not silently replace either owner-designated CID. If the metadata CID's JSON does not reference the designated artwork CID, report the mismatch and prepare a corrected metadata file for explicit re-publication; never claim the existing metadata CID contains different bytes.
6. Only after these checks, consider a separate mint proposal. Minting is not authorized by this preparation task.

## Important

A metadata file committed to GitHub is not the same as metadata published to IPFS. A CID's embedded digest is useful integrity evidence, but it is not a provider pinning receipt. A gateway error alone does not prove content is lost, and a successful gateway response alone does not prove durable availability. Report each check honestly and preserve the original artwork and document both owner-designated CIDs.
