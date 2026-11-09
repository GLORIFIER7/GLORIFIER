# Octopus Deploy integration

GitHub Actions remains the CI authority. The GLORIFIER-owned Octopus Cloud instance coordinates releases and executes deployments.

## Workflow behavior

The Octopus Deploy workflow:
- Starts automatically only after the **CI** workflow completes successfully for a push to main, including its image-publishing job.
- Can also be started manually from main.
- Does not deploy pull requests, failed CI runs, scheduled CI runs, or manual CI runs.
- Creates a release, deploys it to one configured Octopus environment, and waits for the deployment task to finish.
- Runs only when the repository Actions variable `OCTOPUS_ENABLED` is exactly `true` and the required project/environment variables are present. Manual dispatch is also gated at the job level and is accepted only from `main`.
- Checks the Octopus service-account ID from the `octopus-deploy` Environment secret before requesting an OIDC token.
- Uses GitHub OIDC and a dedicated Octopus service account; no long-lived Octopus API key is stored in GitHub.

The workflow pins the official Octopus GitHub Actions to commit SHAs. It does not bypass branch protection, merge pull requests, or modify repository rulesets.

## One-time setup

1. In https://glorifier.octopus.app, create a dedicated service account for this repository. Restrict it to this repository's Octopus Space, Project, and deployment Environment. Do not reuse the GLORIFIER service account.
2. On that service account, create an OpenID Connect identity with issuer type **GitHub Actions**. Use this exact GitHub subject:

   `repo:GLORIFIER7/GLORIFIER-NEURAL:environment:octopus-deploy`

   Let Octopus provide the required audience and remaining identity settings. Do not broaden the subject to all repositories or refs.
3. In GitHub, create the repository Environment named **octopus-deploy** and restrict it to the **main** branch. Add required reviewers or other environment protections only when required by the deployment policy.
4. In the GitHub `octopus-deploy` Environment, add the environment **Secret** `OCTOPUS_SERVICE_ACCOUNT_ID` containing the dedicated Octopus service-account ID. Keep this ID out of repository variables and workflow logs.
5. Add these repository Actions **Variables**:

   | Variable | Value |
   |---|---|
   | OCTOPUS_ENABLED | Set to `true` only after the Octopus project, target and OIDC trust are configured |
   | OCTOPUS_SPACE | Exact Octopus Space name |
   | OCTOPUS_PROJECT | Exact Octopus Project name |
   | OCTOPUS_ENVIRONMENT | Exact single target Environment name; commas, CR, and LF are rejected |
   | OCTOPUS_CONFIG_AS_CODE | `true` only if the Octopus Project configuration is stored in Git; otherwise `false` or unset |

6. Create and configure the Octopus Project deployment process, package feeds, deployment targets, variables, and lifecycle. For Config as Code, connect the project to its source repository through Octopus's GitHub connection and align its default branch with main.

## Deployment boundary

NEURAL CI builds the container image in its test matrix. On a push to `main`, the Python 3.12 test job exports that exact image as a short-lived Actions artifact. The `publish-container` job runs only after the full test matrix succeeds, downloads the tested image without rebuilding it, and publishes it to GitHub Container Registry using a unique tag `ghcr.io/glorifier7/glorifier-neural:0.0.0-<full-commit-sha>-<workflow-run-id>-<run-attempt>`. Including the workflow run ID and attempt prevents a retry of the same source commit from overwriting the image selected by an earlier verified run. The Octopus workflow verifies the matching CI run and image-publishing step for both automatic and manual deployments: automatic runs use their triggering workflow-run ID, while manual dispatch searches successful `CI` push runs for the exact current `main` SHA and fails closed if no matching published image is found. Both release paths derive their exact `package_version` from the verified CI run ID and `run_attempt`, and refuse to create a release if either is absent or invalid. Configure an Octopus Docker/OCI feed for `ghcr.io/glorifier7/glorifier-neural`; make the package public for anonymous pull access or configure a read-only GHCR credential in the Octopus feed settings. Do not configure the deployment process to resolve `latest`. Preflight also compares the triggering source SHA with the current `main` head and refuses stale CI completions before OIDC authentication.

A successful CI run or created release is not proof that the live application is healthy. The workflow waits for the Octopus deployment task result; a separate post-deployment application health check is still required.

Verify the first deployment against a non-production target before setting OCTOPUS_ENVIRONMENT to production. Confirm artifact provenance, rollback behavior, target permissions, and operational costs before enabling recurring production deployments.

## Evidence states

- **Not configured:** required repository variables or the Octopus OIDC identity are missing; automatic deployment is skipped or manual preflight fails.
- **Configured:** variables and identity exist; this is not proof of successful deployment.
- **Deployment verified:** the Octopus task finishes successfully for the intended release and environment.
- **Application health verified:** an independent post-deployment health check succeeds. This workflow does not claim this state.
