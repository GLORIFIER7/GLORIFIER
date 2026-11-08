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

test('Android release workflow has exactly one trusted event: push to main', () => {
  assert.equal(
    eventSection.trimEnd(),
    ['on:', '  push:', '    branches:', '      - main'].join('\n'),
    'the signing-capable workflow must not gain any additional event or ref trigger',
  );
});

test('every step that references secrets is individually main-push guarded', () => {
  const steps = workflow.split(/^      - name: /m).slice(1).map(block => {
    const [name] = block.split('\n');
    return { name, source: block };
  });
  const secretSteps = steps.filter(step => /\bsecrets\./.test(step.source));

  assert.deepEqual(
    secretSteps.map(step => step.name),
    ['Prepare Android release signing', 'Build signed Android App Bundle'],
    'signing secrets must appear only in the two explicitly approved signing steps',
  );
  for (const step of secretSteps) {
    assert.match(step.source, mainOnlySigningGuard, `secret-bearing step "${step.name}" must be guarded`);
  }
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
