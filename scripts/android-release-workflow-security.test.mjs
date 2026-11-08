import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(resolve(root, '.github/workflows/android-release.yml'), 'utf8');
const jobsStart = workflow.indexOf('\njobs:\n');
assert.ok(jobsStart > 0, 'android-release.yml must contain a top-level jobs section');
const eventSection = workflow.slice(0, jobsStart + 1);
const androidJobStart = workflow.indexOf('  android:\n');
const stepsStart = workflow.indexOf('    steps:\n', androidJobStart);
const prepareStart = workflow.indexOf('      - name: Prepare Android release signing');
const signedStart = workflow.indexOf('      - name: Build signed Android App Bundle');
const unsignedStart = workflow.indexOf('      - name: Build unsigned Android App Bundle');
const verifyStart = workflow.indexOf('      - name: Verify release AAB exists');
const uploadStart = workflow.indexOf('      - name: Upload AAB artifact');
const mainOnlySigningGuard = /github\.ref == 'refs\/heads\/main' && \(github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\)/;

test('Android release workflow does not execute on pull-request events', () => {
  assert.doesNotMatch(eventSection, /^\s{2}pull_request(?:_target)?:/m);
});

test('manual dispatch is limited to the protected main ref', () => {
  assert.ok(androidJobStart >= 0 && stepsStart > androidJobStart);
  const jobHeader = workflow.slice(androidJobStart, stepsStart);
  assert.match(jobHeader, /if: github\.event_name != 'workflow_dispatch' \|\| github\.ref == 'refs\/heads\/main'/);
});

test('signing secrets are confined to steps guarded to protected main', () => {
  assert.ok(prepareStart >= 0 && signedStart > prepareStart && unsignedStart > signedStart);
  const prepare = workflow.slice(prepareStart, signedStart);
  const signed = workflow.slice(signedStart, unsignedStart);
  const withoutSigningSteps = workflow.replace(prepare, '').replace(signed, '');
  assert.match(prepare, mainOnlySigningGuard);
  assert.match(signed, mainOnlySigningGuard);
  assert.equal(withoutSigningSteps.includes('secrets.'), false);
});

test('unsigned condition is attached to the unsigned build step itself', () => {
  assert.ok(unsignedStart >= 0 && verifyStart > unsignedStart);
  const unsigned = workflow.slice(unsignedStart, verifyStart);
  assert.match(unsigned, /if: steps\.signing\.outputs\.available != 'true'/);
});

test('signed and unsigned artifacts have distinct names', () => {
  assert.ok(uploadStart >= 0);
  const upload = workflow.slice(uploadStart);
  assert.match(upload, /name: \$\{\{\s*steps\.signing\.outputs\.available == 'true' && 'glorifier-ai-android-aab' \|\| 'glorifier-ai-android-aab-unsigned'\s*\}\}/);
  const artifactName = available => available === 'true'
    ? 'glorifier-ai-android-aab'
    : 'glorifier-ai-android-aab-unsigned';
  assert.equal(artifactName('true'), 'glorifier-ai-android-aab');
  assert.equal(artifactName(''), 'glorifier-ai-android-aab-unsigned');
});
