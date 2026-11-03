import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflowPath = new URL('../.github/workflows/glorifier-solana-devnet-reconcile.yml', import.meta.url);
const workflow = readFileSync(workflowPath, 'utf8');
const authorizationStep = workflow.match(/- name: Enforce authorization and main branch([\\s\\S]*?)(?=\\n      - name:)/)?.[1];

test('workflow_run event metadata is passed through environment, not interpolated into shell', () => {
  assert.ok(authorizationStep, 'authorization step must exist');
  assert.doesNotMatch(
    authorizationStep,
    /\\$\\{\\{\\s*github\\.event\\.workflow_run\\./,
    'untrusted workflow_run expressions must not be interpolated inside run blocks',
  );
  assert.match(workflow, /WORKFLOW_RUN_CONCLUSION:\\s*\\$\\{\\{\\s*github\\.event\\.workflow_run\\.conclusion\\s*\\|\\|\\s*''\\s*\\}\\}/);
  assert.match(authorizationStep, /test "\\$\\{WORKFLOW_RUN_CONCLUSION\\}" = "success"/);
});
