# Security Policy

## Supported versions

Security fixes are prioritized for the actively maintained default branch and supported production releases.

## Reporting a vulnerability

**Do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Use GitHub's private security reporting mechanism for this repository when available. Include:
- A concise description of the vulnerability.
- Affected component, endpoint, workflow, or dependency.
- Reproduction steps or a minimal proof of concept.
- Security impact and realistic attack conditions.
- Any suggested mitigation, if known.

Please do not include real credentials, API keys, private tokens, financial credentials, or unnecessary personal data in a report.

If private reporting is unavailable, contact the repository maintainer through a private GitHub channel before disclosing exploitable details publicly.

## High-risk areas

Extra care is required for changes involving:
- Authentication and authorization.
- Provider credentials and secret handling.
- Binance or other financial integrations.
- Payment and revenue verification.
- Agent-to-agent task authorization.
- Production deployment and CI/CD.
- Database migrations and persistent evidence.
- Credential rotation.
- Webhooks and externally triggered execution.

## Security principles

GLORIFIER must not:
- bypass authentication, authorization, quotas, or provider restrictions;
- expose secrets in logs, client bundles, tests, or committed files;
- treat configuration as proof of successful authenticated execution;
- fabricate evidence, payments, balances, ownership, or revenue;
- perform automatic irreversible financial transfers.

When a component cannot be safely verified, the system should report the appropriate unknown/degraded state.
