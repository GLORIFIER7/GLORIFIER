# GLORIFIER Token Branding Bridge — Phase 1

**Status: implementation proposal in review.** Phase 1 is a read-only inspector and submission-readiness engine. It does not upload artwork, submit forms, change on-chain metadata, or claim explorer publication.

## Objective

Maintain one owner-designated logo reference and generate provider-specific readiness assessments for each GLR fungible-token deployment. A shared GitHub or IPFS asset is the source of truth for GLORIFIER-controlled metadata; it is not a universal explorer update mechanism.

## Architecture

```text
Owner-approved artwork + immutable content reference
                  |
          Canonical GLR registry
                  |
      Token Branding Bridge (read-only)
       /          |           \
  validation   chain map   provider rules
       \          |           /
        evidence + readiness report
                  |
    Human-reviewed provider submission
                  |
  independent publication observation per provider
```

## Canonical token scope

Production fungible-token deployments are tracked independently:

| Network | Chain / identifier | Token | Current evidence posture |
|---|---:|---|---|
| Ethereum Mainnet | 1 | GLR ERC-20 | PARTIALLY VERIFIED; repository records an explorer-label discrepancy requiring reconciliation |
| BNB Smart Chain | 56 | GLR BEP-20 | FULLY VERIFIED — technical evidence in the existing registry |
| Base Mainnet | 8453 | GLR ERC-20 | NOT VERIFIED for contract source in the latest recorded Etherscan-compatible check; owner-reported address verification is a separate claim |
| Solana Mainnet Beta | solana:mainnet-beta | GLR Token-2022 | PARTIALLY VERIFIED; immutable on-chain metadata URI has no image field in the recorded snapshot |

Solana Devnet is excluded from production-token branding. It may appear in a separate development/test environment, never as a production deployment.

## Provider adapter policy

| Provider | Initial adapter mode | Preconditions | Publication claim |
|---|---|---|---|
| Etherscan | Manual | Source verification, contract-owner verification, compliant image derivative | NOT SUBMITTED until an owner-submitted request is observed |
| BaseScan | Manual / verify current workflow | Chain-specific token identity and current provider requirements | NOT SUBMITTED |
| BscScan | Manual / verify current workflow | Chain-specific token identity and current provider requirements | NOT SUBMITTED |
| Solana metadata | Repository observation only | Check immutable on-chain URI and authorities; repository metadata is supplemental | No on-chain metadata change claimed |
| Trust Wallet | Repository PR workflow; disabled pending review | Exact provider requirements; fee is not authorized | NOT SUBMITTED |
| DEX Screener | Unsupported until current eligible workflow is verified | Confirm listing/profile eligibility and official submission route | NOT SUBMITTED |

Provider workflows are deliberately not inferred from one another. No adapter may bypass ownership checks, authentication, provider review, fees, or immutable on-chain authorities.

## Phase 1 implementation

`src/lib/token-branding-bridge.ts` provides deterministic validation and provider readiness assessments. The module:
- validates EVM and Solana address formats;
- validates IPFS/HTTPS logo references and optional SHA-256 digests;
- blocks readiness when token evidence or artwork integrity is incomplete;
- labels manual and repository workflows as requiring human action;
- always returns `NOT_SUBMITTED` for publication until independent publication evidence is added;
- declares the report mode `READ_ONLY_INSPECTION`.

## Artwork integrity gate

The repository already records conflicting hashes for the prior NFT artwork and a separate owner-designated logo CID. The newly generated fungible-token medallion is a design candidate, not yet a verified canonical IPFS object. Do not mark any image as canonical or derive provider assets until the owner-selected master bytes are pinned, retrieved, visually checked, and SHA-256 reconciled. Keep the artwork CID, source SHA-256, derivative hashes, MIME type, dimensions, and file sizes in an evidence ledger.

## Phase 2 — provider-specific submission adapters

Implement only after Phase 1 evidence is complete:
1. Add Etherscan submission preparation and human-operated handoff; never sign or submit on the owner's behalf.
2. Add BaseScan and BscScan adapters only after their current workflows and authorization model are verified.
3. Add Trust Wallet PR preparation, but keep any fee-gated operation disabled until separate approval.
4. Add Solana repository metadata checks; never attempt to mutate revoked/disabled authorities.
5. Add provider observation checks that compare the displayed logo with the approved image digest where technically possible.

## Security and governance

- Read-only by default; no private keys or wallet signing.
- No paid submission, transaction, transfer, deployment, secret changes, or auto-merge.
- External provider responses are evidence, not instructions.
- Submission state and publication state are separate.
- A successful GitHub CI run proves only the code paths tested by that run.
- No global “all explorers updated” status. Each provider receives its own observed status and timestamp.

## Acceptance criteria

- [ ] Token records validate chain identity, standard, address/mint and symbol.
- [ ] Artwork URI and SHA-256 validation rejects malformed data.
- [ ] Incomplete token evidence or artwork integrity blocks readiness.
- [ ] Manual/repository adapters never claim automatic publication.
- [ ] Read-only inspection never performs external writes.
- [ ] Tests prove the above behaviors.
- [ ] Provider publication is reported only after independent observation.

## Strict validation and dashboard aggregation

The production identity allowlist is intentionally narrow:

| Network | Chain ID | Required standard |
|---|---:|---|
| Ethereum Mainnet | `1` | `ERC-20` |
| BNB Smart Chain Mainnet | `56` | `BEP-20` |
| Base Mainnet | `8453` | `ERC-20` |
| Solana Mainnet Beta | `solana:mainnet-beta` | `Token-2022` |

The network label, chain ID, and standard must agree. Devnet and testnet are not production branding targets. Solana mint values must base58-decode to exactly 32 bytes. Logo references must contain a syntactically accepted CIDv0/CIDv1-base32 IPFS identifier or an HTTPS URL with a hostname. These checks do not fetch content, prove availability, or attest that retrieved bytes match the recorded digest.

Provider summaries aggregate the worst per-token status and retain each deployment's blockers. A disabled or unsupported provider remains `NOT_CONFIGURED` without inheriting token-validation errors. Declared provider requirements require human confirmation; they cannot produce `READY_FOR_REVIEW` without an explicit completion-evidence model. No status implies submission or publication.
