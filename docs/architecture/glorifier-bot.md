# GLORIFIER Bot

**Purpose:** repository-maintenance automation inspired by Dependabot, with GLORIFIER branding and GEAS safety boundaries.

## Current implementation

- The **Locked Dependency Guardian** runs on pull requests targeting `main` that change its workflow, Dependabot configuration, or npm manifests/lockfile, and on a weekly schedule or manual dispatch.
- It validates the event's checked-out ref using `npm ci --ignore-scripts --no-audit`, `npm audit`, the repository type-check, and the build. Checkout does not persist the GitHub token in the local Git configuration. The workflow has read-only repository permissions and does not resolve new package versions or write to the repository.
- The historical workflow and job check-run labels are retained for compatibility with any existing branch rules. The job label still says “Prepare and test safe dependency refresh,” but the implemented workflow is validation-only and performs no dependency refresh.
- GitHub's native Dependabot is the update mechanism for npm and GitHub Actions. It checks both ecosystems weekly and proposes reviewable pull requests with dependency and security labels.
- The guardian uses the committed `package-lock.json`; a manifest/lockfile mismatch fails at `npm ci`. This statement applies to the guardian workflow only: other CI workflows must be assessed independently, and this change does not establish lockfile-only installation across every repository workflow.
- The bot does not auto-merge, deploy, modify secrets, transfer assets, trade, rotate credentials, or delete production data.
- Dependabot and other pull requests remain subject to repository checks and human review.

## Identity limitation

The validation workflow creates no pull request and does not claim a custom bot identity. Native Dependabot pull requests are attributed to GitHub's Dependabot bot. A separate GLORIFIER GitHub App can only author pull requests after the app has been installed with narrowly scoped permissions and its installation token has been verified; the workflow must not spoof identity by setting a commit author name.

## Optional future GLORIFIER App integration

A future, separately reviewed workflow may use a real GLORIFIER GitHub App for a narrowly scoped PR-only task. Until then, the dependency guardian does not read app credentials or mint installation tokens. Any such workflow must:

1. Install the app only on the intended repository.
2. Grant only the permissions required for that task (normally Contents and Pull requests); avoid Administration, Secrets, Deployments, and broad organization permissions.
3. Store the app ID as a repository variable and the PEM as a repository secret.
4. Mint a repository-scoped installation token at the last possible step; never commit or print the private key.
5. Create draft pull requests only. Merging, deployment, secret changes, paid actions, transfers, and production data changes require separate owner approval.

## Safety and acceptance criteria

- Dependency updates are proposed through native Dependabot pull requests; the committed lockfile is authoritative for this guardian's install and validation.
- The scheduled/manual/PR guardian validates the selected ref without mutating dependency files.
- Dependency updates do not auto-merge or deploy production.
- Major-version upgrades remain subject to separate review.
- Report a custom GLORIFIER bot identity as **NOT VERIFIED** until a real app-authored action is independently observed.

## Branding

The original GLORIFIER Bot vector mark is in `assets/glorifier-bot.svg`. It is source artwork for adaptation; GitHub profile/app upload requirements may require exporting a PNG.
