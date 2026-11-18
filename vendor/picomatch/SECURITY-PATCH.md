# GLORIFIER-maintained Picomatch patch

This package is a locally maintained fork of upstream `picomatch@4.0.7` used only to mitigate the reported repeated-extglob ReDoS pattern handling while upstream status remains unresolved.

## Provenance

- Upstream baseline: `micromatch/picomatch` commit `9fab7bf61913ea334c4203ed321c426cfde44a42` (package version 4.0.7).
- Patch: adapted from the code in [upstream pull request #235](https://github.com/micromatch/picomatch/pull/235), commit `0150ed18b7971894bfd1824c8f96d6b63c70ad1f`.
- The upstream pull request was closed without merge. The upstream maintainer publicly disputed the vulnerability. The GitHub advisory currently continues to list versions through 4.0.7 as affected and does not list an official fixed version.
- This locally maintained patch is not an official Picomatch release and must not be represented as one. The local version suffix `-glorifier.1` identifies this project-maintained patch.

## Change scope

`lib/parse.js` contains the repeated-extglob mitigation: it detects glob wildcards inside repeated extglob branches and repetition-overlap between simple branches; patterns detected as risky are treated literally. `lib/utils.js` replaces the upstream backslash-removal regex with a deterministic single-pass routine, and `lib/constants.js` removes the no-longer-used regex. This also addresses CodeQL's polynomial-regex finding on repeated escaped opening brackets. The regression suite covers the reported pattern families, preserves the legacy escaped-empty-class behavior, and verifies ordinary extglob behavior.

## Repository scope and npm audit exception

The local file override is applied only when this repository is the npm root project. The fork is intentionally excluded from the public npm tarball; npm does not apply a dependency package's root-only `overrides` to downstream projects. The local mitigation therefore must not be represented as an upstream fixed release or a transitive guarantee for npm consumers.

The upstream advisory `GHSA-fc5q-39xc-vjpf` remains active in [`security/dependency-exceptions.json`](../../security/dependency-exceptions.json) as a temporary exception created on 2026-11-18 and expiring on 2026-12-18. npm audit does not provide registry-advisory coverage for this repository-local file package. A green npm audit result therefore does not mean the advisory was withdrawn or that upstream published a fix. CI enforces the exception's expiry and requires a separate review before it can be removed or renewed.

## Maintenance

Keep the patch and its test until upstream publishes an accepted fix or the advisory is withdrawn. When that happens, remove the override and vendor directory only after a clean dependency audit and regression run.
