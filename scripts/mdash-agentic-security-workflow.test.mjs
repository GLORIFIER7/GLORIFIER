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

test('MDASH is manual-only and cannot run unless source upload is explicitly authorized', () => {
  const events = topLevelSection(workflow, 'on', 'permissions');
  assert.match(events, /^\s+workflow_dispatch:/m);
  assert.match(events, /authorize_source_upload:\s*\n\s+description:/);
  assert.match(events, /type:\s*boolean/);
  assert.match(events, /required:\s*true/);
  assert.match(events, /default:\s*false/);
  assert.doesNotMatch(events, /^\s+(push|pull_request|schedule|workflow_run):/m);
  assert.match(workflow, /if: github\.event_name == 'workflow_dispatch' && inputs\.authorize_source_upload == true/);
});

test('MDASH workflow uses read-only repository permissions plus only required scan/report permissions', () => {
  const permissions = topLevelSection(workflow, 'permissions', 'concurrency');
  assert.match(permissions, /contents:\s*read/);
  assert.match(permissions, /id-token:\s*write/);
  assert.match(permissions, /security-events:\s*write/);
  assert.doesNotMatch(permissions, /contents:\s*write|pull-requests:\s*write|actions:\s*write/);
});

test('Microsoft Entra credentials are mapped only from repository secrets and never printed', () => {
  for (const name of [
    'DEFENDER_ASPM_TENANT_ID',
    'DEFENDER_ASPM_CLIENT_ID',
    'DEFENDER_ASPM_CLIENT_SECRET',
  ]) {
    assert.match(workflow, new RegExp(`${name}:\\s*\\$\\{\\{\\s*secrets\\.${name}\\s*\\}\\}`));
  }
  assert.doesNotMatch(workflow, /set -x|echo\s+.*DEFENDER_ASPM_CLIENT_SECRET|printf\s+.*DEFENDER_ASPM_CLIENT_SECRET/);
});

test('MDASH scan is read-only: no automatic fix, push, PR, deployment, or merge command', () => {
  assert.doesNotMatch(workflow, /\bdefender\s+fix\b/);
  assert.doesNotMatch(workflow, /gh\s+pr\s+(create|merge)|git\s+push|deploy/i);
  assert.match(workflow, /cancel-in-progress:\s*false/);
});

test('MDASH results are validated as SARIF before GitHub Security upload and artifact retention', () => {
  assert.match(workflow, /status wait/);
  assert.match(workflow, /\.sarif/);
  assert.match(workflow, /jq -e/);
  assert.match(workflow, /github\/codeql-action\/upload-sarif@/);
  assert.match(workflow, /actions\/upload-artifact@/);
  assert.match(workflow, /retention-days:\s*7/);
});

test('Defender CLI download uses the documented Microsoft distribution host and bounded job runtime', () => {
  assert.match(workflow, /cli\.dfd\.security\.azure\.com\/public\/v2\/latest\/Defender_linux-x64/);
  assert.match(workflow, /timeout-minutes:\s*60/);
});
