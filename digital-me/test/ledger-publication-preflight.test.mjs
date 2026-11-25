import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectPublicationLease, publicationDigest } from '../src/ledger-publication-preflight.mjs';
const now='2026-11-25T04:30:00.000Z';
const base='a'.repeat(40), source='b'.repeat(40), digest='c'.repeat(64);
const args={repository:'GLORIFIER7/GLORIFIER',base,source,patchPath:'repair.patch',patchSha256:digest,paths:['src/lib/use-accessible-dialog.ts']};
const intent={missionId:'mission-1',stepId:'publish-1',requester:'owner-uid',workerId:'digital-me-run-1',version:4,now};
const fixture=()=>({id:intent.missionId,requester:intent.requester,version:4,status:'executing',leaseOwner:intent.workerId,leaseExpiresAt:'2026-11-25T04:35:00.000Z',steps:[{id:intent.stepId,capability:'github.publish_reviewed_patch',effect:'reversible',status:'running',attemptCount:1,idempotencyKey:'reviewed-patch-1',toolArguments:structuredClone(args),approval:{approvedBy:'owner-uid',approvedAt:'2026-11-25T04:25:00.000Z',evidenceRef:'approval-1'}}]});
function setup(change=()=>{},overrides={}){let m=fixture();change(m);const calls=[];const deps={now:()=>now,getMission:async id=>{calls.push(['get',id]);return structuredClone(m)},getSignedMain:async()=>({sha:base,verified:true,reason:'valid'}),verifyApproval:async ({authorizationDigest})=>({verified:true,principal:'owner-uid',authorizationDigest,expiresAt:'2026-11-25T04:40:00.000Z'}),...overrides};return {m,calls,deps,run:()=>inspectPublicationLease(intent,deps)}}
test('exact claimed mission yields read-only preflight, no write authorization',async()=>{const f=setup();const r=await f.run();assert.equal(r.status,'preflight-passed');assert.equal(r.publicationAuthorized,false);assert.equal(r.authorizationDigest,publicationDigest(f.m));assert.equal(f.calls.length,2)});
for(const [label,mutate] of [['wrong requester',m=>m.requester='other'],['wrong lease owner',m=>m.leaseOwner='other'],['stale version',m=>m.version++],['expired lease',m=>m.leaseExpiresAt=now],['cancelled mission',m=>m.status='cancelled'],['replayed step',m=>m.steps[0].status='completed'],['retry after possible side effects',m=>m.steps[0].attemptCount=2],['wrong capability',m=>m.steps[0].capability='github.update_file'],['unreviewed path',m=>m.steps[0].toolArguments.paths=['src/lib/autopilot-github-write.ts']],['missing approval',m=>delete m.steps[0].approval],['different approval principal',m=>m.steps[0].approval.approvedBy='other'],['multiple steps',m=>m.steps.push(structuredClone(m.steps[0]))]])test(label,async()=>{const f=setup(mutate);await assert.rejects(f.run());});
test('unsigned or stale main rejected',async()=>{for(const v of [{sha:base,verified:false,reason:'unsigned'},{sha:source,verified:true,reason:'valid'}])await assert.rejects(setup(()=>{},{getSignedMain:async()=>v}).run());});
test('independent approval proof must bind exact immutable authorization',async()=>{for(const v of [{verified:false},{verified:true,principal:'owner-uid',authorizationDigest:'wrong',expiresAt:'2026-11-25T04:40:00.000Z'},{verified:true,principal:'owner-uid',authorizationDigest:publicationDigest(fixture()),expiresAt:now}])await assert.rejects(setup(()=>{},{verifyApproval:async()=>v}).run());});
test('revocation or concurrent ledger mutation during proof check blocks preflight',async()=>{let count=0;const f=setup(()=>{},{getMission:async()=>{const m=fixture();if(++count===2)m.status='cancelled';return m}});await assert.rejects(f.run());});
test('digest changes when immutable patch or approval identity changes',()=>{const a=fixture(),b=fixture();b.steps[0].toolArguments.patchSha256='d'.repeat(64);assert.notEqual(publicationDigest(a),publicationDigest(b));b.steps[0].toolArguments.patchSha256=digest;b.steps[0].approval.evidenceRef='approval-2';assert.notEqual(publicationDigest(a),publicationDigest(b));});

test('immutable argument key validation does not rely on default alphabetical sorting', async () => {
  const { readFile } = await import('node:fs/promises');
  const sourceText = await readFile(new URL('../src/ledger-publication-preflight.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(sourceText, /Object\.keys\([^)]*\)\.sort\(\s*\)/);
});
test('authorization digest is invariant to insertion order of approved argument keys', () => {
  const first = fixture();
  const second = fixture();
  const original = second.steps[0].toolArguments;
  second.steps[0].toolArguments = { source: original.source, repository: original.repository, paths: original.paths, patchSha256: original.patchSha256, patchPath: original.patchPath, base: original.base };
  assert.equal(publicationDigest(first), publicationDigest(second));
});
test('exact argument schema rejects missing or substituted keys and hidden required keys', async () => {
  for (const modify of [
    a => { delete a.source; },
    a => { delete a.source; a.unexpected = source; },
    a => { a.unexpected = true; },
    a => { Object.defineProperty(a, 'source', { enumerable: false }); a.unexpected = source; },
  ]) {
    await assert.rejects(setup(m => modify(m.steps[0].toolArguments)).run(), /invalid immutable target/);
  }
});


test('lease expiry during approval verification prevents preflight success', async () => {
  let clock=now;
  const f=setup(()=>{}, {now:()=>clock, verifyApproval:async ({authorizationDigest})=>{
    clock='2026-11-25T04:36:00.000Z';
    return {verified:true,principal:'owner-uid',authorizationDigest,expiresAt:'2026-11-25T04:40:00.000Z'};
  }});
  await assert.rejects(f.run(), /lease expired/);
});
test('approval proof expiry during final ledger read prevents preflight success', async () => {
  let clock=now, reads=0;
  const f=setup(()=>{}, {now:()=>clock, getMission:async()=>{
    if (++reads===2) clock='2026-11-25T04:32:00.000Z';
    return fixture();
  }, verifyApproval:async ({authorizationDigest})=>({verified:true,principal:'owner-uid',authorizationDigest,expiresAt:'2026-11-25T04:32:00.000Z'})});
  await assert.rejects(f.run(), /approval proof.*expired/);
});
test('trusted clock must exist and return a valid non-regressing timestamp', async () => {
  for (const clock of [undefined,()=> 'invalid',()=> '2026-11-25T04:29:59.999Z']) {
    await assert.rejects(setup(()=>{}, {now:clock}).run(), /trusted/);
  }
});
test('fresh final time within lease and approval windows preserves digest and no-write result', async () => {
  const f=setup(()=>{}, {now:()=> '2026-11-25T04:34:59.999Z'});
  const result=await f.run();
  assert.equal(result.authorizationDigest, publicationDigest(f.m));
  assert.equal(result.publicationAuthorized,false);
});

test('PostgreSQL lease timestamps with explicit offsets and variable precision pass both reads', async () => {
  for (const lease of ['2026-11-25T04:35:00+00:00','2026-11-25T11:35:00+07:00','2026-11-25T04:35:00.123456Z','2026-11-25T04:35:00.1+00:00']) {
    const f=setup(m=>m.leaseExpiresAt=lease);
    assert.equal((await f.run()).publicationAuthorized,false);
    assert.equal(f.calls.length,2);
  }
});
test('ledger timestamps reject missing zones, impossible calendar dates and invalid offsets', async () => {
  for (const lease of ['2026-11-25T04:35:00','2026-02-30T04:35:00+00:00','2026-11-25T04:35:00+24:00','2026-11-25T04:35:00-00:00','2026-11-25T04:35:60Z']) {
    await assert.rejects(setup(m=>m.leaseExpiresAt=lease).run(),/lease expired or invalid/);
  }
});
test('offset lease expires at final trusted time and changed lease is rejected', async () => {
  const lease='2026-11-25T11:35:00+07:00';
  await assert.rejects(setup(m=>m.leaseExpiresAt=lease,{now:()=> '2026-11-25T04:35:00.000Z'}).run(),/lease expired/);
  let reads=0;
  await assert.rejects(setup(()=>{}, {getMission:async()=>{
    const m=fixture(); m.leaseExpiresAt=++reads===1?lease:'2026-11-25T11:36:00+07:00'; return m;
  }}).run(),/lease changed/);
});
