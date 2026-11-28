import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../../.github/workflows/digital-me-dispatcher-scheduler.yml',import.meta.url),'utf8');
const entry=readFileSync(new URL('../src/dispatcher-scheduler-entry.mjs',import.meta.url),'utf8');
const grant=readFileSync(new URL('../../docs/operations/ISSUE-471-dispatcher-grant-owner.sql',import.meta.url),'utf8');
const count=(text,needle)=>text.split(needle).length-1;
function block(text,header,next){
  const lines=text.split('\n');const indices=lines.map((line,i)=>line===header?i:-1).filter(i=>i>=0);
  assert.equal(indices.length,1,header);const start=indices[0];const end=lines.findIndex((line,i)=>i>start&&next.test(line));
  return lines.slice(start,end<0?undefined:end).join('\n');
}
function contract(text){
  const schedule=block(text,'  schedule:',/^ {0,2}\S/);
  assert.deepEqual(text.match(/^\s*-\s*cron\s*:[^\n]*$/gm)?.map(x=>x.trim()),["- cron: '22 * * * *'"]);
  assert.equal(schedule.trim(),"schedule:\n    - cron: '22 * * * *'");
  const job=block(text,'  dispatcher:',/^ {0,2}\S/);
  for(const anchor of ["github.ref == 'refs/heads/main'","github.run_attempt == 1","vars.DIGITAL_ME_DISPATCHER_ENABLED == 'true'","vars.DIGITAL_ME_DISPATCHER_FREE_TIER_CONFIRMED == 'true'",'environment: digital-me-publish','timeout-minutes: 15','persist-credentials: false','needs: ruleset-attestation'])assert.equal(count(job,anchor),1,anchor);
  for(const anchor of ['cancel-in-progress: false','permissions: {}'])assert.ok(text.includes(anchor),anchor);
  assert.doesNotMatch(text,/pull_request_target|contents: write|pull-requests: write|administration: write/);
  const verify=block(job,'      - name: Verify existing and new dispatcher contracts without secrets',/^ {6}- /);
  const tick=block(job,'      - name: Run bounded governed mission tick',/^ {6}- /);
  assert.ok(job.indexOf(verify)<job.indexOf(tick));
  assert.equal(count(verify,'node --test digital-me/test/*.test.mjs'),1);
  for(const anchor of ['secrets.DIGITAL_ME_APP_PRIVATE_KEY','secrets.DIGITAL_ME_DISPATCHER_DATABASE_URL','needs.ruleset-attestation.outputs.attestation','node --import tsx/esm digital-me/src/dispatcher-scheduler-entry.mjs']){
    assert.equal(count(tick,anchor),1,anchor);assert.equal(count(text,anchor),1,anchor);
  }
  const attestation=block(text,'  ruleset-attestation:',/^ {0,2}\S/);
  assert.equal(count(attestation,'secrets.DIGITAL_ME_RULESET_ATTEST_TOKEN'),1);assert.equal(count(text,'secrets.DIGITAL_ME_RULESET_ATTEST_TOKEN'),1);
  assert.doesNotMatch(job,/DIGITAL_ME_RULESET_ATTEST_TOKEN/);
  assert.doesNotMatch(attestation,/DIGITAL_ME_APP_PRIVATE_KEY|DIGITAL_ME_DISPATCHER_DATABASE_URL/);
}
test('native workflow is opt-in, bounded, main-only and separates credentials',()=>contract(workflow));
test('missing or duplicate schedule is denied',()=>{
  assert.throws(()=>contract(workflow.replace("    - cron: '22 * * * *'\n",'')));
  assert.throws(()=>contract(workflow.replace("    - cron: '22 * * * *'","    - cron: '22 * * * *'\n    - cron: '0 * * * *'")));
});
test('duplicate or misplaced runtime secrets are denied',()=>{
  const line=workflow.split('\n').find(l=>l.includes('secrets.DIGITAL_ME_APP_PRIVATE_KEY'));assert.ok(line);
  assert.throws(()=>contract(workflow.replace(line,line+'\n'+line)));
  assert.throws(()=>contract(workflow.replace(line,'').replace('      - name: Verify existing and new dispatcher contracts without secrets','      - name: Verify existing and new dispatcher contracts without secrets\n        env:\n'+line)));
});
test('entry uses scoped store and grant reader, never self-issues grants',()=>{for(const anchor of ['WorkerAutopilotMissionStore','initializeDispatcher()','createDispatcherAuthorization','allowAll:false','public.read_digital_me_dispatcher_grant','verifyDispatcherCandidate','createGithubEvidence','quarantineExpired','withDispatcherApp','rejectUnauthorized:true','createAttestedReadApi'])assert.ok(entry.includes(anchor),anchor);assert.doesNotMatch(entry,/INSERT\s+INTO|UPDATE\s+public\.digital_me_dispatcher_grants|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0/);});
test('inventory does not cast malformed stored objectives',()=>assert.doesNotMatch(entry,/\(payload->>'objective'\)::jsonb/));
test('owner grant safely decodes the string objective, including explicit JSON null head',()=>{
  assert.match(grant,/CASE\s+WHEN\s+pg_input_is_valid\(payload->>'objective',\s*'jsonb'\)/);
  assert.match(grant,/objective->'target'->'headSha' = 'null'::jsonb/);
  assert.doesNotMatch(grant,/payload->'objective'->/);
});
test('historic merge inventory is scoped and runs without a current grant before normal dispatch',()=>{
  const selection=entry.slice(entry.indexOf('const {rows:awaiting}='),entry.indexOf('const reconciliation='));
  assert.ok(selection.includes("status='blocked'")&&selection.includes("payload->'dispatcher'->>'phase'='awaiting-review'")&&selection.includes('requester=$1')&&selection.includes('lease_owner IS NULL')&&selection.includes('lease_expires_at IS NULL')&&selection.includes('LIMIT 101'));
  assert.doesNotMatch(selection,/read_digital_me_dispatcher_grant|base_sha/);
  assert.ok(entry.indexOf('const reconciliation=await reconcileMergedMissions')<entry.indexOf('const result=await runSchedulerTick'));
  assert.ok(entry.includes('readMerge:evidence.readMergedReceipt')&&entry.includes('eligibleMissions:eligible.length,reconciliation,...result'));
});
