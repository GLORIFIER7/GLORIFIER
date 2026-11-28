import test from 'node:test';
import assert from 'node:assert/strict';
import {runSchedulerTick, quarantineExpired} from '../src/dispatcher-scheduler-runtime.mjs';
const base='a'.repeat(40), id='mission-coding-'+'b'.repeat(64), hash='c'.repeat(64);
const source={sha:base,verified:true,reason:'valid'};
const request={missionId:id,base,recipeId:'dispatcher-receipt-limit'};
const candidate={...request,status:'candidate-created',digest:hash,changes:[],baselinePassed:true,redReproduced:true,greenPassed:true};
function fixture(){
  const calls=[];
  const deps={enabled:true,sourceSha:base,workerId:'run-1',now:()=>Date.parse('2026-11-28T12:00:00Z'),store:{},readMain:async()=>source,getAuthorization:async()=>null,
    recoverExpired:async()=>{calls.push('recover');return 0;},
    withCheckout:async(fn)=>{const name='checkout-'+calls.length;calls.push(name);return fn(name);},
    prepare:async()=>{calls.push('prepare');return candidate;},verify:async()=>{calls.push('verify');return true;},
    publish:async()=>{calls.push('publish');return {pr:7,head:'d'.repeat(40)};},
    readPublication:async()=>{calls.push('readback');return {verified:true};},
    dispatchTick:async()=>{calls.push('tick');return {status:'TICK_COMPLETE',results:[]};}};
  return {deps,calls};
}
test('disabled mode has no external interactions',async()=>{const f=fixture();f.deps.enabled=false;assert.deepEqual(await runSchedulerTick(f.deps),{status:'DISABLED',merged:false,fullyVerified:false});assert.deepEqual(f.calls,[]);});
test('unsigned or stale scheduled source stops before recovery or dispatch',async()=>{for(const main of [{...source,verified:false},{...source,sha:'e'.repeat(40)}]){const f=fixture();f.deps.readMain=async()=>main;await assert.rejects(()=>runSchedulerTick(f.deps),/SCHEDULER_SOURCE_DENIED/);assert.deepEqual(f.calls,[]);}});
test('recovery precedes tick and incomplete recovery blocks writes',async()=>{const f=fixture();await runSchedulerTick(f.deps);assert.deepEqual(f.calls,['recover','tick']);f.deps.recoverExpired=async()=>{throw Error('recovery failure');};await assert.rejects(()=>runSchedulerTick(f.deps),/recovery failure/);assert.equal(f.calls.filter(c=>c==='tick').length,1);});
test('candidate preparation and verification use separate checkout sessions; publish requires exact verified candidate',async()=>{
 const f=fixture();f.deps.dispatchTick=async d=>{
   const c=await d.prepare(request);const fence={...request,digest:c.digest};
   await assert.rejects(()=>d.publish(c,fence),/SCHEDULER_CANDIDATE_DENIED/);
   assert.equal(await d.verifyCandidate(c),true);
   await assert.rejects(()=>d.publish({...c,changes:[{path:'unexpected'}]},fence),/SCHEDULER_CANDIDATE_DENIED/);
   const p=await d.publish(c,fence);await d.readPublication(fence,p);return {status:'TICK_COMPLETE',results:[{status:'SIGNED_DRAFT_VERIFIED'}]};
 };const r=await runSchedulerTick(f.deps);assert.equal(r.fullyVerified,false);assert.equal(r.merged,false);assert.equal(f.calls.filter(c=>c.startsWith('checkout-')).length,2);assert.equal(f.calls.filter(c=>c==='publish').length,1);assert.equal(f.calls.at(-1),'readback');
});
test('wrong recipe and failed independent proof cannot publish',async()=>{const f=fixture();f.deps.verify=async()=>false;f.deps.dispatchTick=async d=>{await assert.rejects(()=>d.prepare({...request,recipeId:'other'}),/SCHEDULER_CANDIDATE_DENIED/);const c=await d.prepare(request);assert.equal(await d.verifyCandidate(c),false);await assert.rejects(()=>d.publish(c,{...request,digest:hash}),/SCHEDULER_CANDIDATE_DENIED/);return {status:'TICK_COMPLETE',results:[]};};await runSchedulerTick(f.deps);assert.ok(!f.calls.includes('publish'));});
test('expired publishing lease is quarantined without losing digest; CAS conflict stops recovery',async()=>{
 const row={id,requester:'github:32674233',title:'GitHub fix #471',status:'executing',version:2,leaseOwner:'old',leaseExpiresAt:'2026-11-28T11:00:00Z',dispatcher:{phase:'publishing',attempts:1,base,recipeId:request.recipeId,grantId:'grant-1',digest:hash,provenance:[{outcome:'CANDIDATE_VERIFIED'}]}};
 let saved;const store={save:async(next,version)=>{assert.equal(version,2);saved=next;return next;}};
 assert.equal(await quarantineExpired({rows:[row],store,now:Date.parse('2026-11-28T12:00:00Z')}),1);assert.equal(saved.status,'reconciliation-required');assert.equal(saved.dispatcher.digest,hash);assert.equal(saved.dispatcher.phase,'quarantined');assert.equal(saved.dispatcher.provenance.at(-1).outcome,'RECONCILIATION_REQUIRED');assert.equal(saved.leaseOwner,undefined);
 await assert.rejects(()=>quarantineExpired({rows:[row],store:{save:async()=>null},now:Date.parse('2026-11-28T12:00:00Z')}),/SCHEDULER_RECOVERY_INCOMPLETE/);
});
