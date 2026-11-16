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


## Milestone: YOLO owner-delegated maintenance (2026-11-08)

**“You want it? You merge it.”** GLORIFIER recorded the owner's delegation of routine, low-risk maintenance decisions to its maintenance operator. This is bounded authority: changes still require their applicable tests, successful required checks, review and branch-protection gates. Security, privacy, legal, financial, credential, destructive, and production-release decisions remain subject to explicit human approval.

The milestone was merged into `main` in [PR #742](https://github.com/GLORIFIER7/GLORIFIER/pull/742). Read the [full historical record](docs/ops/merge-delegation-milestone-2026-11-08.md).

## Architecture

The repository includes a web application, API/server code, AI-provider integrations, governance components, and blockchain-related contracts and evidence records.

**Agentic workflow governance:** The [GitHub Agentic Workflows adoption assessment](docs/architecture/github-agentic-workflows-adoption.md) records the selectively adopted gh-aw patterns and the conditions required before activating its runtime. The repository policy overlay is at [`.github/aw/instructions.md`](.github/aw/instructions.md); it does not install or activate gh-aw.

**NEURAL service:** The Python/FastAPI service is maintained in this repository at [`services/neural/`](services/neural/README.md). It retains its own Python dependency lock, tests, Docker build context and independently deployable Cloudflare Worker. GLORIFIER remains the governance/control plane; NEURAL remains a separately deployable execution service. See [the NEURAL integration contract](docs/architecture/neural-engine-integration.md).

**Target deployment shape:** Cloudflare Workers serves the public frontend and all application/API/auth execution; Vercel and Railway are to be removed as production dependencies only after route-by-route migration and verified cutover. **Current migration status:** incomplete. On `main`, the Worker handles `GET /api/identity` natively in `src/worker.ts`; that route reads Cloudflare environment bindings and does not call an upstream backend. Other backend-dependent API/auth routes are not yet Worker-native and fail closed with `503` unless a separately reviewed HTTPS backend origin and exact-host allowlist are configured. The existing Worker build/test workflow can pass without proving a production deployment. See [Cloudflare Workers-only migration plan](docs/architecture/cloudflare-workers-only-migration.md) for evidence, route inventory, and release gates. Do not treat the target architecture as the current production state until the Cloudflare deployment and critical API/auth/data flows are verified.
