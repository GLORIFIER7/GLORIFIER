# GLORIFIER MDASH integration (preview)

## Verification status

The repository contains an optional workflow for manually invoking Microsoft Defender CLI / Codename MDASH. The workflow definition alone does not establish Microsoft tenant access, preview eligibility, billing authorization, or a successful scan. The integration remains **NOT VERIFIED** until its protected environment is configured and a tenant-backed run produces reviewable SARIF evidence.

Microsoft documents this capability as preview functionality. Check current requirements before provisioning or running it:

- [Codename MDASH overview](https://learn.microsoft.com/en-us/security-exposure-management/ai-code-security-overview)
- [Defender CLI installation and scan commands](https://learn.microsoft.com/en-us/security-exposure-management/defender-cli)
- [Defender CLI authentication for CI/CD](https://learn.microsoft.com/en-us/security-exposure-management/defender-cli-authentication)
- [Microsoft's GitHub Actions CI/CD example](https://learn.microsoft.com/en-us/security-exposure-management/defender-cli-cicd)
- [Microsoft Foundry setup for MDASH](https://learn.microsoft.com/en-us/security-exposure-management/mdash-foundry-integration)

## Workflow safety model

The workflow `.github/workflows/mdash-agentic-security.yml`:

1. Runs only from `workflow_dispatch`, only on `main`, and only when the operator explicitly sets `authorize_source_upload=true` for that run.
2. Uses the GitHub Actions environment `mdash-security`. Configure that environment to allow deployments from `main` only and require an authorized reviewer before approving access to its secrets.
3. Grants only `contents: read` and `security-events: write`. It does not request the unused `id-token: write` permission.
4. Reads Microsoft Entra credentials only from secrets in the protected environment.
5. Downloads the Defender CLI from Microsoft's documented distribution endpoint and checks its SHA-256 digest against the separately configured `DEFENDER_CLI_SHA256` environment variable before making the binary executable or running it.
6. Uses Microsoft's documented baseline `standard` model profile, waits for the scan job, validates SARIF 2.1.0, retains the SARIF file for seven days, and publishes findings to GitHub code scanning.
7. Suppresses raw CLI output to avoid writing unexpected credential material to Actions logs. On interruption or scan failure after a job ID is known, it makes a bounded best-effort cancellation request.
8. Does not invoke `defender fix`, write to repository files, create branches or pull requests, push commits, deploy, or merge.

**Important integrity limitation:** Microsoft's public Defender CLI installation page documents a mutable `latest` download URL but does not publish a checksum or signature alongside that download. Do not calculate the expected digest from the same unauthenticated download and treat that as verification. Obtain the digest through a separately trusted Microsoft publishing or support channel. Until that is available and configured, the workflow deliberately fails closed and no binary is executed.

## Source transfer and cost

The scan submits repository source code to Microsoft's service. Source content can include secrets, customer data, or other restricted material; review and approve the exact repository contents before dispatching a scan. Model capacity or related Azure charges may apply. Microsoft notes that cancelling an in-progress scan does not refund tokens already consumed. A skipped or blocked job means no scan was submitted.

A completed scan is not evidence that the repository is vulnerability-free. Review all findings and their supporting locations and evidence.

## Microsoft prerequisites

Before enabling a run:

- Confirm that Codename MDASH preview is available and enabled for the relevant Microsoft Defender tenant and region.
- Complete the Defender Code enterprise-application and Microsoft Entra app-registration steps in Microsoft's current onboarding documentation.
- Grant the documented application permissions and admin consent required for Defender CLI scanning and result upload.
- Configure any Microsoft Foundry model deployment and capacity required by the current MDASH onboarding documentation.
- Obtain approval to transfer this repository's source and consume any model or Azure capacity.

Do not rely on a hard-coded region or eligibility list from this repository. Confirm current availability directly with Microsoft.

## GitHub environment configuration

Create the GitHub Actions environment named `mdash-security` in repository settings. Configure its deployment branch policy to allow `main` only and set required reviewers according to the repository's security policy.

Add these **environment secrets** (not repository-level or broadly shared organization secrets):

| Environment secret | Purpose |
| --- | --- |
| `DEFENDER_ASPM_TENANT_ID` | Microsoft Entra directory / tenant ID |
| `DEFENDER_ASPM_CLIENT_ID` | Microsoft Entra application / client ID |
| `DEFENDER_ASPM_CLIENT_SECRET` | App-based Defender CLI authentication secret |

Add this **environment variable**:

| Environment variable | Purpose |
| --- | --- |
| `DEFENDER_CLI_SHA256` | 64-character hexadecimal SHA-256 digest obtained from a separately trusted Microsoft source for the exact CLI binary being downloaded |

Never commit credentials, put them in source files, or print them in workflow logs. Rotate the client secret according to the organization's credential policy. Update the digest when Microsoft changes the distributed binary, using a separately authenticated and trusted digest source.

If any required secret is absent, the digest is missing or malformed, or the digest does not match the downloaded binary, the job stops before executing the CLI.

## Running a scan

1. Confirm current Microsoft preview eligibility, tenant permissions, model capacity, costs, and source-transfer approval.
2. Review the repository contents and remove or protect restricted data before authorizing upload.
3. Ensure the `mdash-security` environment, reviewer policy, secrets, and independently obtained digest are configured.
4. In GitHub Actions, select **GLORIFIER MDASH Agentic Code Security (Preview)** and run it from `main`.
5. Set `authorize_source_upload` to true only for the explicitly approved run.
6. Review the run, seven-day SARIF artifact, and GitHub code-scanning findings.

The default model profile is `standard`. The MAI-augmented `mai-cyber` profile is not enabled by this workflow.

## Evidence labels

Use the repository's evidence vocabulary consistently:

- **NOT VERIFIED** — no tenant-backed scan evidence exists, or required onboarding and protected environment configuration have not been established.
- **NOT OBSERVABLE** — a tenant, billing, eligibility, or external service state cannot be observed from repository CI evidence.
- **DEGRADED** — an authorized run was attempted but authentication, integrity verification, scan completion, SARIF validation, artifact retention, or publication failed.
- **PARTIALLY VERIFIED** — static workflow contract checks or syntax checks passed, but a real tenant-backed scan has not been independently completed.
- **VERIFIED** — one identified run proves CLI completion, SARIF validation, artifact retention, and successful code-scanning publication. This label applies only to those pipeline steps and that run.
- **FULLY VERIFIED** — do not use for this integration based solely on a successful scan workflow; it would require independent verification of the full tenant, security, billing, and operational claims.

Do not report MDASH as active, tenant-connected, or successfully scanning without current evidence from a real authorized run. Do not equate scan completion with a clean vulnerability assessment.
