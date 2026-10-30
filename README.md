# GLORIFIER

**The governed intelligence layer for AI-powered businesses.**

**Official organization motto: _Committed to Glorify, Passion to Evangelize_**

> **The native economic unit for governed AI-agent commerce.**

GLORIFIER is a provider-neutral AI orchestration platform for coordinating models, agents, tools, data, and compute through a governed control plane. Intelligence providers can change; identity, authority, policy, evidence, and human approval remain explicit.

[Repository](https://github.com/GLORIFIER7/GLORIFIER) · [Issues](https://github.com/GLORIFIER7/GLORIFIER/issues) · [Security policy](SECURITY.md) · [Support](SUPPORT.md)

## At a glance

- **Provider-neutral AI orchestration** — connect eligible models and tools without treating one model as the system's permanent brain.
- **Governed execution** — use identity, least privilege, policy checks, authorization, and human approval for consequential actions.
- **Evidence-first operations** — distinguish verified observations from assumptions. Missing evidence means **UNKNOWN / NOT VERIFIED**, never automatic success.
- **Honest provider failover** — account for availability, capability, authentication, quotas, latency, and authorization; report failure when no eligible provider is available.
- **Persistent coordination** — make workflows, state, and outcomes observable and reviewable.
- **Interoperability** — build toward governed handoffs between AI agents, Web2 services, tools, and supported blockchain networks.

## Governance model

```text
Human Owner (highest authority)
        |
GEAS / Governance Control Plane
(identity · policy · permissions · approvals)
        |
AI Orchestration and Specialist Agents
        |
Governed Actions / External Providers / Services
        |
Evidence, Reconciliation, and Outcome Review
```

The human owner retains final authority. High-impact or irreversible production changes, asset transfers, trading, and credential rotation require the appropriate explicit authorization and safeguards. An unobserved outcome is not considered verified.

## Architecture

The repository includes a web application, API/server code, AI-provider integrations, governance components, and blockchain-related contracts and evidence records.

**Target deployment shape:** Cloudflare Workers serves the public frontend and all application/API/auth execution; Vercel and Railway are to be removed as production dependencies after route-by-route migration and verified cutover. **Current migration status:** incomplete. The Worker now handles `GET /api/identity` natively on the migration branch; other API/auth routes still depend on the legacy Railway upstream. The existing Worker build/test workflow can pass without proving a production deployment. See [Cloudflare Workers-only migration plan](docs/architecture/cloudflare-workers-only-migration.md) for evidence, route inventory, and release gates. Do not treat the target architecture as the current production state until the Cloudflare deployment and critical API/auth/data flows are verified.

**Runtime requirement:** Node.js `24.12.0` or newer is required for the application runtime. The production images and application workflows use Node.js 24 to match the locked Firebase dependency engines.

The repository also uses technologies including React, TypeScript, Node.js, Firebase, PostgreSQL, and GitHub Actions. Actual capabilities depend on configuration, credentials, provider quotas, and runtime health. Confirm the relevant deployment and workflow evidence before describing a service as live or healthy.

## GLORIFIER Token (GLR)

GLR is intended to be the native economic unit for governed AI-agent commerce. Each network deployment must be assessed using its own chain-specific evidence.

- **Asset name / symbol:** GLORIFIER / GLR
- **Ethereum ERC-20 decimals:** 18
- **EVM supply target:** 1,000,000,000 GLR
- **Solana Token-2022:** uses a separate network-specific mint and 9-decimal representation; addresses and decimals are not interchangeable across chains.
- **Independent checks:** deployment, explorer/contract verification, metadata publication, and registry reconciliation are separate requirements.

See the [canonical asset registry](docs/canonical-asset-registry.md) and [contracts documentation](contracts/README.md) for the current recorded evidence. Do not infer that every network or cross-chain integration is verified because one deployment or workflow passed.

## Security and reliability principles

1. Human authority and explicit authorization remain in force.
2. Apply least privilege; do not bypass authentication, provider access controls, or quotas.
3. Keep secrets, private keys, and credentials out of source control and logs.
4. Use evidence-backed status labels: **FULLY VERIFIED**, **VERIFIED**, **PARTIALLY VERIFIED**, **NOT VERIFIED**, **DEGRADED**, and **NOT OBSERVABLE**.
5. A passing workflow proves only what that workflow tested for its specific commit; it does not prove all production services are healthy.
6. Never claim a change merged, a deployment live, a provider operational, or an asset verified without checking current evidence.

See [SECURITY.md](SECURITY.md) for reporting security concerns.

## Getting started

Requirements: Node.js `24.12.0` or newer and npm. From a checkout of this repository:

```bash
npm ci
npm run build
```

Useful scripts declared in `package.json` include:

| Command | Purpose |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build the frontend and compiled server bundle |
| `npm run lint` | Run the TypeScript no-emit check |
| `npm run test:architecture` | Run the architecture-core test |
| `npm run test:geas-all` | Run the configured GEAS reconciliation, enterprise-controls, and scientist tests |
| `npm run validate:geas-architecture` | Validate GEAS architecture requirements |
| `npm run scan:geas-architecture` | Run the GEAS architecture scan |

Some scripts may require environment variables, credentials, external services, or additional setup. Check `package.json` and the relevant documentation before running specialized tests.

## Docker image

- [Docker Hub image repository](https://hub.docker.com/r/glorifier/glorifier)
- [Container build, health check, security scan, and release policy](docs/dockerhub-release.md)

The Docker publishing workflow is gated by successful `GLORIFIER CI` on a push to `main`, followed by a Trivy scan before Docker Hub login and publishing. Configure the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` repository secrets before a release can publish. A successful build is not proof that a production deployment is running or healthy.

## Documentation

- [Governed AI and GLR economic layer](docs/GLORIFIER-GOVERNED-AI-ECONOMIC-LAYER.md)
- [Official motto and organizational architecture](docs/official-motto-and-organizational-architecture.md)
- [Documentation directory](docs/)
- [AI community platform architecture: GitHub + Stack Overflow for AI](docs/ai-community-platform-architecture.md)
- [ASAP Protocol integration boundary and acceptance gates](docs/architecture/asap-protocol-integration.md)
- [Linux- and Web-inspired architecture](docs/linux-web-inspired-architecture.md)
- [SAP-inspired enterprise operations architecture](docs/sap-inspired-enterprise-operations-architecture.md)
- [Canonical GLR asset registry](docs/canonical-asset-registry.md)
- [Tokenomics](docs/tokenomics.md)
- [Hybrid multichain money architecture](docs/glr-hybrid-multichain-money.md)
- [Token launch checklist](docs/token-launch-checklist.md)
- [Smart contracts](contracts/README.md)
- [Contributing guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Support guide](SUPPORT.md)

## Project objective

Build reliable, provider-neutral intelligence orchestration where governance constrains actions, evidence supports claims, and economic settlement follows verifiable outcomes.

**GLORIFIER — intelligence orchestration with governed execution and truthful evidence.**
