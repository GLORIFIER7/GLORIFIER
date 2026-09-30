# GEAS Enterprise Architecture Controls

Version: GEAS-EC-1.0

This layer operationalizes the architecture review while preserving human authority over irreversible production changes.

- Deployment provenance: production verification requires the observed commit SHA to equal the expected commit SHA.
- Governed actions: consequential actions carry context, capability, resource, authority envelope, policy version, risk, reversibility and payload hash.
- Human approval: irreversible actions require an approval bound to the exact action hash; approvals expire and can be revoked.
- Evidence truth: missing, stale or contradicted evidence cannot produce VERIFIED state.
- Provider truthfulness: provider exhaustion, authentication failure, unavailable capability and unverified results have explicit machine-readable failure codes.
- OpenTelemetry alignment: GLORIFIER-specific attributes use the glorifier.* namespace while standard OTel conventions remain authoritative for common signals.
- Unit economics: estimated value and verified value are separate; cost-per-verified-outcome is calculated only from verified outcomes.
- Reconciliation: intended, deployed, observed, approved-exception and executed-outcome remain distinct truth states.

Release verification must include deployment provenance, authentication, authorization, fresh authoritative evidence and passing E2E proof.

These controls do not autonomously change Vercel, Railway, Neon, credentials, financial accounts, trading permissions, withdrawals or other irreversible external systems.
