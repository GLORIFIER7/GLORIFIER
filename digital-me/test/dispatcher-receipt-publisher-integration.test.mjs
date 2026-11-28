import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createReceiptPublisher} from '../src/dispatcher-receipt-publisher.mjs';
import {recipeId,recipePaths,repairStatus,deriveRepair} from '../src/dispatcher-receipt-recipe.mjs';
const repo='GLORIFIER7/GLORIFIER',root='/repos/'+repo,bot='glorifier-digital-me[bot]';
const base='a'.repeat(40),head='d'.repeat(40),missionId='mission-coding-'+'c'.repeat(64);
const source=recipePaths.map(path=>readFileSync(new URL('../../'+path,import.meta.url)));
const state=repairStatus(source);
function fixture(failAt=0){
  const manifest=deriveRepair(source), candidate={missionId,base,recipeId,status:'candidate-created',baselinePassed:true,redReproduced:true,greenPassed:true,...manifest};
  const fence={missionId,base,recipeId,digest:manifest.digest};
  const branch='digital-me/repair-'+createHash('sha256').update(base+missionId+manifest.digest).digest('hex'),ref='refs/heads/'+branch;
  const pr={number:7,state:'open',draft:true,user:{login:bot},base:{ref:'main',sha:base,repo:{full_name:repo}},head:{ref:branch,sha:head,repo:{full_name:repo}}};
  const writes=[];let guards=0;
  const api=async(path,method='GET',body)=>{
    if(method!=='GET')writes.push({path,method,body});
    if(path.startsWith(root+'/contents/')){
      const i=recipePaths.findIndex(p=>path.startsWith(root+'/contents/'+p+'?ref='));assert.ok(i>=0);
      const initial=path.endsWith(base),f=manifest.changes[i];
      return {type:'file',path:f.path,sha:initial?f.before:f.after,encoding:'base64',content:initial?source[i].toString('base64'):f.contents};
    }
    if(path.startsWith(root+'/pulls?')||path.startsWith(root+'/git/matching-refs/'))return [];
    if(path===root+'/git/refs')return {ref,object:{sha:base}};
    if(path==='/graphql')return {data:{createCommitOnBranch:{commit:{oid:head}}}};
    if(path===root+'/commits/'+head)return {sha:head,commit:{verification:{verified:true,reason:'valid'}},author:{login:bot},parents:[{sha:base}],files:manifest.changes.map(f=>({filename:f.path,status:'modified',sha:f.after}))};
    if(path===root+'/pulls'||path===root+'/pulls/7')return pr;
    throw Error('Unexpected test endpoint');
  };
  const publish=createReceiptPublisher({api,assertFence:async()=>++guards!==failAt});
  return {publish,candidate,fence,writes,branch};
}
test('real recipe preimages yield only a fenced signed branch and draft', {skip:state==='already-applied'},async()=>{
  const f=fixture();assert.deepEqual(await f.publish(f.candidate,f.fence),{pr:7,head});
  assert.equal(f.writes.length,3);assert.equal(f.writes[1].body.variables.input.expectedHeadOid,base);assert.equal(f.writes[2].body.draft,true);assert.equal(f.writes[2].body.head,f.branch);
});
test('each mutation has its own authorization fence', {skip:state==='already-applied'},async()=>{
  for(const n of [1,2,3]){const f=fixture(n);await assert.rejects(()=>f.publish(f.candidate,f.fence),/SIGNED_RECEIPT_PUBLICATION_DENIED/);assert.equal(f.writes.length,n-1);}
});
