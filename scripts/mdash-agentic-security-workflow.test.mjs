import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/mdash-agentic-security.yml', import.meta.url),
  'utf8',
);

function topLevelSection(source, sectionName, nextSectionName) {
  const start = source.indexOf(`\n${sectionName}:\n`);
  const end = source.indexOf(`\n${nextSectionName}:\n`, start + 1);
  assert.ok(start >= 0 && end > start, `expected ordered top-level sections: ${sectionName} -> ${nextSectionName}`);
  return source.slice(start, end);
}

function getScanJob(source) {
  const start = source.indexOf('\n  mdash-scan:\n');
  assert.ok(start >= 0, 'expected mdash-scan job');
  return source.slice(start);
}

const scanJob = getScanJob(workflow);

test('MDASH is manual-only and requires explicit authorization on protected main', () => {
  const events = topLevelSection(workflow, 'on', 'permissions');
  assert.match(events, /^\s+workflow_dispatch:/m);
  assert.ok(events.includes('authorize_source_upload:'));
  assert.ok(events.includes('default: false'));
  assert.doesNotMatch(events, /^\s+(push|pull_request|schedule|workflow_run):/m);
  assert.ok(scanJob.includes("if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.authorize_source_upload == true"));
  assert.ok(scanJob.includes('environment: mdash-security'));
});

test('workflow permissions are limited to source read and security-report write', () => {
  const permissions = topLevelSection(workflow, 'permissions', 'concurrency');
  assert.ok(permissions.includes('contents: read'));
  assert.ok(permissions.includes('security-events: write'));
  assert.doesNotMatch(permissions, /id-token:|contents: write|pull-requests: write|actions: write/);
});

test('Microsoft credentials and CLI digest come only from the protected environment', () => {
  for (const name of ['DEFENDER_ASPM_TENANT_ID', 'DEFENDER_ASPM_CLIENT_ID', 'DEFENDER_ASPM_CLIENT_SECRET']) {
    assert.ok(scanJob.includes(name + ': $' + '{{ secrets.' + name + ' }}'));
  }
  assert.ok(scanJob.includes('DEFENDER_CLI_SHA256: $' + '{{ vars.DEFENDER_CLI_SHA256 }}'));
  assert.ok(scanJob.includes('[[ "$DEFENDER_CLI_SHA256" =~ ^[[:xdigit:]]{64}$ ]]'));
  assert.doesNotMatch(scanJob, /set -x|echo\s+.*DEFENDER_ASPM_CLIENT_SECRET|printf\s+.*DEFENDER_ASPM_CLIENT_SECRET/);
});

test('the Defender CLI binary is SHA-256 verified before chmod and execution', () => {
  const downloadIndex = scanJob.indexOf('curl --fail');
  const verifyIndex = scanJob.indexOf('sha256sum --check --status');
  const chmodIndex = scanJob.indexOf('chmod 700');
  const executeIndex = scanJob.indexOf('"$defender" scan ai-scan submit');
  assert.ok(downloadIndex >= 0, 'expected official Microsoft CLI download');
  assert.ok(verifyIndex > downloadIndex, 'digest check must follow download');
  assert.ok(chmodIndex > verifyIndex, 'digest check must precede chmod');
  assert.ok(executeIndex > chmodIndex, 'digest check must precede execution');
  assert.ok(scanJob.includes('https://cli.dfd.security.azure.com/public/v2/latest/Defender_linux-x64'));
});

test('scan uses the documented standard profile and does not print captured CLI output', () => {
  assert.ok(scanJob.includes('--model-profile standard'));
  assert.ok(!scanJob.includes('gpt-general-profile'));
  assert.ok(scanJob.includes('submission_file'));
  assert.ok(!scanJob.includes('printf \'%s\\n\' "$submission_file"'));
  assert.ok(!scanJob.includes('cat "$submission_file"'));
  assert.ok(!scanJob.includes('tee "$submission_file"'));
});

test('an interrupted remote scan triggers a bounded cancellation attempt', () => {
  assert.ok(scanJob.includes('"$defender" status cancel "$job_id"'));
  assert.ok(scanJob.includes('trap cancel_scan EXIT'));
  assert.ok(scanJob.includes("trap 'cancel_scan; exit 130' INT TERM"));
  assert.ok(scanJob.includes('timeout-minutes: 60'));
});

test('MDASH is read-only and cannot fix, push, create PRs, deploy, or merge', () => {
  assert.doesNotMatch(scanJob, /\bdefender\s+fix\b/);
  assert.doesNotMatch(scanJob, /gh\s+pr\s+(create|merge)|git\s+push|deploy/i);
  assert.ok(workflow.includes('cancel-in-progress: false'));
});

test('SARIF validation precedes artifact retention and code-scanning publication', () => {
  const validationIndex = scanJob.indexOf('name: Validate SARIF structure');
  const artifactIndex = scanJob.indexOf('uses: actions/upload-artifact@v7');
  const publicationIndex = scanJob.indexOf('github/codeql-action/upload-sarif@');
  assert.ok(validationIndex >= 0, 'expected SARIF validation step');
  assert.ok(artifactIndex > validationIndex, 'artifact retention must follow SARIF validation');
  assert.ok(publicationIndex > validationIndex, 'code-scanning upload must follow SARIF validation');
  assert.ok(scanJob.includes('retention-days: 7'));
});
