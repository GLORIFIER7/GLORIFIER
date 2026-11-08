import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflow = readFileSync(resolve(root, '.github/workflows/android-release.yml'), 'utf8');
const eventSection = workflow.split(/^jobs:\s*$/m, 1)[0] ?? workflow;
const prepareStart = workflow.indexOf('      - name: Prepare Android release signing');
const signedStart = workflow.indexOf('      - name: Build signed Android App Bundle');
const unsignedStart = workflow.indexOf('      - name: Build unsigned Android App Bundle');
const mainOnlySigningGuard = /github\.ref == 'refs\/heads\/main' && \(github\.event_name == 'push' \|\| github\.event_name == 'workflow_dispatch'\)/;

test('Android release workflow does not execute on pull-request events', () => {
  assert.doesNotMatch(eventSection, /^\s{2}pull_request(?:_target)?:/m);
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

test('non-main and unsigned runs use the unsigned App Bundle path', () => {
  const unsigned = workflow.slice(unsignedStart);
  assert.match(unsigned, /if: steps\.signing\.outputs\.available != 'true'/);
});
