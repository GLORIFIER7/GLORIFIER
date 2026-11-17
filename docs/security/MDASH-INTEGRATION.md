# GLORIFIER MDASH integration (preview)

## Status

This repository contains an **optional, manually invoked Defender CLI integration** for Microsoft Codename MDASH. Adding the workflow does not onboard a Microsoft tenant, provision Azure resources, grant Microsoft permissions, run a scan, or establish that MDASH access is available. Treat the capability as **NOT CONFIGURED** until a real tenant-backed scan completes.

Microsoft documents Codename MDASH and the Defender CLI as preview capabilities. Review the current Microsoft documentation and tenant eligibility before enabling this integration:

- [Codename MDASH overview](https://learn.microsoft.com/en-us/security-exposure-management/ai-code-security-overview)
- [Defender CLI installation and scan commands](https://learn.microsoft.com/en-us/security-exposure-management/defender-cli)
- [Defender CLI authentication for CI/CD](https://learn.microsoft.com/en-us/security-exposure-management/defender-cli-authentication)
- [Microsoft's GitHub Actions CI/CD example](https://learn.microsoft.com/en-us/security-exposure-management/defender-cli-cicd)
- [Microsoft Foundry setup for MDASH](https://learn.microsoft.com/en-us/security-exposure-management/mdash-foundry-integration)

## Safety model

The workflow `.github/workflows/mdash-agentic-security.yml`:

1. Runs only through `workflow_dispatch`; it is not triggered by pushes, pull requests, or a schedule.
2. Defaults the explicit `authorize_source_upload` input to `false`. A maintainer must deliberately enable it for each scan.
3. Checks for the required Microsoft Entra secrets without printing their values.
4. Uses Microsoft's Defender CLI to submit the baseline `gpt-general-profile` scan, waits for the job, and validates the returned SARIF structure.
5. Retains SARIF as a seven-day GitHub Actions artifact and uploads findings to GitHub code scanning.
6. Does not invoke `defender fix`, change repository files, create branches or pull requests, push commits, deploy, or merge.

**Source and cost warning:** Defender CLI archives and submits repository source code to Microsoft's agentic scanning service. MDASH uses provisioned model capacity; model or Azure charges may apply. Microsoft notes that cancelling a running scan does not refund tokens already consumed. Review the files in the repository for secrets, customer data, or other restricted content before authorizing a scan. Do not use this integration until source transfer and cost have been approved.

A skipped job means no scan was submitted. A successful CLI scan is not proof that the repository is vulnerability-free. Review every finding and its evidence.

## Microsoft prerequisites

Before configuring this workflow:

- Confirm that Codename MDASH preview is enabled for the Microsoft Defender tenant and that the tenant's commercial-cloud region is supported.
- Complete the Microsoft Defender Code enterprise-application and Entra app-registration steps in Microsoft's onboarding guide.
- Grant the documented Microsoft Defender Code application permissions and admin consent. Microsoft documents `AIScan.enabled` for running AI scans and `AIScan.Upload` for uploading scan results.
- Configure the Microsoft Foundry model deployments and capacity required by the MDASH onboarding guide, if required for the tenant.
- Confirm that the organization approves sending this repository's source code to the Microsoft service.

The Microsoft documentation's published region list is limited; it currently names US, EU, UK, Australia, India, Switzerland, and UAE (UAE CLI scans only). Confirm current availability with Microsoft before provisioning anything.

## GitHub Actions configuration

Add these repository or organization Actions secrets:

| Secret | Purpose |
| --- | --- |
| `DEFENDER_ASPM_TENANT_ID` | Microsoft Entra directory/tenant ID |
| `DEFENDER_ASPM_CLIENT_ID` | Microsoft Entra application/client ID |
| `DEFENDER_ASPM_CLIENT_SECRET` | Client secret for Defender CLI app-based CI authentication |

Never commit these values or place them in workflow variables, logs, or source files. Rotate the client secret according to the organization's credential policy.

The Entra application must have the permissions and admin consent described in Microsoft's [Defender CLI authentication guide](https://learn.microsoft.com/en-us/security-exposure-management/defender-cli-authentication). If the secrets are absent, the workflow fails before downloading or running the scanner.

## Running a scan

1. Review the current Microsoft preview, tenant, region, licensing, and billing prerequisites.
2. Review repository contents and confirm that uploading the source to Microsoft Defender is permitted.
3. In GitHub Actions, open **GLORIFIER MDASH Agentic Code Security (Preview)** and select **Run workflow**.
4. Enable `authorize_source_upload` only when you explicitly approve the source transfer and potential model/Azure charges.
5. Review the workflow result, SARIF artifact, and GitHub code-scanning findings.

The workflow currently uses the documented baseline `gpt-general-profile`. The MAI-augmented profile is intentionally not enabled by default.

## Verification states

- `NOT_CONFIGURED`: required tenant access or GitHub secrets are not established.
- `NOT_RUN`: no explicitly authorized workflow run exists.
- `FAILED`: authentication, scan submission, job completion, SARIF validation, or result publication failed.
- `SUCCEEDED`: the CLI completed and the SARIF file passed structural validation and the publication steps completed. This does not mean no vulnerabilities were found.
- `NOT_VERIFIED`: Microsoft tenant onboarding, billing, or actual service availability has not been independently confirmed.

Do not represent the integration as active, tenant-connected, or successfully scanning until a real run provides evidence.
