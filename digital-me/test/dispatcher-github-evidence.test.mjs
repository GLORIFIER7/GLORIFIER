import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createGithubEvidence,githubReadApi} from '../src/dispatcher-github-evidence.mjs';
const repo='GLORIFIER7/GLORIFIER', root='/repos/'+repo, bot='glorifier-digital-me[bot]';
const base='a'.repeat(40),head='b'.repeat(40),merge='d'.repeat(40),id='mission-coding-'+'c'.repeat(64);
const hash=s=>createHash('sha256').update(s).digest('hex');
const contents=Buffer.from('corrected\n');
const changes=[{path:'digital-me/src/example.mjs',before:'3367afdbbf91e638efe983616377c60477cc6612',after:'709f858ed7fdaf963a9edc7d43ef159a21c73954',contents:contents.toString('base64')}];
const digest=hash(JSON.stringify(changes)),branch='digital-me/repair-'+hash(base+id+digest), fence={base,missionId:id,digest};
function fixture(){
 const checks=['Required CI','CodeQL (python, none)','CodeQL (javascript-typescript, none)','npm-security','Dependency Review','validate-and-build'];
 const rules={id:28293483,enforcement:'active',bypass_actors:[],target:'branch',conditions:{ref_name:{include:['refs/heads/main'],exclude:[]}},rules:[{type:'required_signatures'},{type:'non_fast_forward'},{type:'deletion'},{type:'pull_request',parameters:{required_approving_review_count:1,dismiss_stale_reviews_on_push:true,require_code_owner_review:true,required_review_thread_resolution:true}},{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:checks.map(context=>({context,integration_id:15368}))}},{type:'code_scanning',parameters:{code_scanning_tools:[{tool:'CodeQL',security_alerts_threshold:'high_or_higher',alerts_threshold:'errors'}]}},{type:'code_quality',parameters:{severity:'all'}}]};
 const commit={sha:head,author:{login:bot,id:359913464},committer:{login:'web-flow',id:19864447},parents:[{sha:base}],commit:{verification:{verified:true,reason:'valid',signature:'-----BEGIN PGP SIGNATURE-----',payload:'author '+bot+' <359913464+'+bot+'@users.noreply.github.com> 123 +0000\ncommitter GitHub <noreply@github.com> 123 +0000\n\nmessage'}},files:changes.map(f=>({filename:f.path,sha:f.after,status:'modified'}))};
 const pr={number:9,state:'open',draft:true,user:{login:bot,id:359913464},merge_commit_sha:merge,base:{ref:'main',sha:base,repo:{full_name:repo}},head:{ref:branch,sha:head,repo:{full_name:repo}}};
 const association={number:9,base:{sha:base,ref:'main',repo:{id:1377237797}},head:{sha:head,ref:branch,repo:{id:1377237797}}};
 const run={id:12,check_suite_id:14,run_attempt:1,head_branch:branch,head_sha:merge,event:'pull_request',path:'.github/workflows/ci.yml',pull_requests:[association],status:'in_progress'};
 const suite={id:14,app:{id:15368},head_sha:merge,head_branch:branch,pull_requests:[association]};
 const mergeCommit={sha:merge,parents:[{sha:base},{sha:head}]};
 const jobs={total_count:1,jobs:[{id:13,name:'build',run_id:12,run_attempt:1,head_sha:merge,status:'in_progress'}]};
 const state={repoInfo:{full_name:repo,default_branch:'main'},rules,commit,pr,run,suite,mergeCommit,runs:{total_count:1,workflow_runs:[run]},jobs,manifest:{changes},main:{sha:base,commit:{verification:{verified:true,reason:'valid'}}},file:{path:changes[0].path,type:'file',encoding:'base64',sha:changes[0].after,content:changes[0].contents}};
 const calls=[];
 const api=async p=>{calls.push(p);if(p===root)return state.repoInfo;if(p===root+'/rulesets/28293483')return state.rules;if(p===root+'/commits/main')return state.main;if(p===root+'/commits/'+head)return state.commit;if(p===root+'/commits/'+merge)return state.mergeCommit;if(p===root+'/check-suites/14')return state.suite;if(p===root+'/pulls/9')return state.pr;if(p.startsWith(root+'/contents/'))return state.file;if(p.startsWith(root+'/actions/runs?'))return state.runs;if(p===root+'/actions/runs/12/attempts/1/jobs?per_page=100')return state.jobs;throw Error('unknown route');};
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
  state => { state.runs = undefined; },
  state => { state.runs.workflow_runs = null; },
  state => { state.runs.total_count = 2; },
  state => { state.jobs = null; },
  state => { state.jobs = undefined; },
  state => { state.jobs.jobs = null; },
  state => { state.jobs.total_count = 2; },
  state => { state.jobs = { total_count: 0, jobs: [] }; },
 ];
 for (const remove of missing) {
  const { state, e } = fixture();
  remove(state);
  await assert.rejects(e.readPublication(fence,{pr:9,head}), { message:'DISPATCHER_GITHUB_EVIDENCE_DENIED' });
 }
});

test('CI must bind the expected build, base, App check suite and tested merge parents',async()=>{
 for(const change of [
  s=>s.run.pull_requests=[{...s.run.pull_requests[0],base:{sha:head}}],
  s=>s.mergeCommit.parents[0].sha=head,
  s=>s.suite.app.id=1,
  s=>s.jobs.jobs[0].name='unrelated',
  s=>s.commit.committer.login='unexpected',
  s=>s.commit.commit.verification.payload=s.commit.commit.verification.payload.replace('noreply@github.com','elsewhere@example.com'),
 ]){
  const {state,e}=fixture();change(state);
  await assert.rejects(e.readPublication(fence,{pr:9,head}),{message:'DISPATCHER_GITHUB_EVIDENCE_DENIED'});
 }
});

test('GitHub reader scopes GETs, rejects encoded paths and redacts failures',async()=>{
 const rejected={message:'DISPATCHER_GITHUB_EVIDENCE_DENIED'};
 const get=githubReadApi('safe-token',async(url,options)=>{
  assert.equal(url.origin,'https://api.github.com');
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  assert.ok(options.signal instanceof AbortSignal);
  return {ok:true,json:async()=>({accepted:true})};
 });
 assert.deepEqual(await get(root+'/commits/main'),{accepted:true});
 for(const path of [root+'/foo%2fbar',root+'/foo%5cbar',root+'/foo%252fbar',root+'/../../outside']){
  await assert.rejects(get(path),rejected);
 }
 assert.throws(()=>githubReadApi('a token'),rejected);
 for(const fetcher of [
  async()=>({ok:false,status:401}),
  async()=>({ok:false,status:503}),
  async()=>{throw new TypeError('safe-token');},
  async()=>({ok:true,json:async()=>{throw new Error('safe-token');}}),
 ]) await assert.rejects(githubReadApi('safe-token',fetcher)(root),rejected);
});

test('replacement ruleset is accepted and deleted ruleset identity is rejected',async()=>{
 const f=fixture();
 f.state.rules.id=28293483;
 assert.equal((await f.e.readMain()).sha,base);
 assert.ok(f.calls.includes(root+'/rulesets/28293483'));
 f.state.rules.id=27616646;
 await assert.rejects(f.e.readMain(),{message:'DISPATCHER_GITHUB_EVIDENCE_DENIED'});
});

test('governance failure codes distinguish configuration from commit signatures',async()=>{
 for(const [change,code] of [
  [s=>s.rules.enforcement='disabled','RULESET_IDENTITY_OR_ENFORCEMENT'],
  [s=>s.rules.rules[3].parameters.required_approving_review_count=0,'REQUIRED_APPROVAL'],
  [s=>s.rules.rules[3].parameters.dismiss_stale_reviews_on_push=false,'STALE_APPROVAL_DISMISSAL'],
  [s=>s.rules.rules[3].parameters.require_code_owner_review=false,'CODEOWNER_REVIEW'],
  [s=>s.rules.rules[3].parameters.required_review_thread_resolution=false,'REVIEW_THREAD_RESOLUTION'],
  [s=>s.rules.rules[4].parameters.strict_required_status_checks_policy=false,'STRICT_STATUS_CHECKS'],
  [s=>s.rules.rules[4].parameters.required_status_checks[0].integration_id=0,'REQUIRED_CHECK_BINDING'],
  [s=>s.rules.rules[5].parameters.code_scanning_tools=[],'CODE_SCANNING_POLICY'],
  [s=>s.rules.rules[6].parameters.severity='none','CODE_QUALITY_POLICY'],
  [s=>s.main.commit.verification.verified=false,'MAIN_SIGNATURE_INVALID'],
 ]){const {state,e}=fixture();change(state);await assert.rejects(e.readMain(),{message:'DISPATCHER_GITHUB_EVIDENCE_DENIED',code});}
});

test('missing or null governance rule parameters fail closed with explicit denial codes',async()=>{
 for(const [type,code] of [['pull_request','REQUIRED_APPROVAL'],['required_status_checks','STRICT_STATUS_CHECKS']]){
  for(const parameters of [undefined,null]){
   const {state,e}=fixture();
   const rule=state.rules.rules.find(r=>r.type===type);
   if(parameters===undefined)delete rule.parameters;
   else rule.parameters=parameters;
   await assert.rejects(e.readMain(),{message:'DISPATCHER_GITHUB_EVIDENCE_DENIED',code});
  }
 }
});

const mergeDigest='6063d9806958746c1f97a97575f4423a35ad2265dfb6b74e52e3d202bce7e330';
const mergeFiles=[{filename:'digital-me/src/mission-dispatcher.mjs',sha:'95cc9c89bf26641ac278a64dd53e3717268a0175',status:'modified'},{filename:'digital-me/test/dispatcher-provenance.test.mjs',sha:'17e8f4fcdcbb6ff70e7e7bb4532853ebc83f6adb',status:'modified'}];
function mergeFixture(){
 const f=fixture(), main='e'.repeat(40), tree='f'.repeat(40), mergedAt='2026-11-28T16:14:01Z',reviewAt='2026-11-28T16:13:47Z',branch='digital-me/repair-'+hash(base+id+mergeDigest);
 const s=f.state;s.main.sha=main;
 const pr={number:9,state:'closed',merged:true,draft:false,merged_at:mergedAt,merged_by:{login:'GLORIFIER7',id:32674233},user:{login:bot,id:359913464},merge_commit_sha:merge,base:{ref:'main',sha:base,repo:{id:1377237797}},head:{ref:branch,sha:head,repo:{id:1377237797}}};
 const commit={...s.commit,files:structuredClone(mergeFiles),commit:{...s.commit.commit,tree:{sha:tree}}};
 const merged={sha:merge,parents:[{sha:base}],files:structuredClone(mergeFiles),commit:{tree:{sha:tree},verification:{verified:true,reason:'valid'}}};
 const reviews=[{id:1,state:'APPROVED',user:{login:'GLORIFIER7',id:32674233},commit_id:head,submitted_at:reviewAt}];
 const checks={total_count:6,check_runs:s.rules.rules[4].parameters.required_status_checks.map((c,i)=>({id:i+1,name:c.context,app:{id:15368},head_sha:head,status:'completed',conclusion:'success',completed_at:reviewAt}))};
 const compare={status:'ahead',behind_by:0,merge_base_commit:{sha:merge},base_commit:{sha:merge}};
 const state={pr,commit,merged,reviews,checks,compare};
 const api=async p=>{if(p===root+'/rulesets/28293483')return s.rules;if(p===root+'/commits/main')return s.main;if(p===root+'/pulls/9')return state.pr;if(p===root+'/commits/'+head)return state.commit;if(p===root+'/commits/'+merge)return state.merged;if(p===root+'/pulls/9/reviews?per_page=100')return state.reviews;if(p===root+'/commits/'+head+'/check-runs?per_page=100')return state.checks;if(p===root+'/compare/'+merge+'...'+main+'?per_page=1')return state.compare;throw Error('unexpected route '+p);};
 return {state,read:()=>createGithubEvidence({api,resolveManifest:async()=>{throw Error('no publication');}}).readMergedReceipt({missionId:id,base,head,pr:9,digest:mergeDigest,sourceSha:main})};
}
test('historical signed squash merge matches the exact recipe, independent review, trusted checks and main ancestry',async()=>{const f=mergeFixture();const r=await f.read();assert.equal(r.status,'MERGED');assert.equal(r.mergeSha,merge);assert.equal(r.checkIds.length,6);});
test('unmerged or incomplete proof does not certify a merge',async()=>{const f=mergeFixture();f.state.pr.merged=false;assert.equal((await f.read()).status,'CLOSED_UNMERGED');for(const alter of [s=>s.commit.author.id=7,s=>s.merged.commit.verification.verified=false,s=>s.merged.commit.tree.sha=base,s=>s.merged.files.pop(),s=>s.reviews[0].commit_id=base,s=>s.reviews.push({...s.reviews[0],id:2,state:'DISMISSED'}),s=>s.checks.check_runs[0].app.id=7,s=>s.checks.check_runs[0].completed_at='2026-11-29T00:00:00Z',s=>s.compare.behind_by=1]){const x=mergeFixture();alter(x.state);await assert.rejects(x.read);}});
