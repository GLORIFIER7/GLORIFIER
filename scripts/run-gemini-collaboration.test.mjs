import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const runnerPath = fileURLToPath(new URL('./run-gemini-collaboration.sh', import.meta.url));

function runFixture(mode) {
  const root = mkdtempSync(join(tmpdir(), 'glorifier-gemini-runner-'));
  const bin = join(root, 'bin');
  const runnerTemp = join(root, 'runner-temp');
  const outputPath = join(root, 'github-output.txt');
  const argsPath = join(root, 'gemini-args.txt');
  mkdirSync(bin);
  mkdirSync(runnerTemp);
  writeFileSync(outputPath, '');
  writeFileSync(join(bin, 'gemini'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" > "$FAKE_GEMINI_ARGS"
case "$FAKE_GEMINI_MODE" in
  success)
    printf '%s\\n' '{"response":"one bounded test-backed improvement"}'
    ;;
  unavailable)
    printf '%s\\n' 'Attempt 10 failed: This model is currently experiencing high demand.' 'RetryableQuotaError: service unavailable' 'status: 503' '{"error":{"code":503,"status":"UNAVAILABLE"}}' >&2
    exit 247
    ;;
  auth_failure)
    printf '%s\\n' 'Gemini API authentication failed (401)' >&2
    exit 42
    ;;
  quota_failure)
    printf '%s\\n' 'Gemini API quota exceeded (429)' >&2
    exit 9
    ;;
  *)
    exit 99
    ;;
esac
`, { mode: 0o755 });

  const result = spawnSync('bash', [runnerPath], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: bin + ':' + process.env.PATH,
      RUNNER_TEMP: runnerTemp,
      GITHUB_OUTPUT: outputPath,
      GEMINI_MODEL: 'gemini-3.8-flash',
      GEMINI_PROMPT: 'unit test prompt',
      FAKE_GEMINI_MODE: mode,
      FAKE_GEMINI_ARGS: argsPath,
    },
  });

  return {
    root,
    result,
    output: readFileSync(outputPath, 'utf8'),
    args: readFileSync(argsPath, 'utf8'),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('Gemini collaboration writes the response summary after a successful model call', () => {
  const fixture = runFixture('success');
  try {
    assert.equal(fixture.result.status, 0, fixture.result.stderr);
    assert.match(fixture.output, /summary<<GEMINI_/);
    assert.match(fixture.output, /one bounded test-backed improvement/);
    assert.doesNotMatch(fixture.output, /provider_unavailable=true/);
    assert.match(fixture.args, /--skip-trust --model gemini-3.8-flash/);
  } finally {
    fixture.cleanup();
  }
});

test('Gemini HTTP 503 overload is reported as unavailable without failing or publishing a patch', () => {
  const fixture = runFixture('unavailable');
  try {
    assert.equal(fixture.result.status, 0, fixture.result.stderr);
    assert.match(fixture.output, /^provider_unavailable=true$/m);
    assert.doesNotMatch(fixture.output, /summary<</);
    assert.match(fixture.result.stdout, /::warning::Gemini API returned HTTP 503/);
    assert.match(fixture.args, /--skip-trust --model gemini-3.8-flash/);
  } finally {
    fixture.cleanup();
  }
});

test('Gemini authentication failures remain hard failures', () => {
  const fixture = runFixture('auth_failure');
  try {
    assert.equal(fixture.result.status, 42);
    assert.match(fixture.result.stderr, /authentication failed/);
    assert.doesNotMatch(fixture.output, /provider_unavailable=true/);
  } finally {
    fixture.cleanup();
  }
});

test('Gemini quota errors are not misclassified as transient HTTP 503 overload', () => {
  const fixture = runFixture('quota_failure');
  try {
    assert.equal(fixture.result.status, 9);
    assert.match(fixture.result.stderr, /quota exceeded/);
    assert.doesNotMatch(fixture.output, /provider_unavailable=true/);
  } finally {
    fixture.cleanup();
  }
});
