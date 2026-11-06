import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../.github/workflows/octopus-deploy.yml', import.meta.url),
  'utf8',
);

function taskOutputScript() {
  const marker = '      - name: Validate the deployment task response\n';
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, 'Octopus deployment task validation step must exist');

  const nextStep = workflow.indexOf('\n      - name:', start + marker.length);
  const step = workflow.slice(start, nextStep === -1 ? undefined : nextStep);
  const runMarker = '        run: |\n';
  const runStart = step.indexOf(runMarker);
  assert.notEqual(runStart, -1, 'Octopus task validation step must use an inline script');

  return step
    .slice(runStart + runMarker.length)
    .split(/\r?\n/)
    .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n')
    .trimEnd();
}

function executeTaskOutputScript(serverTasks, outputPath) {
  try {
    execFileSync('bash', ['-euo', 'pipefail', '-c', taskOutputScript()], {
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_OUTPUT: outputPath,
        OCTOPUS_SERVER_TASKS: serverTasks,
      },
    });
    return { success: true, output: readFileSync(outputPath, 'utf8') };
  } catch (error) {
    return {
      success: false,
      output: readFileSync(outputPath, 'utf8'),
      stdout: error.stdout?.toString('utf8') ?? '',
      stderr: error.stderr?.toString('utf8') ?? '',
    };
  }
}

test('Octopus task output accepts one valid server task ID', () => {
  const directory = mkdtempSync(join(tmpdir(), 'octopus-task-output-'));
  const outputPath = join(directory, 'github-output');
  try {
    writeFileSync(outputPath, '');
    const result = executeTaskOutputScript(
      JSON.stringify([{ serverTaskId: 'ServerTasks-1234' }]),
      outputPath,
    );

    assert.equal(result.success, true);
    assert.equal(result.output, 'server_task_id=ServerTasks-1234\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Octopus task output rejects CR or LF before writing GitHub outputs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'octopus-task-output-'));
  const outputPath = join(directory, 'github-output');
  try {
    for (const serverTaskId of [
      'ServerTasks-1234\nINJECTED=value',
      'ServerTasks-1234\rINJECTED=value',
    ]) {
      writeFileSync(outputPath, '');
      const result = executeTaskOutputScript(
        JSON.stringify([{ serverTaskId }]),
        outputPath,
      );

      assert.equal(result.success, false, 'control characters must fail closed');
      assert.equal(result.output, '', 'invalid IDs must not write to GITHUB_OUTPUT');
      assert.match(result.stderr, /safe Octopus deployment task ID/i);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});


test('Octopus deployment concurrency is job-scoped and normalized', () => {
  assert.equal(
    /^concurrency:/m.test(workflow),
    false,
    'skipped workflow_run events must not acquire the deployment concurrency group',
  );
  const deployStart = workflow.indexOf('  deploy:\n');
  assert.ok(deployStart >= 0, 'Octopus deploy job must exist');
  const deploy = workflow.slice(deployStart);
  assert.ok(
    deploy.includes(
      '    concurrency:\n      group: octopus-deploy-${{ github.workflow }}-${{ github.event.workflow_run.head_branch || github.ref_name }}',
    ),
    'manual and automatic main deployments must share a job-level concurrency group',
  );
});

test('Octopus workflow rejects stale main commits before requesting an OIDC token', () => {
  const preflightStart = workflow.indexOf('      - name: Validate Octopus deployment configuration');
  const authenticateStart = workflow.indexOf('      - name: Authenticate to Octopus Deploy using GitHub OIDC');
  assert.ok(preflightStart >= 0 && authenticateStart > preflightStart);

  const preflight = workflow.slice(preflightStart, authenticateStart);
  assert.match(preflight, /GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/);
  assert.match(preflight, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/commits\/main" --jq \.sha/);
  assert.match(preflight, /\[\[ "\$current_main_sha" != "\$SOURCE_COMMIT" \]\]/);
});

test('both Octopus release paths pin package versions to the CI-tested source commit', () => {
  const pinnedPackageVersions = workflow.match(
    /package_version:\s*sha-\$\{\{\s*env\.SOURCE_COMMIT\s*\}\}/g,
  ) ?? [];
  assert.equal(pinnedPackageVersions.length, 2);
});


test('GLORIFIER Octopus waits for the verified Docker image workflow', () => {
  assert.ok(workflow.includes('workflows: ["GLORIFIER Docker Image"]'));
  assert.ok(workflow.includes("github.event.workflow_run.event == 'workflow_run'"));
  assert.ok(workflow.includes('github.event.workflow_run.head_sha == github.sha'));
});
