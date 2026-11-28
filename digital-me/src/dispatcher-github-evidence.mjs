import {createHash} from 'node:crypto';
const REPO='GLORIFIER7/GLORIFIER', ROOT='/repos/'+REPO, BOT='glorifier-digital-me[bot]';
const BOT_ID=359913464, REPOSITORY_ID=1377237797, WEB_FLOW_ID=19864447;
const BOT_EMAIL=BOT_ID+'+'+BOT+'@users.noreply.github.com';
const CHECKS=['Required CI','CodeQL (python, none)','CodeQL (javascript-typescript, none)','npm-security','Dependency Review','validate-and-build'];
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const digest=x=>createHash('sha256').update(x).digest('hex');
const denied=code=>Object.assign(Error('DISPATCHER_GITHUB_EVIDENCE_DENIED'),code?{code}:{});
const requireThat=(x,code)=>{if(!x)throw denied(code);};
function signed(commit, head) {
 const verification=commit?.commit?.verification;
 return Boolean(commit&&verification&&commit.sha===head&&verification.verified===true&&verification.reason==='valid');
}
function appSigned(commit,head){
 const verification=commit?.commit?.verification;
 if(!signed(commit,head)||commit.author?.login!==BOT||commit.author.id!==BOT_ID||
    commit.committer?.login!=='web-flow'||commit.committer.id!==WEB_FLOW_ID||
    typeof verification.signature!=='string'||!verification.signature.startsWith('-----BEGIN PGP SIGNATURE-----')||
    typeof verification.payload!=='string')return false;
 const [headers]=verification.payload.split('\n\n',1);
 const lines=headers.split('\n');
 const authors=lines.filter(line=>line.startsWith('author '));
 const committers=lines.filter(line=>line.startsWith('committer '));
 return authors.length===1&&authors[0].startsWith('author '+BOT+' <'+BOT_EMAIL+'> ')&&
   committers.length===1&&committers[0].startsWith('committer GitHub <noreply@github.com> ');
}
const pathOk=p=>typeof p==='string'&&p.length<=180&&/^(src|tests|digital-me\/(src|test))\//.test(p)&&p.split('/').every(x=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(x))&&/\.(mjs|js|ts|tsx|jsx|py)$/.test(p);
const positive=n=>Number.isSafeInteger(n)&&n>0;
// GET only. Use a distinct scoped read credential in a trusted verification job.
export function githubReadApi(token,fetcher=fetch){
 requireThat(typeof token==='string'&&/^[A-Za-z0-9._-]{1,4096}$/.test(token)&&typeof fetcher==='function');
 return async path=>{
  try {
   requireThat(typeof path==='string'&&(path===ROOT||path.startsWith(ROOT+'/'))&&!/[\r\n#\\]/.test(path));
   const url=new URL('https://api.github.com'+path);
   requireThat(url.origin==='https://api.github.com'&&(url.pathname===ROOT||url.pathname.startsWith(ROOT+'/'))&&!/%(?:2f|5c|25)/i.test(url.pathname));
   const response=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
   requireThat(response.ok);
   return await response.json();
  } catch {throw denied();}
 };

}
// The manifest must come from the independently verified immutable candidate,
// never from the publication response, PR body, or arbitrary agent text.
export function createGithubEvidence({api,resolveManifest}={}){
 requireThat(typeof api==='function'&&typeof resolveManifest==='function');
 async function readMain(){
  const r=await api(ROOT+'/rulesets/28293483');
  if (!r || !Array.isArray(r.rules)) throw denied('RULESET_MISSING');
  requireThat(r.id===28293483&&r.enforcement==='active'&&r.target==='branch'&&Array.isArray(r.bypass_actors)&&r.bypass_actors.length===0,'RULESET_IDENTITY_OR_ENFORCEMENT');
  const scope=r.conditions?.ref_name;
  if (!scope || !Array.isArray(scope.include) || !Array.isArray(scope.exclude)) throw denied('RULESET_SCOPE');
  requireThat((scope.include.includes('refs/heads/main')||scope.include.includes('~DEFAULT_BRANCH'))&&scope.exclude.length===0,'RULESET_SCOPE');
  if(!scope.include.includes('refs/heads/main')){const repo=await api(ROOT);requireThat(repo?.full_name===REPO&&repo.default_branch==='main','DEFAULT_BRANCH_MISMATCH');}
  const one=t=>{const a=r.rules.filter(x=>x.type===t);requireThat(a.length===1,'RULE_TYPE_'+t.toUpperCase());return a[0].parameters;};
  for(const type of ['required_signatures','non_fast_forward','deletion'])one(type);
  const p=one('pull_request');
  if (!p) throw denied('REQUIRED_APPROVAL');
  requireThat(p.required_approving_review_count>=1&&Number.isSafeInteger(p.required_approving_review_count),'REQUIRED_APPROVAL');
  requireThat(p.dismiss_stale_reviews_on_push===true,'STALE_APPROVAL_DISMISSAL');
  requireThat(p.require_code_owner_review===true,'CODEOWNER_REVIEW');
  requireThat(p.required_review_thread_resolution===true,'REVIEW_THREAD_RESOLUTION');
  const s=one('required_status_checks');
  if (!s) throw denied('STRICT_STATUS_CHECKS');
  requireThat(s.strict_required_status_checks_policy===true,'STRICT_STATUS_CHECKS');
  requireThat(Array.isArray(s.required_status_checks)&&CHECKS.every(context=>s.required_status_checks.some(x=>x.context===context&&x.integration_id===15368)),'REQUIRED_CHECK_BINDING');
  const scanning=one('code_scanning');requireThat(scanning?.code_scanning_tools?.some(x=>x.tool==='CodeQL'&&x.security_alerts_threshold==='high_or_higher'&&x.alerts_threshold==='errors'),'CODE_SCANNING_POLICY');
  requireThat(one('code_quality')?.severity==='all','CODE_QUALITY_POLICY');
  const c=await api(ROOT+'/commits/main');
  if (!c || !sha(c.sha) || !signed(c,c.sha)) throw denied('MAIN_SIGNATURE_INVALID');
  return {sha:c.sha,verified:true,reason:'valid'};
 }
 async function readPublication(fence,written){
  const {base,missionId,digest:hash}=fence??{};const {pr,head}=written??{};
  requireThat(sha(base)&&sha(head)&&base!==head&&positive(pr)&&/^mission-coding-[a-f0-9]{64}$/.test(missionId??'')&&/^[a-f0-9]{64}$/.test(hash??''));
  requireThat((await readMain()).sha===base);
  const changes=(await resolveManifest(fence))?.changes;
  if (!Array.isArray(changes) || changes.length===0 || changes.length>20) throw denied();
  for (const file of changes) {
   if (!file || !pathOk(file.path) || !sha(file.before) || !sha(file.after) || file.before===file.after ||
       typeof file.contents!=='string' || file.contents.length>700000) throw denied();
   requireThat(Buffer.from(file.contents,'base64').toString('base64')===file.contents);
  }
  requireThat(new Set(changes.map(file=>file.path)).size===changes.length&&digest(JSON.stringify(changes))===hash);

  const commit=await api(ROOT+'/commits/'+head);
  if (!commit || !Array.isArray(commit.parents) || !Array.isArray(commit.files)) throw denied();
  requireThat(appSigned(commit,head)&&commit.parents.length===1&&commit.parents[0]?.sha===base&&
    commit.files.length===changes.length&&changes.every(file=>commit.files.some(change=>
      change&&change.filename===file.path&&change.sha===file.after&&change.status==='modified')));

  // GitHub supplies Git object IDs. Match the actual bytes to the SHA-256-bound manifest.
  for (const file of changes) {
   const observed=await api(ROOT+'/contents/'+file.path+'?ref='+head);
   if (!observed || observed.type!=='file' || observed.path!==file.path || observed.encoding!=='base64' ||
       observed.sha!==file.after || typeof observed.content!=='string' || observed.content.length>720000) throw denied();
   requireThat(Buffer.from(observed.content,'base64').equals(Buffer.from(file.contents,'base64')));
  }
  const branch='digital-me/repair-'+digest(base+missionId+hash);
  const match=p=>p?.number===pr&&p.state==='open'&&p.draft===true&&p.user?.login===BOT&&p.base?.ref==='main'&&p.base?.sha===base&&p.base?.repo?.full_name===REPO&&p.head?.sha===head&&p.head?.ref===branch&&p.head?.repo?.full_name===REPO;
  const pull=await api(ROOT+'/pulls/'+pr);
  requireThat(match(pull)&&pull.user.id===BOT_ID&&sha(pull.merge_commit_sha));
  const tested=pull.merge_commit_sha;
  const merge=await api(ROOT+'/commits/'+tested);
  requireThat(merge?.sha===tested&&merge.parents?.length===2&&merge.parents[0]?.sha===base&&merge.parents[1]?.sha===head);
  const association=p=>p?.number===pr&&p.base?.sha===base&&p.base.ref==='main'&&p.base.repo?.id===REPOSITORY_ID&&
    p.head?.sha===head&&p.head.ref===branch&&p.head.repo?.id===REPOSITORY_ID;
  const runs=await api(ROOT+'/actions/runs?event=pull_request&branch='+encodeURIComponent(branch)+'&per_page=100');
  if (!runs || !Array.isArray(runs.workflow_runs)) throw denied();
  requireThat(runs.total_count===runs.workflow_runs.length&&runs.total_count<100);
  const candidates=runs.workflow_runs.filter(r=>positive(r?.id)&&positive(r.check_suite_id)&&positive(r.run_attempt)&&
    r.head_branch===branch&&(r.head_sha===head||r.head_sha===tested)&&r.event==='pull_request'&&
    r.path==='.github/workflows/ci.yml'&&!['startup_failure','cancelled','skipped'].includes(r.conclusion))
    .sort((a,b)=>b.id-a.id);
  let run;
  for(const candidate of candidates){
   const suite=await api(ROOT+'/check-suites/'+candidate.check_suite_id);
   if(suite?.id!==candidate.check_suite_id||suite.app?.id!==15368||suite.head_sha!==candidate.head_sha||
      suite.head_branch!==branch)continue;
   const declared=candidate.pull_requests;
   if(!Array.isArray(declared)||!Array.isArray(suite.pull_requests))continue;
   if((declared.length&&!declared.some(association))||(suite.pull_requests.length&&!suite.pull_requests.some(association)))continue;
   if(!declared.some(association)&&!suite.pull_requests.some(association))continue;
   run=candidate;
   break;
  }
  requireThat(run);
  const jobs=await api(ROOT+'/actions/runs/'+run.id+'/attempts/'+run.run_attempt+'/jobs?per_page=100');
  if (!jobs || !Array.isArray(jobs.jobs)) throw denied();
  requireThat(jobs.total_count===jobs.jobs.length&&jobs.total_count<100);
  requireThat(jobs.jobs.filter(job=>job?.name==='build'&&positive(job.id)&&job.run_id===run.id&&
    job.run_attempt===run.run_attempt&&job.head_sha===run.head_sha&&
    ['in_progress','completed'].includes(job.status)&&!['skipped','cancelled','startup_failure'].includes(job.conclusion)).length===1);
  const finalPull=await api(ROOT+'/pulls/'+pr);
  requireThat(match(finalPull)&&finalPull.user.id===BOT_ID&&finalPull.merge_commit_sha===tested&&(await readMain()).sha===base);
  return {missionId,base,digest:hash,head,pr,author:BOT,verified:true,reason:'valid',draft:true,ciJobsCreated:true,ciRunId:run.id};
 }
 return Object.freeze({readMain,readPublication});
}
