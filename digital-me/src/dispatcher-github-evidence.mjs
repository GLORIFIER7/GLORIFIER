import {createHash} from 'node:crypto';
const REPO='GLORIFIER7/GLORIFIER', ROOT='/repos/'+REPO, BOT='glorifier-digital-me[bot]';
const CHECKS=['Required CI','CodeQL (python, none)','CodeQL (javascript-typescript, none)','npm-security','Dependency Review','validate-and-build'];
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const digest=x=>createHash('sha256').update(x).digest('hex');
const blob=b=>createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex');
const requireThat=x=>{if(!x)throw Error('DISPATCHER_GITHUB_EVIDENCE_DENIED');};
const signed=(c,h)=>c?.sha===h&&c.commit?.verification?.verified===true&&c.commit.verification.reason==='valid';
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
  requireThat(r?.id===27616646&&r.enforcement==='active'&&r.target==='branch'&&Array.isArray(r.bypass_actors)&&r.bypass_actors.length===0&&Array.isArray(r.rules));
  const scope=r.conditions?.ref_name;requireThat(Array.isArray(scope?.include)&&(scope.include.includes('refs/heads/main')||scope.include.includes('~DEFAULT_BRANCH'))&&Array.isArray(scope.exclude)&&scope.exclude.length===0);
  if(!scope.include.includes('refs/heads/main')){const repo=await api(ROOT);requireThat(repo?.full_name===REPO&&repo.default_branch==='main');}
  const one=t=>{const a=r.rules.filter(x=>x.type===t);requireThat(a.length===1);return a[0].parameters;};
  for(const type of ['required_signatures','non_fast_forward','deletion'])one(type);
  const p=one('pull_request');requireThat(p?.required_approving_review_count>=1&&Number.isSafeInteger(p.required_approving_review_count)&&p.dismiss_stale_reviews_on_push===true&&p.require_code_owner_review===true&&p.require_review_thread_resolution===true);
  const s=one('required_status_checks');requireThat(s?.strict_required_status_checks_policy===true&&Array.isArray(s.required_status_checks)&&CHECKS.every(context=>s.required_status_checks.some(x=>x.context===context&&x.integration_id===15368)));
  const scanning=one('code_scanning');requireThat(scanning?.code_scanning_tools?.some(x=>x.tool==='CodeQL'&&x.security_alerts_threshold==='high_or_higher'&&x.alerts_threshold==='errors'));
  requireThat(one('code_quality')?.severity==='all');
  const c=await api(ROOT+'/commits/main');requireThat(sha(c?.sha)&&signed(c,c.sha));return {sha:c.sha,verified:true,reason:'valid'};
 }
 async function readPublication(fence,written){
  const {base,missionId,digest:hash}=fence??{};const {pr,head}=written??{};
  requireThat(sha(base)&&sha(head)&&base!==head&&positive(pr)&&/^mission-coding-[a-f0-9]{64}$/.test(missionId??'')&&/^[a-f0-9]{64}$/.test(hash??''));
  requireThat((await readMain()).sha===base);
  const m=await resolveManifest(fence);const a=m?.changes;
  requireThat(Array.isArray(a)&&a.length>=1&&a.length<=20&&new Set(a.map(f=>f.path)).size===a.length&&digest(JSON.stringify(a))===hash);
  for(const f of a){requireThat(pathOk(f.path)&&sha(f.before)&&sha(f.after)&&f.before!==f.after&&typeof f.contents==='string'&&f.contents.length<=700000);const b=Buffer.from(f.contents,'base64');requireThat(b.toString('base64')===f.contents&&blob(b)===f.after);}
  const c=await api(ROOT+'/commits/'+head);requireThat(signed(c,head)&&c.author?.login===BOT&&c.parents?.length===1&&c.parents[0].sha===base&&c.files?.length===a.length&&a.every(f=>c.files.some(x=>x.filename===f.path&&x.sha===f.after&&x.status==='modified')));
  for(const f of a){const v=await api(ROOT+'/contents/'+f.path+'?ref='+head);requireThat(v?.type==='file'&&v.path===f.path&&v.encoding==='base64'&&v.sha===f.after&&typeof v.content==='string'&&blob(Buffer.from(v.content,'base64'))===f.after);}
  const branch='digital-me/repair-'+digest(base+missionId+hash);
  const match=p=>p?.number===pr&&p.state==='open'&&p.draft===true&&p.user?.login===BOT&&p.base?.ref==='main'&&p.base?.sha===base&&p.base?.repo?.full_name===REPO&&p.head?.sha===head&&p.head?.ref===branch&&p.head?.repo?.full_name===REPO;
  requireThat(match(await api(ROOT+'/pulls/'+pr)));
  const runs=await api(ROOT+'/actions/runs?event=pull_request&head_sha='+head+'&per_page=100');requireThat(Array.isArray(runs?.workflow_runs)&&Number.isSafeInteger(runs.total_count)&&runs.total_count===runs.workflow_runs.length&&runs.total_count<100);
  const relevant=runs.workflow_runs.filter(r=>r.head_sha===head&&r.event==='pull_request'&&r.path==='.github/workflows/ci.yml'&&r.pull_requests?.some(p=>p.number===pr)).sort((a,b)=>b.id-a.id);
  const run=relevant[0];requireThat(positive(run?.id)&&run.conclusion!=='startup_failure'&&run.conclusion!=='cancelled');
  const j=await api(ROOT+'/actions/runs/'+run.id+'/jobs?per_page=100');requireThat(Array.isArray(j?.jobs)&&j.jobs.length>0&&j.total_count===j.jobs.length&&j.total_count<100&&j.jobs.every(x=>positive(x.id)&&x.run_id===run.id&&x.head_sha===head));
  requireThat(match(await api(ROOT+'/pulls/'+pr))&&(await readMain()).sha===base);
  return {missionId,base,digest:hash,head,pr,author:BOT,verified:true,reason:'valid',draft:true,ciJobsCreated:true,ciRunId:run.id};
 }
 return Object.freeze({readMain,readPublication});
}
