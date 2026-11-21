# Databricks API integration for GLORIFIER

This integration starts with a manual, read-only GitHub Actions authentication check. It does not deploy resources, run jobs, query tables, or modify data.

## 1. GitHub environment

In **Settings → Environments**, create an environment named `databricks-readonly`. Add these environment **variables** (not secrets):

- `DATABRICKS_HOST`: the HTTPS URL of the Databricks workspace, without an API path.
- `DATABRICKS_CLIENT_ID`: the application/client ID of a dedicated Databricks service principal.

Configure the environment's deployment-branch policy to **Selected branches and tags** and allow only the protected `main` branch. Require reviewer approval if appropriate for your repository. The workflow also checks that it was dispatched from `main` before the job can enter the environment. Do not rely on the OIDC subject alone to restrict branches.

Do not add a personal access token or client secret for this OIDC workflow.

## 2. Databricks service principal and federation

In the Databricks account console, create or select a dedicated service principal for this repository. Configure a workload identity federation policy for GitHub Actions with:

- Issuer: `https://token.actions.githubusercontent.com`
- Subject claim: `sub`
- Subject: the exact GitHub OIDC subject for this repository's `databricks-readonly` environment
- Audience: the value required by the Databricks federation setup (Databricks recommends the account ID where applicable)

For this repository, the GitHub OIDC subject **observed in failed workflow run #12** (run ID `39205843548`) is the immutable-ID format:

```text
repo:GLORIFIER7@32674233/GLORIFIER@1377237797:environment:databricks-readonly
```

The workflow currently requests the account-ID audience `11bcb30d-f5e8-42dc-a186-dcd824e4c045`. The Databricks federation policy must accept this **exact audience** and the **exact observed subject**, not the conventional name-only subject `repo:GLORIFIER7/GLORIFIER:environment:databricks-readonly`. Re-check the actual claims if the repository OIDC subject customization or Databricks account changes. Do not broaden the trust policy to other environments, branches, or repositories.

Keep the service principal at minimum privilege. This initial check only needs to authenticate and read the current caller identity.

### Recover a failed `invalid_grant` / `TOKEN_INVALID` exchange

Workflow run [`44879304935`](https://github.com/GLORIFIER7/GLORIFIER/actions/runs/44879304935/job/136770864580) on **November 21, 2026 at 07:14 UTC** confirms this persists **after** PR #922 (merged November 17, 2026). The configuration and CLI setup steps passed, but `databricks current-user me` failed with `invalid_grant` / `TOKEN_INVALID`: `Ensure a valid federation policy has been configured`. The error reports the exact issuer, immutable subject, and account-ID audience shown below. The older workflow run `39205843548` failed similarly. **Passing GitHub configuration checks does not prove account-side federation is configured.**

A **Databricks account admin** must inspect the federation policy attached to the service principal whose application ID equals the GitHub environment's `DATABRICKS_CLIENT_ID`:

1. Open the relevant [Databricks account console](https://accounts.cloud.databricks.com) (not the workspace console), then **User management → Service principals**. Select the service principal with application ID `1a453e07-0288-4734-98ca-7e7792c94016` (observed in the failed job), verify the intended account ID is `11bcb30d-f5e8-42dc-a186-dcd824e4c045`, and open **Credentials & secrets → Federation policies**. Note that the application ID is **not** the numeric service principal ID used in the account CLI commands.
2. Confirm that one narrowly scoped GitHub Actions OIDC policy matches all these claims exactly:

   | Claim / setting | Required value |
   | --- | --- |
   | Issuer (`iss`) | `https://token.actions.githubusercontent.com` |
   | Subject claim | `sub` |
   | Subject (`sub`) | `repo:GLORIFIER7@32674233/GLORIFIER@1377237797:environment:databricks-readonly` |
   | Audience (`aud`) | `11bcb30d-f5e8-42dc-a186-dcd824e4c045` |

3. If the policy differs, correct the existing policy or create a matching **service-principal** federation policy following the Databricks documentation. Do **not** create an account-wide GitHub federation policy or widen the audience/subject to bypass validation. Confirm that the account ID and application ID are the intended ones before modifying anything.

   For an account administrator using a **locally authenticated Databricks CLI**, first discover the numeric ID for that application ID, then **inspect existing policies before creating or updating** (the numeric ID is deliberately not guessed):

   ```bash
   databricks auth login --host https://accounts.cloud.databricks.com --account-id 11bcb30d-f5e8-42dc-a186-dcd824e4c045
   databricks account service-principals list --filter 'applicationId eq "1a453e07-0288-4734-98ca-7e7792c94016"'
   # Substitute the numeric service principal ID from the preceding result:
   databricks account service-principal-federation-policy list SERVICE_PRINCIPAL_NUMERIC_ID
   ```

   If **no matching policy exists**, the account admin can create a narrowly scoped one after confirming the numeric ID, using the official Databricks CLI syntax:

   ```bash
   databricks account service-principal-federation-policy create SERVICE_PRINCIPAL_NUMERIC_ID --json '{
     "oidc_policy": {
       "issuer": "https://token.actions.githubusercontent.com",
       "audiences": ["11bcb30d-f5e8-42dc-a186-dcd824e4c045"],
       "subject": "repo:GLORIFIER7@32674233/GLORIFIER@1377237797:environment:databricks-readonly"
     }
   }'
   ```

   Run these commands only with appropriate Databricks account administrator authorization. Review an existing incorrect policy rather than making unnecessary duplicates. Keep the policy scoped to this service principal.
4. Confirm GitHub environment `databricks-readonly` has the correct non-secret `DATABRICKS_HOST` and `DATABRICKS_CLIENT_ID` variables, and restrict environment deployment to `main`.
5. Manually dispatch **Databricks API Verification** on `main`. Only a passing `Verify authenticated Databricks identity` step confirms the API authentication repair. If it still fails, collect the sanitized error code and step name; never post OIDC JWTs, access tokens, or full authentication debug logs.

No elevated permissions, billable Databricks compute, SQL mutations, data writes, or jobs are required to run this read-only authentication check.

Official references:
- https://docs.databricks.com/aws/en/dev-tools/auth/provider-github
- https://docs.databricks.com/aws/en/dev-tools/auth/oauth-federation-provider
- https://docs.github.com/en/actions/reference/security/oidc

## 3. Run the verification

On GitHub mobile or desktop:

1. Open **Actions** in the GLORIFIER repository.
2. Select **Databricks API Verification**.
3. Tap **Run workflow** from the protected `main` branch.
4. Review the logs and the `Verify authenticated Databricks identity` step.

A passing run confirms that this workflow authenticated and read the current Databricks identity. It does not prove SQL warehouse, job, file, or model-serving access.

## 4. Troubleshooting

- **Missing configuration:** check the variable names and ensure they are defined in the `databricks-readonly` environment.
- **Federation/unauthorized error:** compare the token issuer, audience, and exact subject against the Databricks federation policy. Check whether the repository uses immutable subject claims.
- **Wrong workspace:** verify `DATABRICKS_HOST` points to the intended workspace.
- **Insufficient permissions:** grant only the specific permissions needed for a later approved integration; do not solve this by granting broad workspace-admin privileges.

## 5. Safe expansion path

After the identity check passes, add one integration at a time: read-only SQL access, then approved jobs or files, then model serving if needed. Review compute costs and permissions before enabling workloads. Do not add automatic deployments or production writes to this authentication check.
