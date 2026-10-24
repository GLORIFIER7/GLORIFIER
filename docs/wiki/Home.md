# GLORIFIER Wiki

**Committed to Glorify, Passion to Evangelize**  
**Purpose • Stewardship • Service • Integrity**

> Evidence Proves. AI Synthesizes.

This documentation is a repository-hosted Wiki mirror while the GitHub Wiki itself awaits first-page initialization. It describes intended architecture and operating policy without treating plans as deployed facts.

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
Use least privilege. Keep credentials and private data out of documentation. Use pull requests for code changes, review diffs and required checks, and obtain explicit human authorization before consequential merges, production deployments, secrets changes, or financial commitments.