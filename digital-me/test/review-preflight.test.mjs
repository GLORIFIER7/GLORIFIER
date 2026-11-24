import test from 'node:test';
import assert from 'node:assert/strict';
import { runReviewPreflight } from '../src/review-preflight.mjs';
const env={GITHUB_REPOSITORY:'GLORIFIER7/GLORIFIER',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_ACTOR:'GLORIFIER7',GITHUB_TRIGGERING_ACTOR:'GLORIFIER7',DIGITAL_ME_REVIEW_PR:'42',DIGITAL_ME_APP_ID:'5876036',DIGITAL_ME_APP_PRIVATE_KEY:'fixture'};
const sign=()=> 'fixture-jwt';
const denyEvidence=async ({token,number})=>{assert.equal(token,'fixture-installation-token');assert.equal(number,42);return {complete:false};};
function fake(wrong=false){return async(url,options)=>{assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer fixture-jwt');if(url.endsWith('/installation')){assert.equal(options.method,'GET');return new Response(JSON.stringify({app_id:wrong?1:5876036,id:17,account:{login:'GLORIFIER7'},repository_selection:'selected'}));}assert.equal(url,'https://api.github.com/app/installations/17/access_tokens');assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{repositories:['GLORIFIER'],permissions:{contents:'read',pull_requests:'read',checks:'read',statuses:'read'}});return new Response(JSON.stringify({token:'fixture-installation-token'}));};}
test('same App mints a read-only token and returns advisory denial without approval',async()=>{const r=await runReviewPreflight(env,{fetcher:fake(),sign,collect:denyEvidence});assert.equal(r.eligible,false);assert.equal(r.approvalSubmitted,false);assert.equal(r.prNumber,42);});
test('rejects execution on an untrusted branch before authentication',async()=>assert.rejects(runReviewPreflight({...env,GITHUB_REF:'refs/heads/other'},{fetcher:()=>{throw Error('network called')},sign}),/Trusted main/));
test('rejects unexpected App installation',async()=>assert.rejects(runReviewPreflight(env,{fetcher:fake(true),sign}),/Installation scope/));
test('rejects invalid input before authentication',async()=>assert.rejects(runReviewPreflight({...env,DIGITAL_ME_REVIEW_PR:'4.2'},{fetcher:()=>{throw Error('network called')},sign}),/PR number/));
