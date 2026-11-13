# GLORIFIER Wiki

**Committed to Glorify, Passion to Evangelize**  
**Purpose • Stewardship • Service • Integrity**

> Evidence Proves. AI Synthesizes.

This directory contains the repository-managed Markdown source documents for the published [GLORIFIER GitHub Wiki](https://github.com/GLORIFIER7/GLORIFIER/wiki). These files support review, version history, and synchronization with the live Wiki. Documentation describes architecture and operating policy; it is not proof that every capability is deployed or operational.

## Start here

- [Architecture](Architecture.md)
- [Getting Started](Getting-Started.md)
- [Governance](Governance.md)
- [Security](Security.md)
- [Deployment and Operations](Deployment-and-Operations.md)
- [Evidence and Verification](Evidence-and-Verification.md)
- [Data and Integrations](Data-and-Integrations.md)
- [Releases and Change Control](Releases-and-Change-Control.md)

## Status vocabulary

- **FULLY VERIFIED** — all defined checks for the stated scope passed with current evidence.
- **VERIFIED** — the specific claim was confirmed by stated evidence.
- **PARTIALLY VERIFIED** — some checks passed; material checks remain.
- **NOT VERIFIED** — sufficient evidence has not been collected.
- **DEGRADED** — an observed function is failing or below its requirement.
- **NOT OBSERVABLE** — available access does not expose evidence needed to determine status.

A passing CI run does not independently prove production deployment, authentication correctness, provider availability, database parity, or uptime.

## Safety and change policy

Use least privilege. Keep credentials and private data out of documentation. Use pull requests for code changes, review diffs and required checks, and obtain explicit human authorization before consequential production changes, secrets changes, irreversible actions, or financial commitments.

Keep this directory and the [published Wiki](https://github.com/GLORIFIER7/GLORIFIER/wiki) aligned when documentation changes.
