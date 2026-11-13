# GLORIFIER — Current Architecture

## Purpose

This document records the current implemented architecture and its governing boundaries.

## Official brand identity

- Official mark: **GLORIFIER SERVICES — Official Logo #001**, the existing Ethereum Mainnet ERC-721 artwork (token ID 1).
- Contract: `0xd62EB4963423f6e224Af0BccCabF75f566Fb9ad7`; on-chain token metadata URI: `ipfs://Qme1tGfPb4g8xJQKnvtHbSdVUZXAHCAVgahKciUQ9JUqst/1`.
- Canonical on-chain image URI: `ipfs://bafkreidnoy2bugujfuc5prawef3onhrxihyo3inoi5s73dhlrm2f5bnxsa`.
- Canonical artwork SHA-256: `6d76341a1a892d05d7c4162176e69e3741f0eda1ae4765fd8ceb8b345e85b790` (PNG, 500 × 500, 55,886 bytes); the owner-uploaded artwork matches this digest.
- App path: `public/glorifier-services-official-logo-001.png`, kept byte-identical to the existing root asset `GLORIFIER SERVICES.png` and the on-chain image CID digest.
- Use the shared record `src/lib/brand-assets.ts`; the header, browser metadata, PWA manifest, app icon, and project page must all use this same artwork.
- Do not substitute generated, Gravatar, historical, or unrelated art. Do not crop, stretch, recolor, or place the mark on a competing tile.
- The older historical source PNG hash `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513` refers to a different file and is not the current token image.
- Trademark/legal clearance remains pending and is not implied by the artwork's NFT status.


## System identity

- Product name: GLORIFIER
- Repository: GLORIFIER7/GLORIFIER
- Architecture: provider-neutral intelligence orchestration
- Human owner: final authority
- Core motto: "No single AI is hard-coded like the brain."

## System flow

HUMAN OWNER → AI CEO → MEDIATOR → INTELLIGENCE / GOVERNANCE / CONNECTIONS → OPPORTUNITY → EVIDENCE → AUTHORIZATION → EXECUTION → DELIVERY → ACCEPTANCE → SETTLEMENT EVIDENCE → REVENUE CONTROL PLANE → AUTHORITATIVE POSTGRESQL LEDGER → LEARNING

## Permanent planes

1. Human Authority
2. Intelligence
3. Mediation + Governance
4. Execution
5. Evidence + Economic Truth
6. Learning + Continuous Improvement

## Mediator

The mediator is the provider-neutral interoperability boundary. Nodes are typed as:

- ai_provider
- specialist
- demand_source
- marketplace
- execution_connector
- settlement_rail
- evidence_system
- revenue_ledger

Authentication status and authorization status remain separate.

## Discovery

The 24/7 discovery subsystem observes configured public/API sources, stores findings and provenance, routes findings to specialists and registered models/agents, and creates monetization opportunities for review.

Discovery never converts observation or estimates into verified revenue.

## Governance

GATS enforces:
- human authority
- evidence integrity
- opportunity integrity
- economic truth
- action governance
- model governance
- connection governance

GEAS and the Policy Scientist provide the broader governance/evidence coordination layer.

## Economic truth

Verified revenue is restricted to qualifying externally evidenced settlement events represented in the authoritative revenue ledger.

The following are not automatically revenue:

- opportunity
- market value
- estimate
- pipeline
- invoice
- account balance
- model-generated claim

## Revenue ledger

PostgreSQL is the authoritative economic ledger. The active provider is configured through `DATABASE_URL`; Neon is the currently recorded deployment provider. A provider change is not complete until schema, data, permissions, indexes, ledger reconciliation, application health, and rollback are verified.

Revenue events include:
- event ID
- provider
- provider transaction ID
- customer reference
- user reference
- currency
- amount
- status
- occurrence/receipt timestamps
- metadata

Supported statuses:
- paid
- refunded
- disputed
- voided

## Execution

Execution connectors include the current GitHub/GitHub Actions, Railway and Vercel architecture, with provider-neutral extension through the connection registry.

## Continuous operations

The architecture supports:
- 24/7 discovery
- monitoring
- CI/CD
- code sentinel/recovery workflows
- deployment verification
- provider substitution/fallback
- continuous improvement

Autonomous observation and planning are distinct from autonomous consequential action.

## Frontend

The frontend exposes focused control surfaces and uses GLORIFIER Live Economic Data as the primary landing surface. Data truth is explicitly labeled as verified/not verified and configuration as configured/needs-configuration where applicable.

## Current implementation boundary

The architecture is implemented across the repository, but individual external connectors, settlement rails, credentials, deployments, and end-to-end routes may still require configuration or verification. GLORIFIER must expose those states rather than represent them as verified.

## Architectural objective

Operate toward an AI-first autonomous enterprise with minimal routine human intervention: specialist agents continuously observe, diagnose, plan, coordinate, execute bounded actions, verify outcomes, recover from safe failures, and report exceptions. Human authority remains final for consequential, privileged, financial, legal, irreversible, and production-destructive actions. This is the target operating model, not a claim that every agent or external service is currently operational.

Create a provider-neutral operating layer where intelligence can be substituted, capabilities can be mediated, actions can be governed, outcomes can be evidenced, and economic claims can be reconciled against authoritative external settlement evidence.
