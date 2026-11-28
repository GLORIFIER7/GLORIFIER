import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dispatchMission } from '../src/mission-dispatcher.mjs';
const repo='GLORIFIER7/GLORIFIER',base='a'.repeat(40),head='b'.repeat(40),digest='c'.repeat(64);
const key=`github:${repo}:comment:123`,id='mission-coding-'+createHash('sha256').update(key).digest('hex');
const now=Date.parse('2026-11-28T02:00:00Z');
function fixture(){
  let row={id,requester:'github:32674233',idempotencyKey:key,title:'GitHub fix #471',objective:JSON.stringify({schemaVersion:1,repository:repo,intent:'fix',target:{kind:'issue',number:471,headSha:null},commentId:123,sourceSnapshotSha:base,executionAuthorized:false}),status:'blocked',version:1,steps:[],evidenceRefs:['existing-evidence'],verificationState:'not-started'};
  const store={get:async()=>structuredClone(row),save:async(next,version)=>{if(row.version!==version)return null;row=structuredClone({...next,version:version+1});return structuredClone(row);}};
  const deps={store,now:()=>now,workerId:'run-1',getAuthorization:async()=>({repository:repo,missionId:id,base,recipeId:'reviewed-recipe',grantId:'grant-1',revoked:false,executionAuthorized:true,publicationAuthorized:true,maximumCostMicrousd:0,expiresAt:new Date(now+600000).toISOString()}),readMain:async()=>({sha:base,verified:true,reason:'valid'}),prepare:async()=>({base,recipeId:'reviewed-recipe',digest,baselinePassed:true,redReproduced:true,greenPassed:true}),verifyCandidate:async()=>true,publish:async()=>({head,pr:111}),readPublication:async()=>({missionId:id,base,digest,head,pr:111,author:'glorifier-digital-me[bot]',verified:true,reason:'valid',draft:true,ciJobsCreated:true})};
  return {deps,row:()=>structuredClone(row)};
}
test('durable intent includes independently verified candidate before external write',async()=>{
  const f=fixture();let before;
  f.deps.publish=async()=>{before=f.row();return {head,pr:111};};
  const result=await dispatchMission(id,f.deps);
  assert.equal(result.status,'SIGNED_DRAFT_VERIFIED');
  assert.deepEqual(before.dispatcher.provenance.map(e=>e.outcome),['CLAIMED','CANDIDATE_VERIFIED']);
  const proof=before.dispatcher.provenance.at(-1);
  assert.equal(proof.candidateDigest,digest);assert.equal(proof.base,base);assert.equal(proof.grantId,'grant-1');assert.equal(proof.workerId,'run-1');assert.equal(proof.maximumCostMicrousd,0);assert.equal(proof.at,new Date(now).toISOString());
  assert.deepEqual(proof.candidateVerification,{baselinePassed:true,redReproduced:true,greenPassed:true,independentVerifierPassed:true});
});
test('signed draft readback adds durable references without asserting merge or completion',async()=>{
  const f=fixture();await dispatchMission(id,f.deps);const row=f.row();
  assert.equal(row.status,'blocked');assert.equal(row.verificationState,'pending-external-evidence');
  assert.deepEqual(row.evidenceRefs,['existing-evidence',`https://github.com/${repo}/pull/111`,`https://github.com/${repo}/commit/${head}`]);
  const proof=row.dispatcher.provenance.at(-1);assert.equal(proof.outcome,'SIGNED_DRAFT_VERIFIED');assert.equal(proof.head,head);assert.equal(proof.pr,111);assert.equal(proof.candidateDigest,digest);
});
test('retries preserve bounded prior attempt outcomes without leaking errors',async()=>{
  const f=fixture();f.deps.prepare=async()=>{throw Error('secret-should-not-persist');};
  assert.equal((await dispatchMission(id,f.deps)).status,'CANDIDATE_REJECTED');
  assert.equal((await dispatchMission(id,f.deps)).status,'CANDIDATE_REJECTED');
  assert.deepEqual(f.row().dispatcher.provenance.map(e=>[e.attempt,e.outcome]),[[1,'CLAIMED'],[1,'CANDIDATE_REJECTED'],[2,'CLAIMED'],[2,'CANDIDATE_REJECTED']]);
  assert.equal(JSON.stringify(f.row()).includes('secret-should-not-persist'),false);
  assert.equal((await dispatchMission(id,f.deps)).status,'NOT_ELIGIBLE');
});
test('uncertain publication retains candidate digest and never invents readback links',async()=>{
  const f=fixture();f.deps.publish=async()=>{throw Error('uncertain');};
  assert.equal((await dispatchMission(id,f.deps)).status,'RECONCILIATION_REQUIRED');
  const row=f.row();assert.equal(row.status,'reconciliation-required');assert.deepEqual(row.evidenceRefs,['existing-evidence']);
  assert.deepEqual(row.dispatcher.provenance.map(e=>e.outcome),['CLAIMED','CANDIDATE_VERIFIED','RECONCILIATION_REQUIRED']);assert.equal(row.dispatcher.provenance.at(-1).candidateDigest,digest);
});
test('each retry transition preserves only the newest five receipts',async()=>{
  const f=fixture();
  const row=await f.deps.store.get(id);
  const prior=Array.from({length:5},(_,i)=>({outcome:`prior-${i}`}));
  await f.deps.store.save({...row,dispatcher:{phase:'retryable',attempts:1,provenance:prior}},row.version);
  let claim;
  f.deps.prepare=async()=>{claim=f.row().dispatcher.provenance;throw Error('candidate rejected');};
  assert.equal(await dispatchMission(id,f.deps).then(r=>r.status),'CANDIDATE_REJECTED');
  assert.deepEqual(claim.map(e=>e.outcome),['prior-1','prior-2','prior-3','prior-4','CLAIMED']);
  assert.deepEqual(f.row().dispatcher.provenance.map(e=>e.outcome),['prior-2','prior-3','prior-4','CLAIMED','CANDIDATE_REJECTED']);
});
