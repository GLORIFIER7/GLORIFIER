import test from 'node:test';
import assert from 'node:assert/strict';
import {publish, BASE, filesFor, plan, validateActionsContext} from '../src/publish-reviewer-v3.mjs';
const head='a'.repeat(40), repo='/repos/GLORIFIER7/GLORIFIER';
function fake({changedBase=false, signed=true, workflows=true, wrongAuthor=false, wrongFile=false,base=BASE}={}) {
 const calls=[];
 const api=async (path,token,method='GET',body)=>{
  calls.push({path,method,body});
  if(path===repo+'/installation')return {id:123,app_id:5876036,account:{login:'GLORIFIER7'},repository_selection:'selected',permissions:{contents:'write',pull_requests:'write',workflows:workflows?'write':'read'}};
  if(path==='/app/installations/123/access_tokens')return {token:'fake-installation-token',repository_selection:'selected',permissions:body.permissions,repositories:[{full_name:'GLORIFIER7/GLORIFIER'}]};
  if(path===repo+'/commits/main')return {sha:changedBase?'b'.repeat(40):base,commit:{verification:{verified:true,reason:'valid'}}};
  if(path.startsWith(repo+'/contents/'))return [];
  if(path===repo+'/git/refs')return {ref:body.ref,object:{sha:base}};
  if(path==='/graphql')return {data:{createCommitOnBranch:{commit:{oid:head}}}};
  if(path===repo+'/commits/'+head){const adds=calls.find(c=>c.path==='/graphql').body.variables.input.fileChanges.additions;return {sha:head,author:{login:wrongAuthor?'other':'glorifier-digital-me[bot]'},parents:[{sha:base}],commit:{verification:{verified:signed,reason:signed?'valid':'unsigned'}},files:adds.map((f,i)=>({filename:f.path,status:'added',sha:wrongFile&&i===0?'wrong':filesFor(true).find(x=>x.path===f.path).blob}))};}
  if(path===repo+'/pulls')return {number:123,draft:true,head:{sha:head},user:{login:'glorifier-digital-me[bot]'},html_url:'https://github.com/GLORIFIER7/GLORIFIER/pull/123'};
  if(path==='/installation/token')return null;
  throw Error('unexpected '+path);
 };return {api,calls};
}
test('plan has exact seven additions and no secret',()=>{const p=plan(true);assert.equal(p.files.length,7);assert.equal(p.base,BASE);assert.equal(p.files.filter(x=>x.path.startsWith('.github/')).length,1);assert.equal(filesFor(false).length,6);assert.ok(!JSON.stringify(p).includes('PRIVATE KEY'));});
test('publishes fixed exact additions as a signed draft only',async()=>{const f=fake();const out=await publish({api:f.api,jwt:'test-jwt',includeWorkflow:true});assert.equal(out.pr,123);assert.equal(out.sha,head);const q=f.calls.find(c=>c.path==='/graphql').body.variables.input;assert.equal(q.expectedHeadOid,BASE);assert.equal(q.fileChanges.additions.length,7);assert.ok(f.calls.find(c=>c.path===repo+'/pulls').body.draft);assert.ok(!f.calls.some(c=>/merge|reviews/.test(c.path)));assert.equal(f.calls.at(-1).path,'/installation/token');});
test('changed main rejects before creating a branch',async()=>{const f=fake({changedBase:true});await assert.rejects(publish({api:f.api,jwt:'test-jwt',includeWorkflow:true}),/main/);assert.ok(!f.calls.some(c=>c.path.endsWith('/git/refs')));});
test('missing workflows write permission rejects before token or branch creation',async()=>{const f=fake({workflows:false});await assert.rejects(publish({api:f.api,jwt:'test-jwt',includeWorkflow:true}),/workflows/);assert.equal(f.calls.length,1);});
test('source-only publication does not request workflows write',async()=>{const f=fake({workflows:false});await publish({api:f.api,jwt:'test-jwt',includeWorkflow:false});assert.equal(f.calls.find(c=>c.path.includes('access_tokens')).body.permissions.workflows,undefined);assert.equal(f.calls.find(c=>c.path==='/graphql').body.variables.input.fileChanges.additions.length,6);});
for(const [name,options] of [['unsigned',{signed:false}],['unexpected author',{wrongAuthor:true}],['unexpected file digest',{wrongFile:true}]])test(name+' prevents draft creation',async()=>{const f=fake(options);await assert.rejects(publish({api:f.api,jwt:'test-jwt',includeWorkflow:true}),/verification/);assert.ok(!f.calls.some(c=>c.path===repo+'/pulls'));});

const sha='a'.repeat(40);
const env={GITHUB_REPOSITORY:'GLORIFIER7/GLORIFIER',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_ACTOR_ID:'32674233',GITHUB_ACTOR:'GLORIFIER7',GITHUB_TRIGGERING_ACTOR:'GLORIFIER7',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:sha,DIGITAL_ME_CONFIRM_PUBLICATION:'true'};
test('exact owner manual main invocation binds expected base',()=>assert.equal(validateActionsContext(env),sha));
for(const [key,val] of Object.entries({GITHUB_REPOSITORY:'other/repo',GITHUB_REF:'refs/heads/test',GITHUB_EVENT_NAME:'push',GITHUB_ACTOR_ID:'1',GITHUB_ACTOR:'other',GITHUB_TRIGGERING_ACTOR:'other',GITHUB_RUN_ATTEMPT:'2',GITHUB_SHA:'bad',DIGITAL_ME_CONFIRM_PUBLICATION:'false'}))test('reject '+key,()=>assert.throws(()=>validateActionsContext({...env,[key]:val}),/context/));
test('existing destination stops before branch creation',async()=>{const f=fake();const api=(path,...args)=>path.startsWith(repo+'/contents/')?Promise.resolve([{path:'digital-me/src/review-collector.mjs'}]):f.api(path,...args);await assert.rejects(publish({api,jwt:'test-jwt'}),/destination already exists/);assert.ok(!f.calls.some(c=>c.path.endsWith('/git/refs')));});

test('publication binds to the reviewed workflow main SHA instead of historical base',async()=>{const base='c'.repeat(40);const f=fake({base});await publish({api:f.api,jwt:'test-jwt',expectedBase:base});assert.equal(f.calls.find(c=>c.path==='/graphql').body.variables.input.expectedHeadOid,base);assert.equal(f.calls.find(c=>c.path.endsWith('/git/refs')).body.sha,base);});
