import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=()=>readFileSync(new URL('../../.github/workflows/digital-me-ruleset-preflight.yml',import.meta.url),'utf8');
test('preflight is manual, owner-only, main-only and first-attempt only',()=>{
  const text=read();
  assert.match(text,/^on:\n  workflow_dispatch:\npermissions: \{\}$/m);
  for(const gate of ["github.repository == 'GLORIFIER7/GLORIFIER'","github.ref == 'refs/heads/main'","github.event_name == 'workflow_dispatch'","github.actor_id == '32674233'","github.triggering_actor == 'GLORIFIER7'",'github.run_attempt == 1'])assert.ok(text.includes(gate),gate);
  assert.doesNotMatch(text,/\b(schedule|pull_request_target|issue_comment):/);
});
test('preflight has one isolated read-only job without execution or publication credentials',()=>{
  const text=read();
  assert.deepEqual([...text.matchAll(/^ {2}([\w-]+):\s*$/gm)].map(m=>m[1]),['workflow_dispatch','preflight']);
  assert.match(text,/environment: digital-me-ruleset-attest/);
  assert.match(text,/permissions:\n      contents: read/);
  assert.match(text,/timeout-minutes: 3/);
  assert.match(text,/persist-credentials: false/);
  assert.doesNotMatch(text,/\bwrite\b|DIGITAL_ME_APP_PRIVATE_KEY|DIGITAL_ME_DISPATCHER_DATABASE_URL|dispatcher-scheduler-entry|digital-me-publish|npm ci/);
  assert.deepEqual([...text.matchAll(/secrets\.([A-Z_]+)/g)].map(m=>m[1]),['DIGITAL_ME_RULESET_ATTEST_TOKEN']);
});
test('preflight reuses exact attestation and governance checks without runtime activation',()=>{
  const text=read();
  for(const marker of ['githubReadApi(token)','/repos/GLORIFIER7/GLORIFIER/rulesets/27616646','makeRulesetAttestation','createAttestedReadApi','createGithubEvidence','await evidence.readMain()','main.sha!==sourceSha','RULESET_PREFLIGHT_VERIFIED_READ_ONLY','RULESET_PREFLIGHT_DENIED','process.exitCode=1'])assert.ok(text.includes(marker),marker);
  assert.doesNotMatch(text,/DIGITAL_ME_DISPATCHER_ENABLED|GITHUB_OUTPUT|console\.log\(token|console\.error\(error/);
});
