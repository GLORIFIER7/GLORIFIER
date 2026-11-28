# Issue #471 — exact provenance candidate recovery

Source baseline at recovery: 551da3a602f6814298141a19a50f22945820a8d2
Existing dispatcher blob on main: 609a185faa15a91e9a45410ef05afa1b15aeee55

These are the two exact files already preserved in the issue checkpoint:
https://github.com/GLORIFIER7/GLORIFIER/issues/471#issuecomment-7232357739

| Repository path | Git blob SHA-1 |
|---|---|
| digital-me/src/mission-dispatcher.mjs | ebf0ec6a6ef3f56d4fc04e046af723c1aa32148f |
| digital-me/test/dispatcher-provenance.test.mjs | 8a673e93fadb037c0733a1164d3a1fc2eb1485b7 |

Before copying, verify the existing source blob and confirm the test path does not already contain different work. Copy only the two files under digital-me into the existing proposal branch, not directly into protected main. Run the focused test, full repository CI, lint and build, and use the existing signed publication and review mechanism. Do not upload this README or test log as source changes.

Local verification in Node 22.16.0: all four focused tests passed using in-memory adapters. Both recovered blob hashes exactly match the prior checkpoint. No new implementation, native dispatch, hosted database migration, independent review, real publication, full suite, or runtime verification is claimed by this package.

The merged migration is already in main under database/migrations/20261127_002_digital_me_dispatcher_claim_policy.sql. It must not be copied again. Hosted activation remains subject to least-privilege credential setup, exact-target validation and the reviewed migration process. The one-time-dispatch branch was identical to main at readback. Keep #471 open.
