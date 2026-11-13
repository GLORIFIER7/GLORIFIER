import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const agent = resolve(root, 'scripts/continuous-improvement-agent.mjs');
const unavailableFetch = resolve(root, 'scripts/fixtures/unavailable-provider-fetch.mjs');

function runAgent(extraEnv = {}) {
  const cwd = mkdtempSync(resolve(tmpdir(), 'glorifier-ci-agent-'));
  try {
    return spawnSync(process.execPath, ['--import', unavailableFetch, agent], {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        ALLOW_PAID_INFERENCE: 'true',
        OPENAI_API_KEY: 'test-only',
        GEMINI_API_KEY: 'test-only',
        ...extraEnv,
      },
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('fails the workflow when every configured inference provider is unavailable', () => {
  const result = runAgent();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /reason=all_providers_unavailable/);
  assert.match(result.stderr, /GLORIFIER_AI_PROVIDER_FAILED/);
});

test('fails the workflow when paid inference is authorized but no provider is configured', () => {
  const result = runAgent({
    OPENAI_API_KEY: '',
    GEMINI_API_KEY: '',
    META_API_KEY: '',
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stderr, /reason=no_provider_configured/);
});
