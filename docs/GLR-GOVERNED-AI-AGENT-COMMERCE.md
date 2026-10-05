# GLORIFIER (GLR): Governed AI-Agent Commerce

## Canonical positioning

**GLORIFIER (GLR)**  
**The native economic unit for governed AI-agent commerce.**

GLORIFIER is building economic infrastructure for the machine-to-machine economy:

> AI intelligence produces actions; governance controls those actions; evidence proves the outcomes; GLR provides the economic settlement layer.

## Architecture

```text
Human Authority
      |
AI CEO / Mediator
      |
Agent Identity + Capability Policy + Budget
      |
A2A Task / Work Unit
      |
GLR Payment Intent
      |
Human Authorization
      |
Governed Execution
      |
External Settlement Rail
      |
Authoritative Evidence / Verification
      |
GLR Settlement + Economic Receipt
      |
Revenue / Reconciliation / Reputation
```

### Separation of concerns

- **Intelligence** decides or proposes what could be done.
- **Governance** determines what is permitted.
- **Identity and capability policy** determine which agent may perform an action.
- **GLR** represents the economic obligation/settlement unit.
- **Execution connectors** perform authorized work.
- **Evidence** proves what actually happened.
- **External verification** establishes authoritative economic truth.
- **Revenue Control Plane** reconciles verified outcomes.

## Truth model

| State | Meaning |
|---|---|
| PROPOSED | Economic intent exists; no authorization or settlement claim. |
| AUTHORIZED | Human authorization exists; execution/settlement is not proven. |
| COMMITTED | Authorized execution commitment exists; settlement is not proven. |
| EVIDENCE_PENDING | Settlement references exist, but authoritative verification is incomplete. |
| SETTLED | Authoritative external verification confirms settlement. |
| REJECTED | Governance rejected the intent. |
| EXPIRED | Intent expired before settlement. |

Truth labels:

- `NOT VERIFIED`
- `EVIDENCE-BACKED`
- `VERIFIED`


## Authority boundary

GLR does **not** grant an AI agent:

- identity
- capability
- API permission
- wallet authority
- policy bypass
- permission to trade, withdraw, redeem, or move funds

Possession of GLR is an economic fact, not an authorization credential.

## Settlement rails

The architecture is rail-neutral:

- EVM
- Solana
- GLORIFIER internal ledger
- authorized external settlement systems

A network becomes VERIFIED only when its authoritative settlement evidence is independently observed and recorded.

## Implementation surfaces

- `src/lib/glr-economic-layer.ts` — payment intents, authorization, commitment, evidence and settlement state machine.
- `src/lib/agent-runtime.ts` — GLR-aware agent orchestration policy.
- `src/lib/glorifier-mediator.ts` — GLR economic mediation topology and authority boundary.
- `src/lib/revenue-control-plane.ts` — GLR settlement/reconciliation visibility.
- `server.ts` — authenticated GLR economic API.
- `src/lib/glr-economic-layer.test.ts` — invariants for precision, authorization and truthful settlement.
- `/api/economy/glr/policy` — canonical policy.
- `/api/economy/glr/snapshot` — economic-state snapshot.
- `/api/economy/glr/intents` — payment-intent lifecycle API.

## Explicit non-goals

This layer does not:

- mint or burn GLR;
- custody private keys;
- silently move user funds;
- perform autonomous trading;
- perform autonomous withdrawal or redemption;
- turn estimates into verified revenue;
- claim a token deployment is on-chain without independent evidence.

## Product principle

GLR is not being positioned as a generic payment token. Its architectural purpose is to connect **agent work, governance, evidence and economic settlement** into one auditable machine-to-machine commerce loop.