import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../../.github/workflows/digital-me-dispatcher-scheduler.yml',import.meta.url),'utf8');
const entry=readFileSync(new URL('../src/dispatcher-scheduler-entry.mjs',import.meta.url),'utf8');
const anchors=["cron: '22 * * * *'","github.ref == 'refs/heads/main'","github.run_attempt == 1","vars.DIGITAL_ME_DISPATCHER_ENABLED == 'true'","vars.DIGITAL_ME_DISPATCHER_FREE_TIER_CONFIRMED == 'true'",'environment: digital-me-publish','cancel-in-progress: false','timeout-minutes: 15','persist-credentials: false','permissions: {}'];
const occurrences=(text,needle)=>text.split(needle).length-1;
// Returns a list of contract violations; empty means the workflow passes.
function scheduleProblems(text){
  const problems=[];
  const crons=text.match(/^\s*- cron:/gm)??[];
  if(crons.length!==1)problems.push('expected exactly one cron entry, found '+crons.length);
  if(!/^\s*- cron: '22 \* \* \* \*'\s*$/m.test(text))problems.push('missing hourly cron entry');
  for(const anchor of anchors){const n=occurrences(text,anchor);if(n!==1)problems.push(anchor+' occurs '+n+' times');}
  if(/pull_request_target|contents: write|pull-requests: write|administration: write/.test(text))problems.push('write-capable or pull_request_target usage');
  return problems;
}
test('native workflow is opt-in, bounded and main-only',()=>{
  assert.deepEqual(scheduleProblems(workflow),[]);
});
test('schedule contract rejects missing, duplicate and misplaced entries',()=>{
  const duplicateCron=workflow.replace("  workflow_dispatch:","  schedule:\n    - cron: '5 * * * *'\n  workflow_dispatch:");
  assert.ok(scheduleProblems(duplicateCron).some(p=>p.includes('exactly one cron')));
  const missingCron=workflow.replace("cron: '22 * * * *'","cron: '23 * * * *'");
  assert.ok(scheduleProblems(missingCron).some(p=>p.includes('missing hourly cron')));
  const duplicateAnchor=workflow+"\n# environment: digital-me-publish\n";
  assert.ok(scheduleProblems(duplicateAnchor).some(p=>p.includes('environment: digital-me-publish occurs 2')));
});
test('contract tests run before secrets are supplied to the native entry',()=>{const tests=workflow.indexOf('node --test digital-me/test/*.test.mjs');const credentials=workflow.indexOf('secrets.DIGITAL_ME_APP_PRIVATE_KEY');assert.ok(tests>=0&&credentials>tests);assert.ok(workflow.includes('node --import tsx/esm digital-me/src/dispatcher-scheduler-entry.mjs'));});
test('entry uses scoped store and grant reader, never self-issues grants',()=>{for(const anchor of ['WorkerAutopilotMissionStore','initializeDispatcher()','createDispatcherAuthorization','allowAll:false','public.read_digital_me_dispatcher_grant','verifyDispatcherCandidate','createGithubEvidence','quarantineExpired','withDispatcherApp','rejectUnauthorized:true'])assert.ok(entry.includes(anchor),anchor);assert.doesNotMatch(entry,/INSERT\s+INTO|UPDATE\s+public\.digital_me_dispatcher_grants|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0/);});
