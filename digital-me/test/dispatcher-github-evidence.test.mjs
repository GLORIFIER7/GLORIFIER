import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createGithubEvidence} from '../src/dispatcher-github-evidence.mjs';
const repo='GLORIFIER7/GLORIFIER', root='/repos/'+repo, bot='glorifier-digital-me[bot]';
const base='a'.repeat(40),head='b'.repeat(40),id='mission-coding-'+'c'.repeat(64);
const hash=s=>createHash('sha256').update(s).digest('hex');
const contents=Buffer.from('corrected\n');
const changes=[{path:'digital-me/src/example.mjs',before:'3367afdbbf91e638efe983616377c60477cc6612',after:'709f858ed7fdaf963a9edc7d43ef159a21c73954',contents:contents.toString('base64')}];
const digest=hash(JSON.stringify(changes)),branch='digital-me/repair-'+hash(base+id+digest), fence={base,missionId:id,digest};
function fixture(){
 const checks=['Required CI','CodeQL (python, none)','CodeQL (javascript-typescript, none)','npm-security','Dependency Review','validate-and-build'];
 const rules={id:27616646,enforcement:'active',bypass_actors:[],target:'branch',conditions:{ref_name:{include:['refs/heads/main'],exclude:[]}},rules:[{type:'required_signatures'},{type:'non_fast_forward'},{type:'deletion'},{type:'pull_request',parameters:{required_approving_review_count:1,dismiss_stale_reviews_on_push:true,require_code_owner_review:true,require_review_thread_resolution:true}},{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:checks.map(context=>({context,integration_id:15368}))}},{type:'code_scanning',parameters:{code_scanning_tools:[{tool:'CodeQL',security_alerts_threshold:'high_or_higher',alerts_threshold:'errors'}]}},{type:'code_quality',parameters:{severity:'all'}}]};
 const commit={sha:head,author:{login:bot},parents:[{sha:base}],commit:{verification:{verified:true,reason:'valid'}},files:changes.map(f=>({filename:f.path,sha:f.after,status:'modified'}))};
 const pr={number:9,state:'open',draft:true,user:{login:bot},base:{ref:'main',sha:base,repo:{full_name:repo}},head:{ref:branch,sha:head,repo:{full_name:repo}}};
 const run={id:12,head_sha:merge,event:'pull_request',path:'.github/workflows/ci.yml',pull_requests:[{number:9,head:{sha:head,ref:branch}}],status:'in_progress'};
 const jobs={total_count:1,jobs:[{id:13,run_id:12,head_sha:merge,status:'in_progress'}]};
 const state={repoInfo:{full_name:repo,default_branch:'main'},rules,commit,pr,run,runs:{total_count:1,workflow_runs:[run]},jobs,manifest:{changes},main:{sha:base,commit:{verification:{verified:true,reason:'valid'}}},file:{path:changes[0].path,type:'file',encoding:'base64',sha:changes[0].after,content:changes[0].contents}};
 const calls=[];
 const api=async p=>{calls.push(p);if(p===root)return state.repoInfo;if(p===root+'/rulesets/27616646')return state.rules;if(p===root+'/commits/main')return state.main;if(p===root+'/commits/'+head)return state.commit;if(p===root+'/pulls/9')return state.pr;if(p.startsWith(root+'/contents/'))return state.file;if(p===root+'/actions/runs?event=pull_request&branch='+branch+'&per_page=100')return state.runs;if(p===root+'/actions/runs/12/jobs?per_page=100')return state.jobs;throw Error('unknown route');};
 return {state,calls,e:createGithubEvidence({api,resolveManifest:async()=>state.manifest})};
}
test('current governance and signed main are independently read back',async()=>{let f=fixture();assert.deepEqual(await f.e.readMain(),{sha:base,verified:true,reason:'valid'});});
test('missing approval or stale dismissal or bypass fails closed',async()=>{for(const alter of [r=>r.rules[3].parameters.required_approving_review_count=0,r=>r.rules[3].parameters.dismiss_stale_reviews_on_push=false,r=>r.bypass_actors.push({actor_id:2}),r=>r.conditions.ref_name.exclude=['refs/heads/main'],r=>r.rules[4].parameters.required_status_checks.pop()]){let f=fixture();alter(f.state.rules);await assert.rejects(f.e.readMain());}});
test('exact App signed draft and CI jobs are independently verified',async()=>{let f=fixture();let r=await f.e.readPublication(fence,{pr:9,head});assert.equal(r.verified,true);assert.equal(r.ciJobsCreated,true);assert.equal(r.pr,9);assert.equal(r.digest,digest);});
test('unsigned, wrong bot, extra changed files and stale base are rejected',async()=>{for(const alter of [s=>s.commit.commit.verification.verified=false,s=>s.commit.author.login='other',s=>s.commit.files.push({filename:'other',sha:head}),s=>s.pr.base.sha=head,s=>s.main.sha=head,s=>s.pr.head.ref='other']){let f=fixture();alter(f.state);await assert.rejects(f.e.readPublication(fence,{pr:9,head}));}});
test('wrong bytes, mismatched manifest digest and missing CI jobs are rejected',async()=>{for(const alter of [s=>s.file.content=Buffer.from('bad').toString('base64'),s=>s.jobs.jobs=[],s=>s.run.head_sha=base,s=>s.run.conclusion='startup_failure',s=>s.jobs.jobs[0].head_sha=base]){let f=fixture();alter(f.state);await assert.rejects(f.e.readPublication(fence,{pr:9,head}));}let f=fixture();await assert.rejects(f.e.readPublication({...fence,digest:'f'.repeat(64)},{pr:9,head}));});

test('live default-branch selector resolves only to main',async()=>{let f=fixture();f.state.rules.conditions.ref_name.include=['~DEFAULT_BRANCH'];assert.equal((await f.e.readMain()).sha,base);f.state.repoInfo.default_branch='other';await assert.rejects(f.e.readMain());});

test('missing API evidence returns the explicit denial instead of dereferencing a missing record', async () => {
 const missing = [
  state => { state.rules = null; },
  state => { delete state.rules.conditions.ref_name; },
  state => { state.main = null; },
  state => { state.manifest = null; },
  state => { state.commit = null; },
  state => { state.runs = null; },
  state => { state.runs = { total_count: 0, workflow_runs: [] }; },
 ];
 for (const remove of missing) {
  const { state, e } = fixture();
  remove(state);
  await assert.rejects(e.readPublication(fence,{pr:9,head}), { message:'DISPATCHER_GITHUB_EVIDENCE_DENIED' });
 }
});
