---
name: ci-repair
description: Diagnose and repair GitHub Actions failures using job logs, exact commit evidence and bounded retries.
---

# CI repair

1. Identify the exact workflow run, event, commit SHA, job and failed step.
2. Read the failing log and distinguish source defects from unavailable secrets, provider billing, rate limits, external outages, policy blocks and runner failures.
3. Reproduce locally with the repository's existing command when safe.
4. Fix source or test defects with regression coverage. Do not weaken the failing assertion or required-check policy.
5. Do not retry billable model jobs, access secrets, change Actions policy, rerun deployment workflows or consume paid capacity without separate owner authorization.
6. Re-run only the relevant safe check and report exact run/commit evidence. Pending or skipped is not passed.
