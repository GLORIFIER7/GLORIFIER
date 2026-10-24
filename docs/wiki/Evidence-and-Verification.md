# Evidence and Verification

## Status labels
- **FULLY VERIFIED:** every defined check for the exact scope passed using current evidence.
- **VERIFIED:** a specific claim has direct supporting evidence.
- **PARTIALLY VERIFIED:** evidence supports part of the claim, but material checks remain.
- **NOT VERIFIED:** the evidence is absent, stale, or insufficient.
- **DEGRADED:** a live observation shows the requirement is not met.
- **NOT OBSERVABLE:** current access cannot establish the state.

## Evidence record
For each claim, capture:
- the claim and its scope;
- source URL, workflow run, commit SHA, or probe;
- observation time and environment;
- expected result and observed result;
- limitations, failures, and next action.

## Rules
1. Prefer direct evidence over inference.
2. Distinguish static analysis, unit tests, integration tests, and live production probes.
3. State skipped checks and missing observability explicitly.
4. Do not infer production health from CI success.
5. Do not claim a blockchain transaction, mint, ownership, or balance without checking the relevant chain data.
6. Do not claim database synchronization without comparing defined datasets or reconciliation evidence.