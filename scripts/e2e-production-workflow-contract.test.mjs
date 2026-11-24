import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import './e2e-navigation-audit.test.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const workflow = readFileSync(new URL('../.github/workflows/full-stack-e2e.yml', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../tests/e2e/production.spec.ts', import.meta.url), 'utf8');
const step = workflow.split('      - name: Run production E2E\n')[1]?.split('\n      - name:')[0] ?? '';

test('test credentials are scoped exclusively to the production test step', () => {
  for (const name of ['E2E_TEST_EMAIL', 'E2E_TEST_PASSWORD']) {
    const assignment = `${name}: $` + `{{ secrets.PRODUCTION_${name} }}`;
    assert.ok(step.includes(assignment));
    assert.equal(workflow.split(assignment).length, 2);
    assert.ok(!workflow.split('      - name: Run production E2E\n')[0].includes(name));
  }
});

test('missing credentials fail the actual workflow shell before Playwright; dummy credentials allow the stub', () => {
  const script = step.match(/        run: \|\n([\s\S]*)/)?.[1].replace(/^          /gm, '');
  assert.ok(script, 'production E2E requires a multiline credential preflight');
  const cwd = mkdtempSync(join(tmpdir(), 'e2e-contract-'));
  try {
    mkdirSync(join(cwd, 'node_modules/.bin'), { recursive: true });
    writeFileSync(join(cwd, 'node_modules/.bin/playwright'), '#!/bin/sh\nprintf "PLAYWRIGHT_STUB_RAN\\n"\n', { mode: 0o700 });
    for (const values of [{}, {E2E_TEST_EMAIL:'test@example.invalid'}, {E2E_TEST_PASSWORD:'dummy-not-a-secret'}]) {
      const result = spawnSync('bash', ['-c', script], { cwd, env: {PATH:process.env.PATH, ...values}, encoding:'utf8' });
      assert.notEqual(result.status, 0);
      assert.doesNotMatch(result.stdout, /PLAYWRIGHT_STUB_RAN/);
    }
    const result = spawnSync('bash', ['-c', script], { cwd, env: {PATH:process.env.PATH,E2E_TEST_EMAIL:'test@example.invalid',E2E_TEST_PASSWORD:'dummy-not-a-secret'}, encoding:'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /PLAYWRIGHT_STUB_RAN/);
  } finally { rmSync(cwd,{recursive:true,force:true}); }
});

test('both authenticated tests sign in with a preprovisioned account and never skip or register', () => {
  assert.doesNotMatch(spec, /test\.skip\(|create a new account|create account|new-password/i);
  assert.equal((spec.match(/await signInWithDedicatedAccount\(page\)/g) ?? []).length, 2);
  assert.match(spec, /current-password/);
  assert.match(spec, /Sign in to Command Center/i);
});

test('authenticated and unauthenticated API assertions remain present', () => {
  assert.match(spec, /expect\(session\.body\.authenticated\)\.toBe\(true\)/);
  assert.match(spec, /expect\(state\.status\)\.toBe\(200\)/);
  assert.match(spec, /expect\(\[401, 403\]\)\.toContain\(postLogout\.status\)/);
  assert.match(spec, /expect\(\[401, 403\]\)\.toContain\(response\.status\(\)\)/);
});

// Secret-bearing jobs must run only on protected main and use dedicated environment secrets.
test('production credentials are isolated from non-main manual dispatches and forked workflows', () => {
  const guard = "github.repository == 'GLORIFIER7/GLORIFIER' && github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || (github.event_name == 'workflow_run' && github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.event == 'workflow_run' && github.event.workflow_run.head_branch == 'main' && github.event.workflow_run.head_repository.full_name == github.repository))";
  assert.ok(workflow.includes('if: $' + '{{ ' + guard + ' }}'));
  assert.match(workflow, /^    environment: production-e2e$/m);
  assert.doesNotMatch(workflow, /secrets\.E2E_TEST_(EMAIL|PASSWORD)/);
});
