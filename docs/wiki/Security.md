# Security

## Baseline controls
- Enforce authentication and server-side authorization on protected endpoints.
- Deny by default; validate inputs and constrain outputs.
- Store credentials only in approved secret stores and use separate credentials per environment.
- Rotate credentials after suspected exposure and revoke unused integrations.
- Keep dependencies updated and review CodeQL, dependency, secret-scanning, and supply-chain alerts.
- Use rate limits, bounded request sizes, timeouts, and safe error messages.
- Avoid logging tokens, private keys, personal data, full authorization headers, or sensitive request bodies.

## Verification
For each protected route, test unauthenticated access, authenticated-but-unauthorized access, valid authorized access, malformed input, and dependency failure. Record expected and observed status codes and response contracts.

## Incident handling
1. Contain exposure or disable the affected integration.
2. Revoke or rotate compromised credentials.
3. Preserve relevant logs and identify affected environments.
4. Patch through a reviewed change and run regression checks.
5. Verify recovery with live evidence and document follow-up actions.

Passing automated scans reduces specific risks; it is not proof that the whole system is secure.