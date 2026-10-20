# GLORIFIER — Current Architecture

## Purpose

This document records the current implemented architecture and its governing boundaries.

## Official brand identity

- Official mark: **GLORIFIER SERVICES — EST 2022**, the owner-designated circular badge.
- Canonical artwork URI: `ipfs://QmVHCtutYvhWxAsqjTCzB5ySjqA1yenAyhDAWxE2Wa91Sv`.
- The updated artwork is the circular version without the old background. UI surfaces must preserve it as supplied using aspect-ratio-preserving `contain` rendering; do not add a background, crop, stretch, or wrap it in a competing rounded-square logo tile.
- Shared brand record: `src/lib/brand-assets.ts`; app header consumes the canonical artwork URI.
- Recorded artwork SHA-256: `0a0d5b0e485dbd4a5ed7383a7bfd288c893b22d8834680b641475c33dd9c8513` (Human Owner confirms the updated CID has the same hash as the previously recorded source; independent re-hashing of the updated CID remains pending).
- Verification boundary: header source configuration points to the updated CID in this branch, but full-page usage, favicon/app icons, public gateway uptime, production deployment, and end-to-end visual rendering still require verification. Existing repository JPEG mismatch remains unresolved; do not label every deployed surface fully verified.
- Legal/trademark clearance remains pending and is not implied by owner designation.

## System identity

- Product name: GLORIFIER
- Repository: GLORIFIER7/GLORIFIER
- Architecture: provider-neutral intelligence orchestration
- Human owner: final authority
- Core motto: "No single AI is hard-coded like the brain."

## System flow

HUMAN OWNER → AI CEO → MEDIATOR → INTELLIGENCE / GOVERNANCE / CONNECTIONS → OPPORTUNITY → EVIDENCE → AUTHORIZATION → EXECUTION → DELIVERY → ACCEPTANCE → SETTLEMENT EVIDENCE → REVENUE CONTROL PLANE → NEON LEDGER → LEARNING

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

Neon/PostgreSQL is the authoritative economic ledger.

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

Create a provider-neutral operating layer where intelligence can be substituted, capabilities can be mediated, actions can be governed, outcomes can be evidenced, and economic claims can be reconciled against authoritative external settlement evidence.
