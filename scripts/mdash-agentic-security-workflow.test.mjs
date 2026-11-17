import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(
  new URL('../.github/workflows/mdash-agentic-security.yml', import.meta.url),
  'utf8',
);

function topLevelSection(source, sectionName, nextSectionName) {
  const start = source.indexOf(`\\n${sectionName}:\\n`);
  const end = source.indexOf(`\\n${nextSectionName}:\\n`, start + 1);
  assert.ok(start >= 0 && end > start, `expected ordered top-level sections: ${sectionName} -> ${nextSectionName}`);
  return source.slice(start, end);
}

function scanJobSection(source) {
  const start = source.indexOf('\\n  mdash-scan:\\n');
  assert.ok(start >= 0, 'expected the mdash-scan job');
  return source.slice(start);
}

const scanJob = scanJobSection(workflow);

test('MDASH is manual-only and requires explicit source-upload authorization on protected main', () => {
  const events = topLevelSection(workflow, 'on', 'permissions');
  assert.match(events, /^\\s+workflow_dispatch:/m);
  assert.match(events, /authorize_source_upload:\\s*\\n\\s+description:/);
  assert.match(events, /type:\\s*boolean/);
  assert.match(events, /required:\\s*true/);
  assert.match(events, /default:\\s*false/);
  assert.doesNotMatch(events, /^\\s+(push|pull_request|schedule|workflow_run):/m);
  assert.match(scanJob, /^\\s{4}if: github\\.event_name == 'workflow_dispatch' && github\\.ref == 'refs\\/heads\\/main' && inputs\\.authorize_source_upload == true$/m);
  assert.match(scanJob, /^\\s{4}environment:\\s*mdash-security$/m);
});

test('MDASH workflow grants only repository-read and security-report permissions', () => {
  const permissions = topLevelSection(workflow, 'permissions', 'concurrency');
  assert.match(permissions, /contents:\\s*read/);
  assert.match(permissions, /security-events:\\s*write/);
  assert.doesNotMatch(permissions, /id-token:|contents:\\s*write|pull-requests:\\s*write|actions:\\s*write/);
});

test('Microsoft Entra credentials and the trusted CLI digest come only from the protected environment', () => {
  for (const name of [
    'DEFENDER_ASPM_TENANT_ID',
    'DEFENDER_ASPM_CLIENT_ID',
    'DEFENDER_ASPM_CLIENT_SECRET',
  ]) {
    assert.match(scanJob, new RegExp(`${name}:\\\\s*\\\\$\\\\{\\\\{\\\\s*secrets\\\\.${name}\\\\s*\\\\}\\\\}`));
  }
  assert.match(scanJob, /DEFENDER_CLI_SHA256:\\s*\\$\\{\\{\\s*vars\\.DEFENDER_CLI_SHA256\\s*\\}\\}/);
  assert.match(scanJob, /\[\[:xdigit:\]\]\{64\}/);
  assert.doesNotMatch(scanJob, /set -x|echo\\s+.*DEFENDER_ASPM_CLIENT_SECRET|printf\\s+.*DEFENDER_ASPM_CLIENT_SECRET/);
});

test('Defender CLI is hash-verified before it is made executable or invoked', () => {
  const downloadIndex = scanJob.indexOf('curl --fail');
  const verifyIndex = scanJob.indexOf('sha256sum --check --status');
  const chmodIndex = scanJob.indexOf('chmod 700');
  const executeIndex = scanJob.indexOf('"$defender" scan ai-scan submit');
  assert.ok(downloadIndex >= 0, 'expected a Microsoft Defender CLI download');
  assert.ok(verifyIndex > downloadIndex, 'SHA-256 verification must follow download');
  assert.ok(chmodIndex > verifyIndex, 'verification must precede chmod');
  assert.ok(executeIndex > chmodIndex, 'verification must precede execution');
  assert.match(scanJob, /cli\\.dfd\\.security\\.azure\\.com\\/public\\/v2\\/latest\\/Defender_linux-x64/);
});

test('MDASH submission uses the documented standard profile and never writes CLI output to Actions logs', () => {
  assert.match(scanJob, /--model-profile standard/);
  assert.doesNotMatch(scanJob, /gpt-general-profile/);
  assert.match(scanJob, /submission_file/);
  assert.doesNotMatch(scanJob, /printf\\s+.*submission_file|cat\\s+.*submission_file|tee\\s+.*submission_file|echo\\s+.*submission_file/);
  assert.doesNotMatch(scanJob, /printf\\s+.*submission_log|cat\\s+.*submission_log|tee\\s+.*submission_log/);
});

test('an interrupted MDASH scan attempts cancellation without exposing command output', () => {
  assert.match(scanJob, /status cancel "\\$job_id"/);
  assert.match(scanJob, /trap cancel_scan EXIT/);
  assert.match(scanJob, /trap .*cancel_scan.*INT TERM/);
  assert.match(scanJob, /timeout-minutes:\\s*60/);
});

test('MDASH remains read-only and cannot change repository files or deployment state', () => {
  assert.doesNotMatch(scanJob, /\\bdefender\\s+fix\\b/);
  assert.doesNotMatch(scanJob, /gh\\s+pr\\s+(create|merge)|git\\s+push|deploy/i);
  assert.match(workflow, /cancel-in-progress:\\s*false/);
});

test('SARIF validation precedes artifact retention and GitHub code-scanning publication', () => {
  const validationIndex = scanJob.indexOf('name: Validate SARIF structure');
  const artifactIndex = scanJob.indexOf('uses: actions/upload-artifact@v7');
  const publicationIndex = scanJob.indexOf('github/codeql-action/upload-sarif@');
  assert.ok(validationIndex >= 0, 'expected SARIF validation step');
  assert.ok(artifactIndex > validationIndex, 'artifact retention must follow SARIF validation');
  assert.ok(publicationIndex > validationIndex, 'code-scanning publication must follow SARIF validation');
  assert.match(scanJob, /retention-days:\\s*7/);
});
