import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../.github/workflows/a2a-tck-conformance.yml', import.meta.url), 'utf8');

test('A2A TCK is owner-dispatched from main only and has read-only repository permissions', () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  (?:push|pull_request|schedule):/m);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.actor_id == '32674233'/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.doesNotMatch(workflow, /contents: write|pull-requests: write|actions: write/);
});

test('A2A TCK pins the signed upstream runner revision and tests only the advertised JSON-RPC binding', () => {
  assert.match(workflow, /a2aproject\/a2a-tck/);
  assert.match(workflow, /104a7b4ae0d83f65c075e3793e322953a830eaba/);
  assert.match(workflow, /python-version: ['"]?3\.15/);
  assert.match(workflow, /astral-sh\/setup-uv@68559e99cc807c1eb7e9238fd43a15bba460eec2/);
  assert.match(workflow, /--transport jsonrpc/);
  assert.match(workflow, /run_tck\.py/);
});

test('A2A TCK requires an exact HTTPS staging-host allowlist and a staging-only bearer secret', () => {
  assert.match(workflow, /GLORIFIER_A2A_TCK_STAGING_HOST/);
  assert.match(workflow, /GLORIFIER_A2A_TCK_STAGING_BEARER_TOKEN/);
  assert.match(workflow, /scheme != ['"]https['"]/);
  assert.match(workflow, /parsed\.hostname\.lower\(\) != allowed_host\.lower\(\)/);
  assert.match(workflow, /A2A_AUTH_TYPE: bearer/);
  assert.match(workflow, /A2A_AUTH_TOKEN:/);
  assert.match(workflow, /\.well-known\/agent-card\.json/);
  assert.match(workflow, /securitySchemes/);
  assert.match(workflow, /supportedInterfaces/);
  assert.match(workflow, /JSONRPC/);
  assert.doesNotMatch(workflow, /GLORIFIER_API_TOKEN|GLORIFIER_INTERNAL_SERVICE_TOKEN/);
});

test('A2A TCK publishes reports as an immutable artifact without granting repository write access', () => {
  assert.match(workflow, /actions\/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /reports\//);
  assert.match(workflow, /persist-credentials: false/);
});
