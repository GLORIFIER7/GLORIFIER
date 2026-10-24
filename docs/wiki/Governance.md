# Governance

## Authority
Human owners retain final authority over consequential actions. Agents may inspect, analyze, draft, test, and propose changes within granted permissions; they must not silently expand their authority.

## Approval required
Obtain explicit human approval before:
- merging consequential code changes when approval has not been given;
- deploying or changing production infrastructure;
- creating, rotating, or exposing secrets and privileged credentials;
- spending funds, paying gas, minting assets, or committing to paid services;
- irreversible blockchain actions or changes to ownership and access.

## Agent operating rules
- Least privilege and task-scoped access.
- No self-approval of risky actions.
- No claim of completion without observable evidence.
- Preserve logs and reviewable diffs for material changes.
- Stop and request clarification when scope, ownership, or financial consequences are unclear.

## Decision records
For important decisions, record the date, scope, alternatives, approving human, implementation reference, and verification evidence. Never include secret values or unnecessary personal data.