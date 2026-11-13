import { readFileSync } from 'node:fs';

const scientistPath = 'src/lib/governance/geas-architecture-scientist.ts';
const reconciliationPath = 'src/lib/governance/geas-architecture-reconciliation.ts';
const failures: string[] = [];
let checks = 0;
let scientist: string;
try {
  scientist = readFileSync(scientistPath, 'utf8');
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({
    valid: false,
    failures: [`unable to read required GEAS source file (${scientistPath}): ${detail}`],
  }, null, 2)}\n`);
  process.exit(1);
}

let reconciliation: string;
try {
  reconciliation = readFileSync(reconciliationPath, 'utf8');
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(JSON.stringify({ valid: false, failures: [`unable to read required GEAS reconciliation file (${reconciliationPath}): ${detail}`] }, null, 2) + '\n');
  process.exit(1);
}

const requireReconciliationPattern = (pattern: RegExp, message: string): void => {
  checks += 1;
  if (!pattern.test(reconciliation)) failures.push(message);
};

const requirePattern = (pattern: RegExp, message: string): void => {
  checks += 1;
  if (!pattern.test(scientist)) failures.push(message);
};

// Retrieval and keyword matching establish availability/content matches, never claim truth.
requirePattern(/const evidenceStatus: EvidenceStatus = excerpt\s*\?\s*'content-matched'\s*:\s*response\.ok\s*\?\s*'source-available'\s*:\s*'not-observed';/,
  'source retrieval must emit only content-matched, source-available or not-observed statuses');
requirePattern(/const isValidSuccessfulEvidenceShape = \(input: CachedSourceEvidence\): boolean =>[\s\S]*?input\.evidenceStatus === 'content-matched'[\s\S]*?input\.evidenceStatus === 'source-available'/,
  'successful cached source observations must not admit claim-supported evidence');
requirePattern(/const isAdmissibleFailedCache = \(input: CachedSourceEvidence\): boolean => \{\s*if \(input\.evidenceStatus !== 'not-observed' && input\.evidenceStatus !== 'unavailable'\) return false;/,
  'failed cached source observations must not admit claim-supported evidence');
requirePattern(/export const isClaimSupportedEvidence = \([\s\S]*?status === 'claim-supported'[\s\S]*?isAuthenticatedClaimSupportObservation\(source, patternId, authenticate, nowMs\)/,
  'claim-supported evidence must require a fresh, pattern-bound attestation and injected trusted authenticator');
requirePattern(/const isAuthenticatedClaimSupportObservation = \([\s\S]*?attestation\.patternId !== patternId[\s\S]*?registeredSource\.patternIds\.includes\(patternId\)/,
  'claim-support attestations must be bound to a pattern explicitly associated with the source');
requirePattern(/const isPatternSourceObservation = \([\s\S]*?isClaimSupportedEvidence\(source\.evidenceStatus, source, patternId, authenticate, nowMs\)/,
  'pattern evidence must not admit claim-supported source observations without authenticated pattern-specific support');
requirePattern(/export const classifyArchitectureEvidence = \([\s\S]*?isClaimSupportedEvidence\(status, source, patternId, authenticate, nowMs\)/,
  'observed-fact classification must require authenticated claim support for the exact pattern');
requirePattern(/Promise\.resolve\(result\)\.catch\(\(\) => undefined\)/,
  'rejected asynchronous claim authenticators must be observed before failing closed');
requirePattern(/irreversibleChangesExecuted:\s*false/,
  'scan result must explicitly prohibit autonomous irreversible changes');
requirePattern(/architectureStateModel:\s*\['desired',\s*'declared',\s*'deployed',\s*'observed',\s*'verified'\]/,
  'five-state architecture model must remain explicit');
requirePattern(/export interface ArchitectureReconciliationContract\s*\{[^}]*evidenceByState:\s*Record<ArchitectureState,\s*ReconciliationStateEvidence>/,
  'five-state reconciliation contract must require snapshot-bound evidence for every state');

requireReconciliationPattern(/export type ReconciliationStatus = 'VERIFIED' \| 'ALIGNED' \| 'PARTIALLY_VERIFIED' \| 'DRIFT' \| 'UNKNOWN'/,
  'five-state reconciler must expose the complete outcome vocabulary');
requireReconciliationPattern(/export interface IndependentVerificationEvidence[\s\S]*?result: 'passed' \| 'failed'/,
  'VERIFIED must be backed by explicit independent verification evidence');
requireReconciliationPattern(/authenticateVerificationEvidence\?: VerificationEvidenceAuthenticator/,
  'independent verification evidence must pass through an injected trusted authenticator');

// Drift is not allowed to claim a confirmed mismatch without traceable evidence.
requirePattern(/export interface DriftFinding[\s\S]*?evidenceRefs:\s*string\[\]/,
  'drift findings must expose evidence references');
requirePattern(/export type DriftStatus = 'aligned' \| 'partial' \| 'drift' \| 'unknown'/,
  'drift status must preserve UNKNOWN for missing evidence');

if (failures.length) {
  process.stderr.write(`${JSON.stringify({ valid: false, failures }, null, 2)}\n`);
  process.exit(1);
}
process.stdout.write(`${JSON.stringify({
  valid: true,
  checks,
  policy: 'GEAS-EVIDENCE-GUARD-1',
  note: 'Static invariant checks only; they do not prove live claim support, runtime drift, or production conformance.',
  irreversibleChangesExecuted: false
}, null, 2)}\n`);
