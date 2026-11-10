import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/ai-coding-fleet.yml', import.meta.url),
  'utf8',
);
const publishStart = workflow.indexOf('\n  publish-proposal:\n');
const dispatchStart = workflow.indexOf('\n  dispatch-ci:\n', publishStart);
assert.ok(publishStart >= 0 && dispatchStart > publishStart,
  'expected publish-proposal before dispatch-ci');

const publish = workflow.slice(publishStart, dispatchStart);
const stepsStart = publish.indexOf('\n    steps:\n');
assert.ok(stepsStart > 0, 'expected publisher steps');
const jobHeader = publish.slice(0, stepsStart);
const publishStepStart = publish.indexOf('      - name: Publish validated draft PR');
assert.ok(publishStepStart > stepsStart, 'expected final PR publication step');
const publishStep = publish.slice(publishStepStart);

test('the publisher does not trust the maintenance-start clock snapshot', () => {
  assert.doesNotMatch(
    jobHeader,
    /outputs\.publication_allowed/,
    'an early time-window snapshot must not skip the publisher job',
  );
});

test('the current Laos clock is checked before any remote branch or PR write', () => {
  const clockCheck = publishStep.indexOf('current_hhmm="$(TZ=Asia/Vientiane date +%H%M)"');
  const remotePush = publishStep.indexOf('git -c core.hooksPath=/dev/null push');
  const createPr = publishStep.indexOf('gh pr create --draft');

  assert.ok(clockCheck >= 0, 'publisher must re-read the Asia/Vientiane clock');
  assert.ok(remotePush > clockCheck, 'clock recheck must precede remote branch publication');
  assert.ok(createPr > clockCheck, 'clock recheck must precede PR creation');
  assert.match(publishStep, /if \(\( current_hhmm_decimal < 831 \)\); then/);
  assert.match(publishStep, /if ! current_hhmm=/,
    'an unavailable clock must fail closed before remote writes');
});
