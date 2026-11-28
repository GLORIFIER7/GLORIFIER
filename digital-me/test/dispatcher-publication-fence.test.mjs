import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicationFence } from '../src/dispatcher-publication-fence.mjs';
const base='a'.repeat(40), digest='b'.repeat(64), missionId='mission-coding-'+'c'.repeat(64);
const fence={missionId,base,digest,recipeId:'dispatcher-receipt-limit',grantId:'grant-1',workerId:'run-1',version:3,leaseExpiresAt:'2026-11-28T12:05:00.000Z'};
function fixture(){
  const state={now:Date.parse('2026-11-28T12:00:00Z'), row:{id:missionId,requester:'github:32674233',status:'executing',version:3,leaseOwner:'run-1',leaseExpiresAt:fence.leaseExpiresAt,dispatcher:{phase:'publishing',recipeId:fence.recipeId,grantId:fence.grantId,base,digest}},grant:{repository:'GLORIFIER7/GLORIFIER',missionId,base,recipeId:fence.recipeId,grantId:fence.grantId,revoked:false,executionAuthorized:true,publicationAuthorized:true,maximumCostMicrousd:0,expiresAt:'2026-11-28T12:10:00.000Z'},main:{sha:base,verified:true,reason:'valid'}};
  const guard=createPublicationFence({store:{get:async()=>structuredClone(state.row)},getAuthorization:async()=>structuredClone(state.grant),readMain:async()=>structuredClone(state.main),now:()=>state.now});
  return {state,guard};
}
test('current lease, exact grant, source and digest permit publication fence',async()=>{const {guard}=fixture();assert.equal(await guard(fence),true);});
test('stale or revoked fences fail closed',async()=>{
  for(const change of [s=>s.row.version++,s=>s.row.leaseOwner='different',s=>s.row.dispatcher.digest='d'.repeat(64),s=>s.row.dispatcher.phase='preparing',s=>s.row.requester='other',s=>s.grant.revoked=true,s=>s.grant.maximumCostMicrousd=1,s=>s.grant.publicationAuthorized=false,s=>s.grant.expiresAt='2026-11-28T11:59:59.000Z',s=>s.main.sha='d'.repeat(40),s=>s.main.verified=false,s=>s.now=Date.parse(fence.leaseExpiresAt)]){
    const {state,guard}=fixture();change(state);await assert.rejects(()=>guard(fence),/PUBLICATION_FENCE_DENIED/);
  }
});
test('revalidates ledger after authorization reads',async()=>{const {state}=fixture();let calls=0;const guard=createPublicationFence({store:{get:async()=>{calls++;return {...state.row,version:calls===1?3:4};}},getAuthorization:async()=>state.grant,readMain:async()=>state.main,now:()=>state.now});await assert.rejects(()=>guard(fence),/PUBLICATION_FENCE_DENIED/);});
test('adapter exceptions are redacted and fail closed',async()=>{const guard=createPublicationFence({store:{get:async()=>{throw Error('private credential');}},getAuthorization:async()=>null,readMain:async()=>null});await assert.rejects(()=>guard(fence),{message:'PUBLICATION_FENCE_DENIED'});});
