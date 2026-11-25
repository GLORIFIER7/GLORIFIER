import test from 'node:test';
import assert from 'node:assert/strict';
import { admitCodingMission } from '../src/coding-mission-admission.mjs';

const repo = 'GLORIFIER7/GLORIFIER';
const sha = 'a'.repeat(40);
const now = '2026-11-25T12:00:00.000Z';
const context = { env: { GITHUB_REPOSITORY: repo, GITHUB_EVENT_NAME: 'issue_comment', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha, GITHUB_ACTOR_ID: '32674233', GITHUB_TRIGGERING_ACTOR: 'GLORIFIER7' }, event: { action: 'created', repository: { full_name: repo }, sender: { id: 32674233, type: 'User' }, issue: { number: 1034, state: 'open' }, comment: { id: 123, user: { id: 32674233, type: 'User' }, body: '/glorifier fix' } } };
const evidence = { schemaVersion: 1, id: 'github-comment-123', status: 'TARGET_VERIFIED', repository: repo, intent: 'fix', target: { kind: 'issue', number: 1034, headSha: null }, requestedBy: 32674233, sourceSnapshotSha: sha, targetHeadVerified: false, executionAuthorized: false, paidInferenceAuthorized: false, mergeAuthorized: false, deploymentAuthorized: false, fullyVerified: false };
function fixture(overrides = {}) {
  const records = new Map(); let calls = 0;
  const store = { async create(m) { calls++; const key = JSON.stringify([m.requester,m.idempotencyKey]); if (!records.has(key)) records.set(key, structuredClone(m)); return structuredClone(records.get(key)); } };
  return { records, get calls() { return calls; }, deps: { store, verifyTarget: async () => structuredClone(evidence), now: () => now, ...overrides } };
}
test('admits a verified target into the existing ledger, blocked from generic workers', async () => {
  const f = fixture(); const result = await admitCodingMission(context, f.deps);
  assert.equal(result.status, 'ADMITTED_BLOCKED'); assert.equal(result.executionAuthorized, false); assert.equal(result.publicationAuthorized, false);
  const m = [...f.records.values()][0]; assert.equal(m.status, 'blocked'); assert.equal(m.version, 1); assert.deepEqual(m.steps, []); assert.equal(m.requester, 'github:32674233'); assert.equal(m.idempotencyKey, 'github:GLORIFIER7/GLORIFIER:comment:123'); assert.equal(JSON.parse(m.objective).sourceSnapshotSha, sha);
});
test('concurrent replay uses the same atomic ledger identity without updating existing state', async () => {
  const f = fixture(); const r = await Promise.all(Array.from({length: 8}, () => admitCodingMission(context,f.deps)));
  assert.equal(f.records.size, 1); assert.equal(new Set(r.map(x=>x.missionId)).size, 1);
});
test('rejected or ignored command never writes', async () => {
  const f = fixture({verifyTarget: async () => ({status:'IGNORED'})});
  assert.deepEqual(await admitCodingMission(context,f.deps),{status:'IGNORED'}); assert.equal(f.calls,0);
});
test('rejects changed verified base, actor, target or an execution grant', async () => {
  for (const patch of [{sourceSnapshotSha:'b'.repeat(40)},{requestedBy:9},{target:{kind:'issue',number:99,headSha:null}},{executionAuthorized:true},{paidInferenceAuthorized:true},{mergeAuthorized:true},{deploymentAuthorized:true},{fullyVerified:true}]) {
    const f = fixture({verifyTarget: async () => ({...evidence,...patch})}); await assert.rejects(admitCodingMission(context,f.deps)); assert.equal(f.calls,0);
  }
});
test('does not trust a caller supplying a forged owner context', async () => {
  const f=fixture(); const bad=structuredClone(context);bad.event.sender.id=9;
  await assert.rejects(admitCodingMission(bad,f.deps)); assert.equal(f.calls,0);
});
test('rejects conflicting stored evidence rather than replacing an old mission', async () => {
  const f=fixture(); await admitCodingMission(context,f.deps);const stored=[...f.records.values()][0];stored.objective='different immutable objective';
  await assert.rejects(admitCodingMission(context,f.deps),/conflict/i);assert.equal(f.records.size,1);assert.equal(stored.objective,'different immutable objective');
});
test('replay of a progressed mission does not grant execution or reset its state', async () => {
  const f=fixture();await admitCodingMission(context,f.deps);const m=[...f.records.values()][0];m.status='cancelled';m.version=2;
  const r=await admitCodingMission(context,f.deps);assert.equal(r.status,'ALREADY_ADMITTED');assert.equal(r.missionStatus,'cancelled');assert.equal(r.executionAuthorized,false);assert.equal(m.version,2);
});
test('failed ledger writes are not reported as accepted', async () => {
  const f=fixture({store:{create:async()=>{throw Error('database unavailable')}}});await assert.rejects(admitCodingMission(context,f.deps),/database unavailable/);
});
