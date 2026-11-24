import { pathToFileURL } from 'node:url';
import { collectReviewEvidence } from './review-collector.mjs';
import { evaluateReviewEligibility } from './review-eligibility.mjs';
const api='https://api.github.com';
export async function runReviewPreflight(env=process.env,{fetcher=fetch,sign,collect=collectReviewEvidence}={}) {
  if(env.GITHUB_REPOSITORY!=='GLORIFIER7/GLORIFIER'||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_ACTOR!=='GLORIFIER7'||env.GITHUB_TRIGGERING_ACTOR!=='GLORIFIER7') throw Error('Trusted main and owner dispatch required');
  const n=env.DIGITAL_ME_REVIEW_PR;
  if(typeof n!=='string'||! /^[1-9][0-9]{0,9}$/.test(n)) throw Error('Invalid PR number');
  const number=Number(n);
  if(env.DIGITAL_ME_APP_ID!=='5876036') throw Error('Unexpected App identity');
  const signer=sign??(await import('./operator.mjs')).appJwt;
  const jwt=signer(env.DIGITAL_ME_APP_ID,env.DIGITAL_ME_APP_PRIVATE_KEY);
  async function appRequest(path,body) {
    const r=await fetcher(api+path,{method:body?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+jwt,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(body?{body:JSON.stringify(body)}:{})});
    if(!r.ok) throw Error('GitHub App HTTP '+r.status);
    return r.json();
  }
  const installation=await appRequest('/repos/GLORIFIER7/GLORIFIER/installation');
  if(installation.app_id!==5876036||installation.account?.login!=='GLORIFIER7'||installation.repository_selection!=='selected'||!Number.isSafeInteger(installation.id)||installation.id<1) throw Error('Installation scope mismatch');
  const issued=await appRequest('/app/installations/'+installation.id+'/access_tokens',{repositories:['GLORIFIER'],permissions:{contents:'read',pull_requests:'read',checks:'read',statuses:'read'}});
  if(typeof issued.token!=='string'||!issued.token) throw Error('Missing scoped installation token');
  const e=await collect({token:issued.token,number,actor:env.GITHUB_ACTOR,triggeringActor:env.GITHUB_TRIGGERING_ACTOR},fetcher);
  return {...evaluateReviewEligibility(e),prNumber:number,headSha:e.pr?.head?.sha??null,baseSha:e.currentBase??null,appId:5876036};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) runReviewPreflight().then(r=>console.log(JSON.stringify(r,null,2))).catch(()=>{console.error('Digital Me review preflight failed closed; no approval submitted.');process.exitCode=1;});
