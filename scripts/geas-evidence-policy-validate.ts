import { readFileSync } from 'node:fs';

const scientistPath = 'src/lib/governance/geas-architecture-scientist.ts';
const failures: string[] = [];
let checks = 0;
let scientist: string;
try {
  scientist = readFileSync(scientistPath, 'utf8');
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(JSON.stringify({
    valid: false,
    failures: [`unable to read required GEAS source file (${scientistPath}): ${detail}`],
  }, null, 2) + '\n');
  process.exit(1);
}

function requirePattern(pattern: RegExp, message: string) {
  checks += 1;
  if (!pattern.test(scientist)) failures.push(message);
}

// Retrieval and keyword matching establish availability/content matches, never claim truth.
requirePattern(/evidenceStatus:\s*excerpt\s*\?\s*'content-matched'\s*:\s*response\.ok\s*\?\s*'source-available'/,
  'source retrieval must not assign claim-supported status');
requirePattern(/export function isClaimSupportedEvidence\(status: EvidenceStatus\): boolean\s*\{\s*return status === 'claim-supported';\s*\}/,
  'claim-supported status must be explicit');
requirePattern(/export function classifyArchitectureEvidence\(status: EvidenceStatus\): EvidenceClass\s*\{\s*return status === 'claim-supported' \? 'observed-fact' : 'analysis';\s*\}/,
  'only claim-supported evidence may be classified as observed-fact');
requirePattern(/source\.evidenceStatus === 'claim-supported' \? 'observed-fact' : 'analysis'/,
  'observed patterns must preserve evidence classification');
requirePattern(/irreversibleChangesExecuted:\s*false/,
  'scan result must explicitly prohibit autonomous irreversible changes');
requirePattern(/architectureStateModel:\s*\['desired',\s*'declared',\s*'deployed',\s*'observed',\s*'verified'\]/,
  'five-state architecture model must remain explicit');
requirePattern(/export interface ArchitectureReconciliationContract\s*\{[^}]*evidenceByState:\s*Record<ArchitectureState,\s*ReconciliationStateEvidence>/,
  'five-state reconciliation contract must require snapshot-bound evidence for every state');

// Drift is not allowed to claim a confirmed mismatch without traceable evidence.
requirePattern(/export interface DriftFinding[\s\S]*?evidenceRefs:\s*string\[\]/,
  'drift findings must expose evidence references');
requirePattern(/export type DriftStatus = 'aligned' \| 'partial' \| 'drift' \| 'unknown'/,
  'drift status must preserve UNKNOWN for missing evidence');

if (failures.length) {
  process.stderr.write(JSON.stringify({ valid: false, failures }, null, 2) + '\n');
  process.exit(1);
}
process.stdout.write(JSON.stringify({
  valid: true,
  checks,
  policy: 'GEAS-EVIDENCE-GUARD-1',
  note: 'Static invariant checks only; they do not prove live claim support, runtime drift, or production conformance.',
  irreversibleChangesExecuted: false
}, null, 2) + '\n');
