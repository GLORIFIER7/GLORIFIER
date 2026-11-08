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
const prepareStart = workflow.indexOf('      - name: Prepare Android release signing');
const signedStart = workflow.indexOf('      - name: Build signed Android App Bundle');
const unsignedStart = workflow.indexOf('      - name: Build unsigned Android App Bundle');
const verifyStart = workflow.indexOf('      - name: Verify release AAB exists');
const uploadStart = workflow.indexOf('      - name: Upload AAB artifact');
const mainOnlySigningGuard = /github\.ref == 'refs\/heads\/main' && github\.event_name == 'push'/;

test('Android release workflow runs only on pushes to main', () => {
  assert.match(eventSection, /^on:\s*\n\s{2}push:\s*\n\s{4}branches:\s*\n\s{6}- main/m);
  assert.doesNotMatch(eventSection, /^\s{2}(?:pull_request|pull_request_target|workflow_dispatch):/m);
  assert.doesNotMatch(eventSection, /^\s{4}tags:/m);
});

test('signing secrets are confined to main-push guarded steps', () => {
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
