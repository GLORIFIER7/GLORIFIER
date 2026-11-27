import {createHash} from 'node:crypto';
const REPO='GLORIFIER7/GLORIFIER', ROOT='/repos/'+REPO, BOT='glorifier-digital-me[bot]';
const CHECKS=['Required CI','CodeQL (python, none)','CodeQL (javascript-typescript, none)','npm-security','Dependency Review','validate-and-build'];
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const digest=x=>createHash('sha256').update(x).digest('hex');
const denied=()=>Error('DISPATCHER_GITHUB_EVIDENCE_DENIED');
const requireThat=x=>{if(!x)throw denied();};
function signed(commit, head) {
 const verification=commit?.commit?.verification;
 return Boolean(commit&&verification&&commit.sha===head&&verification.verified===true&&verification.reason==='valid');
}
const pathOk=p=>typeof p==='string'&&p.length<=180&&/^(src|tests|digital-me\/(src|test))\//.test(p)&&p.split('/').every(x=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(x))&&/\.(mjs|js|ts|tsx|jsx|py)$/.test(p);
const positive=n=>Number.isSafeInteger(n)&&n>0;
// GET only. Use a distinct scoped read credential in a trusted verification job.
export function githubReadApi(token,fetcher=fetch){
 requireThat(typeof token==='string'&&token.length>0&&typeof fetcher==='function');
 return async path=>{requireThat(typeof path==='string'&&(path===ROOT||path.startsWith(ROOT+'/'))&&!/[\r\n#\\]/.test(path));const url=new URL('https://api.github.com'+path);requireThat(url.origin==='https://api.github.com'&&(url.pathname===ROOT||url.pathname.startsWith(ROOT+'/')));
 const r=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});requireThat(r.ok);return r.json();};
}
// The manifest must come from the independently verified immutable candidate,
// never from the publication response, PR body, or arbitrary agent text.
export function createGithubEvidence({api,resolveManifest}={}){
 requireThat(typeof api==='function'&&typeof resolveManifest==='function');
 async function readMain(){
  const r=await api(ROOT+'/rulesets/27616646');
  if (!r || !Array.isArray(r.rules)) throw denied();
  requireThat(r.id===27616646&&r.enforcement==='active'&&r.target==='branch'&&Array.isArray(r.bypass_actors)&&r.bypass_actors.length===0);
  const scope=r.conditions?.ref_name;
  if (!scope || !Array.isArray(scope.include) || !Array.isArray(scope.exclude)) throw denied();
  requireThat((scope.include.includes('refs/heads/main')||scope.include.includes('~DEFAULT_BRANCH'))&&scope.exclude.length===0);
  if(!scope.include.includes('refs/heads/main')){const repo=await api(ROOT);requireThat(repo?.full_name===REPO&&repo.default_branch==='main');}
  const one=t=>{const a=r.rules.filter(x=>x.type===t);requireThat(a.length===1);return a[0].parameters;};
  for(const type of ['required_signatures','non_fast_forward','deletion'])one(type);
  const p=one('pull_request');requireThat(p?.required_approving_review_count>=1&&Number.isSafeInteger(p.required_approving_review_count)&&p.dismiss_stale_reviews_on_push===true&&p.require_code_owner_review===true&&p.require_review_thread_resolution===true);
  const s=one('required_status_checks');requireThat(s?.strict_required_status_checks_policy===true&&Array.isArray(s.required_status_checks)&&CHECKS.every(context=>s.required_status_checks.some(x=>x.context===context&&x.integration_id===15368)));
  const scanning=one('code_scanning');requireThat(scanning?.code_scanning_tools?.some(x=>x.tool==='CodeQL'&&x.security_alerts_threshold==='high_or_higher'&&x.alerts_threshold==='errors'));
  requireThat(one('code_quality')?.severity==='all');
  const c=await api(ROOT+'/commits/main');
  if (!c || !sha(c.sha) || !signed(c,c.sha)) throw denied();
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
  requireThat(signed(commit,head)&&commit.author?.login===BOT&&commit.parents.length===1&&commit.parents[0]?.sha===base&&
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
  requireThat(match(await api(ROOT+'/pulls/'+pr)));
  // Pull-request workflows run on the synthetic merge commit, so the run is located by
  // branch and bound to this PR and its head SHA via the run's pull_requests metadata.
  const runs=await api(ROOT+'/actions/runs?event=pull_request&branch='+branch+'&per_page=100');
  if (!runs || !Array.isArray(runs.workflow_runs)) throw denied();
  requireThat(Number.isSafeInteger(runs.total_count)&&runs.total_count===runs.workflow_runs.length&&runs.total_count<100);
  const relevant=runs.workflow_runs.filter(r=>r&&sha(r.head_sha)&&r.event==='pull_request'&&r.path==='.github/workflows/ci.yml'&&r.pull_requests?.some(p=>p.number===pr&&p.head?.sha===head)).sort((a,b)=>b.id-a.id);
  const run=relevant[0];
  if (!run || !positive(run.id) || run.conclusion==='startup_failure' || run.conclusion==='cancelled') throw denied();
  const j=await api(ROOT+'/actions/runs/'+run.id+'/jobs?per_page=100');requireThat(Array.isArray(j?.jobs)&&j.jobs.length>0&&j.total_count===j.jobs.length&&j.total_count<100&&j.jobs.every(x=>positive(x.id)&&x.run_id===run.id&&x.head_sha===run.head_sha));
  requireThat(match(await api(ROOT+'/pulls/'+pr))&&(await readMain()).sha===base);
  return {missionId,base,digest:hash,head,pr,author:BOT,verified:true,reason:'valid',draft:true,ciJobsCreated:true,ciRunId:run.id};
 }
 return Object.freeze({readMain,readPublication});
}
