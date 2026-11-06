# Security Policy

## Supported code

Security fixes are maintained against the latest `main` branch. No stable release series is currently declared as supported.

## Reporting a vulnerability

Do not disclose suspected vulnerabilities in a public issue, discussion, pull request, or commit.

1. Use GitHub's **Report a vulnerability** option in the repository's **Security** tab when private vulnerability reporting is available.
2. If that option is unavailable, contact the repository owner privately through [the GLORIFIER GitHub profile](https://github.com/GLORIFIER7). Do not include exploit details, credentials, personal data, or production access tokens in a public post.
3. Include the affected commit or version, the security impact, reproducible steps that do not expose real data, and any suggested mitigation.

Please allow the maintainer to investigate and coordinate a fix before public disclosure. No response-time or remediation-time SLA is currently offered.

## Secret handling

Never submit live API keys, passwords, private keys, session cookies, database URLs containing credentials, or other secrets in an issue or report. Revoke and rotate any credential that may have been exposed; deleting it from the current tree does not remove it from Git history.

## Scope

Relevant reports include authentication or authorization bypasses, policy bypasses, sensitive-data exposure, injection, unsafe external network access, request-limit bypasses, and vulnerabilities in the API or its deployment workflow.
