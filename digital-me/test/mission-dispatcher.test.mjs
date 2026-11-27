import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchMission } from '../src/mission-dispatcher.mjs';
import { createHash } from 'node:crypto';
const base='a'.repeat(40), head='b'.repeat(40), digest='c'.repeat(64), repo='GLORIFIER7/GLORIFIER';
const idempotencyKey=`github:${repo}:comment:123`;
const id='mission-coding-'+createHash('sha256').update(idempotencyKey).digest('hex');
const start=Date.parse('2026-11-27T12:00:00Z');
function fixture(overrides={}) {
 let time=start, row={id,requester:'github:32674233',idempotencyKey,title:'GitHub fix #471',objective:JSON.stringify({schemaVersion:1,repository:repo,commentId:123,intent:'fix',target:{kind:'issue',number:471,headSha:null},sourceSnapshotSha:base,executionAuthorized:false}),status:'blocked',version:1,verificationState:'not-started',steps:[],evidenceRefs:[],createdAt:new Date(start).toISOString(),updatedAt:new Date(start).toISOString()},writes=0;
 const store={get:async()=>structuredClone(row),save:async(next,v)=>{if(row.version!==v)return null; row=structuredClone({...next,version:v+1});return structuredClone(row);}};
 const auth={repository:repo,missionId:id,base,recipeId:'reviewed-rule',grantId:'grant-1',expiresAt:new Date(start+600_000).toISOString(),revoked:false,executionAuthorized:true,publicationAuthorized:true,maximumCostMicrousd:0};
 const candidate={base,recipeId:'reviewed-rule',digest,redReproduced:true,greenPassed:true,baselinePassed:true};
 const published={head,base,digest,missionId:id,pr:111,author:'glorifier-digital-me[bot]',verified:true,reason:'valid',draft:true,ciJobsCreated:true};
 const deps={store,now:()=>time,workerId:'dispatcher-run-1',getAuthorization:async()=>auth,readMain:async()=>({sha:base,verified:true,reason:'valid'}),prepare:async()=>candidate,verifyCandidate:async()=>true,publish:async()=>{writes++;return {pr:111,head};},readPublication:async()=>published,...overrides};
 return {deps,auth,candidate,published,row:()=>row,writes:()=>writes,advance:n=>{time+=n;}};
}
test('signed draft is independently read back, not claimed as merged or fully verified',async()=>{const f=fixture();const r=await dispatchMission(id,f.deps);assert.equal(r.status,'SIGNED_DRAFT_VERIFIED');assert.equal(f.writes(),1);assert.equal(f.row().status,'blocked');assert.equal(f.row().verificationState,'pending-external-evidence');assert.equal(f.row().dispatcher.phase,'awaiting-review');});
test('replay does not publish twice',async()=>{const f=fixture();await dispatchMission(id,f.deps);assert.equal((await dispatchMission(id,f.deps)).status,'NOT_ELIGIBLE');assert.equal(f.writes(),1);});
test('missing authorization leaves original blocked mission unchanged',async()=>{const f=fixture({getAuthorization:async()=>null});assert.equal((await dispatchMission(id,f.deps)).status,'DENIED');assert.equal(f.row().version,1);assert.equal(f.writes(),0);});
test('stale base fails before claiming or publishing',async()=>{const f=fixture({readMain:async()=>({sha:head,verified:true,reason:'valid'})});assert.equal((await dispatchMission(id,f.deps)).status,'DENIED');assert.equal(f.row().version,1);});
test('already applied is a no-op, never a synthetic PR',async()=>{const f=fixture({prepare:async()=>({status:'already-applied'})});assert.equal((await dispatchMission(id,f.deps)).status,'ALREADY_APPLIED');assert.equal(f.writes(),0);});
test('failed proof cannot publish and consumes bounded attempt',async()=>{const f=fixture({verifyCandidate:async()=>false});assert.equal((await dispatchMission(id,f.deps)).status,'CANDIDATE_REJECTED');assert.equal((await dispatchMission(id,f.deps)).status,'CANDIDATE_REJECTED');assert.equal((await dispatchMission(id,f.deps)).status,'NOT_ELIGIBLE');assert.equal(f.writes(),0);assert.equal(f.row().dispatcher.attempts,2);});
test('uncertain publisher failure quarantines; retry never repeats mutation',async()=>{let calls=0;const f=fixture({publish:async()=>{calls++;throw Error('network');}});assert.equal((await dispatchMission(id,f.deps)).status,'RECONCILIATION_REQUIRED');assert.equal(f.row().status,'reconciliation-required');assert.equal((await dispatchMission(id,f.deps)).status,'NOT_ELIGIBLE');assert.equal(calls,1);});
test('unsigned or wrong-bot readback quarantines publication',async()=>{const f=fixture();f.published.verified=false;assert.equal((await dispatchMission(id,f.deps)).status,'RECONCILIATION_REQUIRED');assert.equal(f.writes(),1);});
test('revoked grant between candidate and publish prevents writes',async()=>{const f=fixture();f.deps.verifyCandidate=async()=>{f.auth.revoked=true;return true;};assert.equal((await dispatchMission(id,f.deps)).status,'DENIED');assert.equal(f.writes(),0);});
test('lease expiry during candidate work prevents publication',async()=>{const f=fixture();f.deps.verifyCandidate=async()=>{f.advance(301_000);return true;};assert.equal((await dispatchMission(id,f.deps)).status,'RECONCILIATION_REQUIRED');assert.equal(f.writes(),0);});
test('concurrent workers cannot both publish',async()=>{const f=fixture();await Promise.all([dispatchMission(id,f.deps),dispatchMission(id,{...f.deps,workerId:'dispatcher-run-2'})]);assert.equal(f.writes(),1);});
test('cancelled or generic queued missions are not claimable',async()=>{const f=fixture();f.row().status='queued';assert.equal((await dispatchMission(id,f.deps)).status,'NOT_ELIGIBLE');assert.equal(f.writes(),0);});

test('scheduled tick selects only the scoped ledger partition and bounded eligible work',async()=>{const {dispatchTick}=await import('../src/mission-dispatcher.mjs');const f=fixture();f.deps.store.listCodingDispatchPage=async(requester,limit,all)=>{assert.equal(requester,'github:32674233');assert.equal(limit,100);assert.equal(all,null);return [{...f.row(),requester:'other'},f.row(),f.row()];};const r=await dispatchTick({...f.deps,enabled:true});assert.equal(r.status,'TICK_COMPLETE');assert.equal(r.results.length,1);assert.equal(r.results[0].status,'SIGNED_DRAFT_VERIFIED');assert.equal(f.writes(),1);});
test('scheduled tick is disabled without explicit activation',async()=>{const {dispatchTick}=await import('../src/mission-dispatcher.mjs');const f=fixture();f.deps.store.listCodingDispatchPage=async()=>{throw Error('must not access store');};assert.equal((await dispatchTick({...f.deps,enabled:false})).status,'DISABLED');assert.equal(f.writes(),0);});
test('scheduled tick rejects truncated/oversized evidence or wrong scope',async()=>{const {dispatchTick}=await import('../src/mission-dispatcher.mjs');const f=fixture();f.deps.store.listCodingDispatchPage=async()=>Array(101).fill(f.row());assert.equal((await dispatchTick({...f.deps,enabled:true})).status,'INVENTORY_INCOMPLETE');assert.equal(f.writes(),0);});
test('wrong bot cannot satisfy signature readback',async()=>{const f=fixture();f.published.author='other-bot';assert.equal((await dispatchMission(id,f.deps)).status,'RECONCILIATION_REQUIRED');});
test('missing CI startup cannot be treated as signed-draft acceptance',async()=>{const f=fixture();f.published.ciJobsCreated=false;assert.equal((await dispatchMission(id,f.deps)).status,'RECONCILIATION_REQUIRED');});
test('persisted publishing intent after crash is never auto-replayed',async()=>{const f=fixture();f.row().status='executing';f.row().dispatcher={phase:'publishing',attempts:1};assert.equal((await dispatchMission(id,f.deps)).status,'NOT_ELIGIBLE');assert.equal(f.writes(),0);});
test('preparation exception after lease expiry quarantines rather than requeues',async()=>{const f=fixture();f.deps.prepare=async()=>{f.advance(301_000);throw Error('expired');};assert.equal((await dispatchMission(id,f.deps)).status,'RECONCILIATION_REQUIRED');assert.equal(f.row().status,'reconciliation-required');assert.equal(f.writes(),0);});

test('a full page of ungranted missions does not starve the next page',async()=>{
 const {dispatchTick}=await import('../src/mission-dispatcher.mjs');
 const f=fixture();
 const firstPage=Array.from({length:100},(_,index)=>({...f.row(),id:'unrelated-'+index}));
 let pages=0;
 f.deps.store.listCodingDispatchPage=async(_requester,_limit,cursor)=>{
  pages++;
  if(!cursor)return firstPage;
  assert.equal(cursor.id,'unrelated-99');
  return [f.row()];
 };
 const result=await dispatchTick({...f.deps,enabled:true});
 assert.equal(pages,2);
 assert.equal(result.results[0].status,'SIGNED_DRAFT_VERIFIED');
});

test('tick continues after explicit pre-claim denial',async()=>{
 const {dispatchTick}=await import('../src/mission-dispatcher.mjs');
 const f=fixture();
 const deniedKey='github:'+repo+':comment:124';
 const deniedId='mission-coding-'+createHash('sha256').update(deniedKey).digest('hex');
 const denied={...f.row(),id:deniedId,idempotencyKey:deniedKey,
   objective:JSON.stringify({...JSON.parse(f.row().objective),commentId:124})};
 const get=f.deps.store.get;
 f.deps.store.get=async id=>id===deniedId?denied:get(id);
 f.deps.getAuthorization=async({missionId})=>missionId===deniedId?null:f.auth;
 f.deps.store.listCodingDispatchPage=async()=>[denied,f.row()];
 const result=await dispatchTick({...f.deps,enabled:true});
 assert.deepEqual(result.results.map(result=>result.status),['DENIED','SIGNED_DRAFT_VERIFIED']);
 assert.equal(f.writes(),1);
});

test('candidate verification renews the lease before publishing with the renewed fence',async t=>{
 t.mock.timers.enable({apis:['setInterval']});
 const f=fixture();
 f.deps.verifyCandidate=async()=>{
  for(let renewal=0;renewal<4;renewal++){
   f.advance(100_000);
   // Drain the promises scheduled by the fake timer before advancing again.
   t.mock.timers.tick(100_000);
   await new Promise(resolve=>setImmediate(resolve));
  }
  return true;
 };
 const publish=f.deps.publish;
 f.deps.publish=async(candidate,fence)=>{
  assert.equal(fence.version,f.row().version);
  assert.equal(fence.leaseExpiresAt,new Date(start+700_000).toISOString());
  return publish(candidate,fence);
 };
 assert.equal((await dispatchMission(id,f.deps)).status,'SIGNED_DRAFT_VERIFIED');
});
