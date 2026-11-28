import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../../.github/workflows/digital-me-dispatcher-scheduler.yml',import.meta.url),'utf8');
const entry=readFileSync(new URL('../src/dispatcher-scheduler-entry.mjs',import.meta.url),'utf8');
test('native workflow is opt-in, bounded and main-only',()=>{
  for(const anchor of ["cron: '22 * * * *'","github.ref == 'refs/heads/main'","github.run_attempt == 1","vars.DIGITAL_ME_DISPATCHER_ENABLED == 'true'","vars.DIGITAL_ME_DISPATCHER_FREE_TIER_CONFIRMED == 'true'",'environment: digital-me-publish','cancel-in-progress: false','timeout-minutes: 15','persist-credentials: false','permissions: {}'])assert.ok(workflow.includes(anchor),anchor);
  assert.doesNotMatch(workflow,/pull_request_target|contents: write|pull-requests: write|administration: write/);
});
test('contract tests run before secrets are supplied to the native entry',()=>{const tests=workflow.indexOf('node --test digital-me/test/*.test.mjs');const credentials=workflow.indexOf('secrets.DIGITAL_ME_APP_PRIVATE_KEY');assert.ok(tests>=0&&credentials>tests);assert.ok(workflow.includes('node --import tsx/esm digital-me/src/dispatcher-scheduler-entry.mjs'));});
test('entry uses scoped store and grant reader, never self-issues grants',()=>{for(const anchor of ['WorkerAutopilotMissionStore','initializeDispatcher()','createDispatcherAuthorization','allowAll:false','public.read_digital_me_dispatcher_grant','verifyDispatcherCandidate','createGithubEvidence','quarantineExpired','withDispatcherApp','rejectUnauthorized:true'])assert.ok(entry.includes(anchor),anchor);assert.doesNotMatch(entry,/INSERT\s+INTO|UPDATE\s+public\.digital_me_dispatcher_grants|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0/);});
