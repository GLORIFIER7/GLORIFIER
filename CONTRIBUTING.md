# Contributing to GLORIFIER

Thank you for contributing.

## Before you start

1. Read the [Code of Conduct](CODE_OF_CONDUCT.md).
2. Search existing issues and pull requests before opening a new one.
3. For security vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
4. Never commit secrets or credentials.

## Development principles

Contributions should preserve these project principles:

- Human authority remains the highest authority.
- Providers are replaceable; GLORIFIER should remain provider-neutral.
- Authorization and authentication are separate from governance and evidence.
- No evidence means **UNKNOWN / NOT VERIFIED**.
- Component failure must produce truthful degraded/error behavior, not fabricated success.
- No automatic irreversible production changes.
- No automatic financial transfers.
- No access-control, quota, authentication, or provider-policy bypass.
- Least privilege and observable behavior are preferred.
- Changes affecting economic state, credentials, authorization, or production execution require explicit review.

## Pull requests

A good pull request should:
- Explain what changed and why.
- Identify affected modules, providers, APIs, or workflows.
- Include tests or a clear explanation of why tests are not applicable.
- Document security, privacy, migration, and operational implications.
- Avoid unrelated refactors.
- Preserve existing governance and verification boundaries.

## Evidence and verification

Do not mark functionality as verified merely because it is configured or reachable.

Where applicable, distinguish:
- configured vs authenticated
- authenticated vs successfully executed
- estimated vs externally evidenced
- market/account data vs verified ownership
- expected behavior vs observed production behavior

## Commit and review hygiene

Keep commits focused and descriptive. Reviewers should be able to understand the change from the diff and its tests.

Maintainers may request changes when a contribution weakens security, governance, evidence integrity, or truthful failure handling.
