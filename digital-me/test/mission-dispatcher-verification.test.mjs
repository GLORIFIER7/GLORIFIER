import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dispatchMission } from '../src/mission-dispatcher.mjs';

const repo='GLORIFIER7/GLORIFIER';
const base='a'.repeat(40), head='b'.repeat(40), digest='c'.repeat(64);
const idempotencyKey=`github:${repo}:comment:123`;
const id='mission-coding-'+createHash('sha256').update(idempotencyKey).digest('hex');
const time=Date.parse('2026-11-27T12:00:00Z');
function fixture(verification) {
  let writes=0;
  let row={id,requester:'github:32674233',idempotencyKey,status:'blocked',version:1,steps:[],objective:JSON.stringify({schemaVersion:1,repository:repo,commentId:123,intent:'fix',target:{kind:'issue',number:471,headSha:null},sourceSnapshotSha:base,executionAuthorized:false})};
  const store={get:async()=>structuredClone(row),save:async(next,v)=>{if(row.version!==v)return null;row=structuredClone({...next,version:v+1});return structuredClone(row);}};
  const deps={store,now:()=>time,workerId:'dispatcher-run-1',getAuthorization:async()=>({repository:repo,missionId:id,base,recipeId:'reviewed-rule',grantId:'grant-1',expiresAt:new Date(time+600_000).toISOString(),revoked:false,executionAuthorized:true,publicationAuthorized:true,maximumCostMicrousd:0}),readMain:async()=>({sha:base,verified:true,reason:'valid'}),prepare:async()=>({base,recipeId:'reviewed-rule',digest,redReproduced:true,greenPassed:true,baselinePassed:true}),verifyCandidate:async()=>verification,publish:async()=>{writes++;return {pr:111,head};},readPublication:async()=>({head,base,digest,missionId:id,pr:111,author:'glorifier-digital-me[bot]',verified:true,reason:'valid',draft:true,ciJobsCreated:true})};
  return {deps,writes:()=>writes};
}
for(const [label,value] of [['string false','false'],['negative result object',{verified:false}],['number one',1],['false',false],['undefined',undefined]]) {
  test(`rejects verifier result ${label} without publication`,async()=>{
    const f=fixture(value);
    const result=await dispatchMission(id,f.deps);
    assert.equal(f.writes(),0);
    assert.equal(result.status,'CANDIDATE_REJECTED');
  });
}
test('literal true permits verified draft publication',async()=>{
  const f=fixture(true);
  assert.equal((await dispatchMission(id,f.deps)).status,'SIGNED_DRAFT_VERIFIED');
  assert.equal(f.writes(),1);
});
