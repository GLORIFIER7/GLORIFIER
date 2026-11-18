# GLORIFIER-maintained Picomatch patch

This package is a locally maintained fork of upstream `picomatch@4.0.7` used only to mitigate the reported repeated-extglob ReDoS pattern handling while upstream status remains unresolved.

## Provenance

- Upstream baseline: `micromatch/picomatch` commit `9fab7bf61913ea334c4203ed321c426cfde44a42` (package version 4.0.7).
- Patch: adapted from the code in [upstream pull request #235](https://github.com/micromatch/picomatch/pull/235), commit `0150ed18b7971894bfd1824c8f96d6b63c70ad1f`.
- The upstream pull request was closed without merge. The upstream maintainer publicly disputed the vulnerability. The GitHub advisory currently continues to list versions through 4.0.7 as affected and does not list an official fixed version.
- This is **not** an official Picomatch release and must not be represented as one. The local version suffix `-glorifier.1` identifies this project-maintained patch.

## Change scope

Only `lib/parse.js` differs from the 4.0.7 baseline. The mitigation detects glob wildcards inside repeated extglob branches and repetition-overlap between simple branches; patterns detected as risky are treated literally. The regression suite covers the reported pattern families and verifies ordinary supported patterns remain functional.

## Maintenance

Keep the patch and its test until upstream publishes an accepted fix or the advisory is withdrawn. When that happens, remove the override and vendor directory only after a clean dependency audit and regression run.
