// Read-only evidence collection. No review, commit, merge or deployment mutation.
const API='https://api.github.com', REPO='/repos/GLORIFIER7/GLORIFIER';
const sha = s => typeof s==='string' && /^[a-f0-9]{40}$/.test(s);
const threadQuery='query ReviewThreads($number:Int!,$cursor:String){repository(owner:"GLORIFIER7",name:"GLORIFIER"){pullRequest(number:$number){headRefOid baseRefOid reviewThreads(first:100,after:$cursor){nodes{isResolved} pageInfo{hasNextPage endCursor}}}}}';
export async function collectReviewEvidence({token,number,actor,triggeringActor}, fetcher=fetch) {
  if(!Number.isSafeInteger(number)||number<1) throw Error('Invalid PR number');
  if(typeof token!=='string'||!token.trim()||!actor||!triggeringActor) throw Error('Missing authorization context');
  async function request(path,query) {
    const response=await fetcher(API+path,{method:query?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(query?{body:JSON.stringify(query)}:{})});
    if(!response.ok) throw Error('GitHub HTTP '+response.status);
    const data=await response.json();
    if(!data||data.errors?.length) throw Error('Incomplete GitHub response');
    return {data, next:/\brel="next"/.test(response.headers.get('link')||'')};
  }
  const get=async path=>(await request(path)).data;
  async function pages(path, key) {
    const values=[];
    for(let page=1;page<=10;page++) {
      const {data,next}=await request(path+(path.includes('?')?'&':'?')+'per_page=100&page='+page);
      const list=key?data[key]:data;
      if(!Array.isArray(list)) throw Error('Incomplete paginated inventory');
      values.push(...list);
      if(!next) {
        if(key&&(!Number.isSafeInteger(data.total_count)||values.length!==data.total_count)) throw Error('Check inventory count mismatch');
        return values;
      }
    }
    throw Error('Pagination limit exceeded');
  }
  const path=REPO+'/pulls/'+number;
  const pr=await get(path), main=await get(REPO+'/commits/main');
  const head=pr.head?.sha,base=pr.base?.sha;
  if(pr.number!==number||!sha(head)||!sha(base)||base!==main.sha||pr.base?.ref!=='main'||pr.base?.repo?.full_name!=='GLORIFIER7/GLORIFIER'||pr.head?.repo?.full_name!=='GLORIFIER7/GLORIFIER') throw Error('PR or base scope mismatch');
  const comparison=await get(REPO+'/compare/'+base+'...'+head);
  if(comparison.status!=='ahead'||comparison.behind_by!==0) throw Error('PR branch behind main or not ahead');
  const files=await pages(path+'/files'), commits=await pages(path+'/commits'), reviews=await pages(path+'/reviews'), inlineComments=await pages(path+'/comments');
  const checks=await pages(REPO+'/commits/'+head+'/check-runs?filter=latest','check_runs');
  const combined=await get(REPO+'/commits/'+head+'/status');
  const threads=[];let cursor=null;const seen=new Set();
  for(let page=1;page<=10;page++) {
    const {data}=await request('/graphql',{query:threadQuery,variables:{number,cursor}});
    const p=data.data?.repository?.pullRequest;
    if(p?.headRefOid!==head||p?.baseRefOid!==base) throw Error('PR changed during thread collection');
    const t=p.reviewThreads;
    if(!Array.isArray(t?.nodes)||typeof t.pageInfo?.hasNextPage!=='boolean') throw Error('Incomplete thread inventory');
    threads.push(...t.nodes);
    if(!t.pageInfo.hasNextPage) break;
    cursor=t.pageInfo.endCursor;
    if(page===10||typeof cursor!=='string'||!cursor||seen.has(cursor)) throw Error('Thread pagination incomplete');
    seen.add(cursor);
  }
  const after=await get(path), afterMain=await get(REPO+'/commits/main');
  if(after.head?.sha!==head||after.base?.sha!==base||afterMain.sha!==base||after.state!==pr.state||after.draft!==pr.draft||after.mergeable!==pr.mergeable||after.commits!==pr.commits||after.changed_files!==pr.changed_files) throw Error('PR or main changed during collection');
  return {pr,files,commits,reviews,inlineComments,threads,checks,combinedStatus:combined.state,currentBase:base,actor,triggeringActor,complete:true};
}
