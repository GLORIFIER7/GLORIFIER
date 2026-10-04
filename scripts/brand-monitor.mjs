const base = process.env.BRAND_MONITOR_BASE_URL || process.env.RAILWAY_PUBLIC_DOMAIN || 'https://glorifier-artificial-intelligence-production.up.railway.app';
const secret = process.env.BRAND_MONITOR_WEBHOOK_SECRET;
const githubToken = process.env.GITHUB_TOKEN;

async function api(url, options={}) {
  const headers = {'accept':'application/vnd.github+json', ...(options.headers||{})};
  if (githubToken) headers.authorization = 'Bearer ' + githubToken;
  const r = await fetch(url,{...options,headers});
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return r.json();
}

async function main(){
  const root=base.replace(/\/$/,'');
  const termsResponse=await fetch(root+'/api/brand-monitor/terms');
  if (!termsResponse.ok) {
    if ((termsResponse.status === 401 || termsResponse.status === 403) && !secret) {
      console.warn(`Brand monitor is NOT OBSERVABLE: ${root} requires authentication and BRAND_MONITOR_WEBHOOK_SECRET is not configured.`);
      console.warn('No scan was recorded; configure the webhook secret to enable authenticated monitoring.');
      return;
    }
    throw new Error(`Unable to load brand terms: HTTP ${termsResponse.status}`);
  }
  const terms=await termsResponse.json();
  if (!Array.isArray(terms)) throw new Error('Brand terms response is not an array');
  const observations=[];
  for (const term of terms.slice(0,50)) {
    const q=encodeURIComponent(`"${term.term}"`);
    try {
      const issues=await api(`https://api.github.com/search/issues?q=${q}&per_page=10`);
      for (const item of issues.items||[]) observations.push({
        termId:term.id, sourceType:'github_public', sourceUrl:item.html_url, sourceName:'GitHub public search',
        observedAt:new Date().toISOString(), matchedText:term.term, context:(item.title||'').slice(0,500), confidence:0.65
      });
    } catch(e) { console.warn('GitHub issue search skipped:',term.term,e.message); }
    try {
      const repos=await api(`https://api.github.com/search/repositories?q=${q}&per_page=10`);
      for (const item of repos.items||[]) observations.push({
        termId:term.id, sourceType:'github_public', sourceUrl:item.html_url, sourceName:'GitHub public repositories',
        observedAt:new Date().toISOString(), matchedText:term.term, context:(item.full_name+' '+(item.description||'')).slice(0,500), confidence:0.6
      });
    } catch(e) { console.warn('GitHub repo search skipped:',term.term,e.message); }
  }
  const headers={'content-type':'application/json'};
  if(secret) headers['x-brand-monitor-secret']=secret;
  const r=await fetch(root+'/api/brand-monitor/scan',{method:'POST',headers,body:JSON.stringify({source:'github-public',timestamp:new Date().toISOString(),observations})});
  const body=await r.text();
  if(!r.ok) {
    if ((r.status === 401 || r.status === 403) && !secret) {
      console.warn(`Brand monitor is NOT OBSERVABLE: ${root}/api/brand-monitor/scan requires authentication and no webhook secret is configured.`);
      return;
    }
    throw new Error(`Brand monitor scan failed: HTTP ${r.status} ${body}`);
  }
  console.log(body);
}
main().catch(e=>{console.error(e);process.exit(1)});
