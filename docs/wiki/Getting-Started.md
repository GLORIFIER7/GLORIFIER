# Getting Started

## For contributors
1. Open the [GLORIFIER repository](https://github.com/GLORIFIER7/GLORIFIER).
2. Read the root README, contribution instructions, and applicable security policy before changing code.
3. Create a focused branch and make the smallest testable change.
4. Run the checks documented by the repository and inspect the complete diff.
5. Open a pull request with the problem, change, test evidence, risks, and rollback notes.
6. Wait for required checks and review. Do not bypass branch protection or assume that a green build authorizes a production release.

## For operators
- Confirm which environment and revision are under review.
- Check provider and database configuration without printing secret values.
- Run health and authentication-boundary probes.
- Record timestamps, endpoint paths, HTTP status codes, and redacted results.
- Escalate missing evidence rather than reporting a successful verification.

## Mobile-first note
When operating from Android, use GitHub's web interface for review and authorization. Do not paste private keys, recovery phrases, API tokens, or database credentials into issues, pull requests, chat, or Wiki pages.