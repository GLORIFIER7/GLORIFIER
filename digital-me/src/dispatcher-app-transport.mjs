import {createSign} from 'node:crypto';
const repo='GLORIFIER7/GLORIFIER',root='/repos/'+repo,app=5876036;
const permissions=Object.freeze({contents:'write',pull_requests:'write'});
const deny=()=>{throw Error('DISPATCHER_APP_SCOPE_DENIED');};
const check=v=>{if(!v)deny();};
const exactPermissions=p=>p&&Object.entries(permissions).every(([k,v])=>p[k]===v)&&Object.entries(p).every(([k,v])=>k in permissions||(k==='metadata'&&v==='read'));
function request(token,fetcher){return async(path,method='GET',body)=>{
  check(typeof path==='string'&&!/[\r\n#\\]/.test(path));
  const url=new URL('https://api.github.com'+path);
  check(url.origin==='https://api.github.com'&&!/%(?:2f|5c|25)/i.test(url.pathname));
  const r=await fetcher(url,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  check(r.ok);if(r.status===204)return null;const json=await r.json();check(!json?.errors?.length);return json;
};}
// Same owner-controlled App and scoped installation-token lifecycle as the
// existing signed promotion workflow. No generic write API is exposed.
export async function withDispatcherApp(pem,fn,fetcher=fetch){
  try{
    check(typeof pem==='string'&&pem.length>0&&typeof fn==='function');
    const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000);
    const msg=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:String(app),iat:now-30,exp:now+540});
    const jwt=msg+'.'+createSign('RSA-SHA256').update(msg).sign(pem).toString('base64url');
    const api=request(jwt,fetcher),i=await api(root+'/installation');
    check(i?.app_id===app&&i.account?.login==='GLORIFIER7'&&i.repository_selection==='selected'&&Number.isSafeInteger(i.id)&&i.id>0&&Object.entries(permissions).every(([k,v])=>i.permissions?.[k]===v));
    const t=await api('/app/installations/'+i.id+'/access_tokens','POST',{repositories:['GLORIFIER'],permissions});
    check(typeof t?.token==='string'&&t.token.length>0);
    const scoped=request(t.token,fetcher);
    try{
      check(t.repository_selection==='selected'&&t.repositories?.length===1&&t.repositories[0].full_name===repo&&exactPermissions(t.permissions));
      return await fn(async(path,method='GET',body)=>{
        const read=method==='GET'&&(path.startsWith(root+'/contents/')||path.startsWith(root+'/commits/')||path.startsWith(root+'/pulls?')||path.startsWith(root+'/pulls/')||path.startsWith(root+'/git/matching-refs/heads/'));
        const write=method==='POST'&&[root+'/git/refs','/graphql',root+'/pulls'].includes(path);
        check(read||write);return scoped(path,method,body);
      });
    }finally{try{await scoped('/installation/token','DELETE');}catch{console.warn('DISPATCHER_APP_TOKEN_REVOCATION_UNCONFIRMED');}}
  }catch{throw Error('DISPATCHER_APP_SCOPE_DENIED');}
}
