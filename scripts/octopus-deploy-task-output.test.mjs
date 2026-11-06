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
const dockerImageWorkflow = readFileSync(
  new URL('../.github/workflows/docker-image.yml', import.meta.url),
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

test('Octopus workflow rejects comma, LF, and CR in one target environment', () => {
  const preflightStart = workflow.indexOf('      - name: Validate Octopus deployment configuration');
  const verifyStart = workflow.indexOf('      - name: Verify the upstream Docker image publication succeeded');
  assert.ok(preflightStart >= 0 && verifyStart > preflightStart);
  const preflight = workflow.slice(preflightStart, verifyStart);
  assert.ok(preflight.includes(String.raw`"$OCTOPUS_ENVIRONMENT" == *','*`));
  assert.ok(preflight.includes(String.raw`"$OCTOPUS_ENVIRONMENT" == *$'\n'*`));
  assert.ok(preflight.includes(String.raw`"$OCTOPUS_ENVIRONMENT" == *$'\r'*`));
  assert.ok(preflight.includes('exactly one environment name (no commas, CR, or LF)'));
});

test('Octopus workflow contains exactly one release and deployment sequence', () => {
  for (const step of [
    '      - name: Validate Octopus deployment configuration',
    '      - name: Authenticate to Octopus Deploy using GitHub OIDC',
    '      - name: Wait for the Octopus deployment to finish',
  ]) {
    assert.equal(workflow.split(step).length - 1, 1, 'workflow must contain exactly one ' + step.trim());
  }
});

test('both Octopus release paths pin package versions to the CI-tested source commit', () => {
  const pinnedPackageVersions = workflow.match(
    /package_version:\s*0\.0\.0-\$\{\{\s*env\.SOURCE_COMMIT\s*\}\}/g,
  ) ?? [];
  assert.equal(pinnedPackageVersions.length, 2);
});


test('GLORIFIER Octopus waits for the verified Docker image workflow', () => {
  assert.ok(workflow.includes('workflows: ["GLORIFIER Docker Image"]'));
  assert.ok(workflow.includes("github.event.workflow_run.event == 'workflow_run'"));
  assert.ok(workflow.includes('github.event.workflow_run.head_sha == github.sha'));
});


test('upstream image publication verification preserves least-privilege token permissions', () => {
  assert.equal(/^\s*actions:\s*read\s*$/m.test(workflow), false);
  const verifyStart = workflow.indexOf('      - name: Verify the upstream Docker image publication succeeded');
  const authenticateStart = workflow.indexOf('      - name: Authenticate to Octopus Deploy using GitHub OIDC');
  assert.ok(verifyStart >= 0 && authenticateStart > verifyStart);
  const verification = workflow.slice(verifyStart, authenticateStart);
  assert.ok(verification.includes("job.get(\"name\") == \"publish-after-ci\""));
  assert.ok(verification.includes("step.get(\"name\") == \"Tag and publish verified image\""));
  assert.equal(verification.includes('Authorization'), false);
});


function upstreamPublicationScript() {
  const marker = '      - name: Verify the upstream Docker image publication succeeded\n';
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1);
  const nextStep = workflow.indexOf('\n      - name:', start + marker.length);
  const step = workflow.slice(start, nextStep === -1 ? undefined : nextStep);
  const runMarker = '        run: |\n';
  const runStart = step.indexOf(runMarker);
  assert.notEqual(runStart, -1);
  const shellScript = step.slice(runStart + runMarker.length)
    .split(/\r?\n/)
    .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n')
    .trimEnd();
  const pythonMarker = "python3 - <<'PY'\n";
  const pythonStart = shellScript.indexOf(pythonMarker);
  const pythonEnd = shellScript.lastIndexOf('\nPY');
  assert.ok(pythonStart >= 0 && pythonEnd > pythonStart);
  return shellScript.slice(pythonStart + pythonMarker.length, pythonEnd);
}
function runUpstreamPublicationCheck(conclusion) {
  const script = upstreamPublicationScript();
  const harness = `import io, json, os, urllib.request
sha = os.environ["SOURCE_COMMIT"]
scenario = os.environ["SCENARIO"]
def fake_urlopen(request, timeout=20):
    url = request.full_url
    if url.endswith("/actions/runs/123"):
        payload = {"head_sha": sha, "head_branch": "main", "conclusion": "success"}
    elif url.endswith("/actions/runs/123/jobs?per_page=100"):
        publish_conclusion = "success" if scenario == "success" else "skipped"
        payload = {"jobs": [{"name": "publish-after-ci", "conclusion": publish_conclusion,
            "steps": [{"name": "Tag and publish verified image", "conclusion": publish_conclusion}]}]}
    else:
        raise AssertionError("unexpected GitHub API URL: " + url)
    return io.BytesIO(json.dumps(payload).encode("utf-8"))
urllib.request.urlopen = fake_urlopen
script = os.environ["WORKFLOW_STEP_SCRIPT"]
exec(compile(script, "<upstream-publication-check>", "exec"), {"__name__": "__main__"})
`;
  return execFileSync('python3', ['-c', harness], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_REPOSITORY: 'GLORIFIER7/GLORIFIER',
      UPSTREAM_RUN_ID: '123',
      SOURCE_COMMIT: 'a'.repeat(40),
      SCENARIO: conclusion,
      WORKFLOW_STEP_SCRIPT: script,
    },
  });
}

test('upstream publication check accepts only the exact successful image publication', () => {
  const output = runUpstreamPublicationCheck('success');
  assert.match(output, /Verified published Docker image/);
  assert.throws(() => runUpstreamPublicationCheck('skipped'), (error) => error.status === 1);
});


test('Docker image workflow publishes the exact commit-derived Octopus package tag', () => {
  assert.match(dockerImageWorkflow, /0\.0\.0-\$\{IMAGE_SHA\}/);
});

test('Octopus service-account secret is step-scoped, never job-scoped', () => {
  const deploy = workflow.slice(workflow.indexOf('  deploy:'));
  const jobEnv = deploy.match(/(?ms)^    env:\\n(.*?)(?=^    steps:)/);
  assert.ok(jobEnv, 'The deploy job environment must exist');
  assert.doesNotMatch(jobEnv[1], /OCTOPUS_SERVICE_ACCOUNT_ID/);

  const validation = deploy.match(
    /(?ms)^      - name: Validate Octopus service account secret is configured\\n(.*?)(?=^      - name:|\\Z)/,
  );
  assert.ok(validation, 'A step-scoped service-account secret preflight must exist');
  assert.match(validation[1], /OCTOPUS_SERVICE_ACCOUNT_ID: \\${{ secrets\\.OCTOPUS_SERVICE_ACCOUNT_ID }}/);
  assert.match(validation[1], /test -n "\\$\\{OCTOPUS_SERVICE_ACCOUNT_ID:-\\}"/);

  const login = deploy.match(
    /(?ms)^      - name: Authenticate to Octopus Deploy using GitHub OIDC\\n(.*?)(?=^      - name:|\\Z)/,
  );
  assert.ok(login, 'The OIDC login step must exist');
  assert.match(login[1], /service_account_id: \\${{ secrets\\.OCTOPUS_SERVICE_ACCOUNT_ID }}/);
});
