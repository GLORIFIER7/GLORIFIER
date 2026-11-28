import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canonicalRulesetMarker} from '../src/dispatcher-ruleset-attestation.mjs';
const workflow=readFileSync(new URL('../../.github/workflows/digital-me-ruleset-preflight.yml',import.meta.url),'utf8');
const code=workflow.split("node --input-type=module <<'NODE'\n")[1].split('\n          NODE')[0].replace(/^\s*import .*;$/gm,'');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const sha='a'.repeat(40), secret='fixture-token-do-not-log', ruleset={id:28293483,bypass_actors:[],updated_at:'2026-11-28T00:00:00Z'};
async function run({token=secret,readToken=secret,response=ruleset,http=200,ordinaryHttp=200,ordinary=ruleset,main={sha,verified:true,reason:'valid'},protection=false,network=false,diagnosticCode,staticResponse=response}={}){
 const messages=[],calls=[];const process={env:{RULESET_ATTEST_TOKEN:token,GITHUB_TOKEN:readToken,GITHUB_SHA:sha,GITHUB_RUN_ID:'1'},exitCode:0};
 const console={log:x=>messages.push(x),error:x=>messages.push(x)};
 const fetch=async(url,options)=>{calls.push([String(url),options.method]);if(network)throw Error(secret); const status=calls.length===1?http:ordinaryHttp;return {ok:status===200,status,json:async()=>calls.length===1?response:calls.length===2?ordinary:staticResponse};};
 const githubReadApi=(t,f=fetch)=>async path=>{const r=await f('https://api.github.com'+path,{method:'GET'});if(!r.ok)throw Error(secret);return r.json();};
 const makeRulesetAttestation=({ruleset:r})=>{if(!Array.isArray(r?.bypass_actors)||r.bypass_actors.length||!r.updated_at)throw Error(secret);return {ruleset:r};};
 const createAttestedReadApi=({api,attestation})=>async path=>{const live=await api(path);if(live.id!==attestation.ruleset.id||canonicalRulesetMarker(live.updated_at)!==canonicalRulesetMarker(attestation.ruleset.updated_at)||canonicalRulesetMarker(live.updated_at)===null)throw Object.assign(Error(secret),{code:'RULESET_MARKER_MISMATCH'});return attestation.ruleset;};
 const createGithubEvidence=({api})=>({readMain:async()=>{await api('/repos/GLORIFIER7/GLORIFIER/rulesets/28293483');if(protection)throw Object.assign(Error(secret),{code:diagnosticCode});return main;}});
 await new AsyncFunction('process','console','fetch','githubReadApi','makeRulesetAttestation','createAttestedReadApi','createGithubEvidence','canonicalRulesetMarker',code)(process,console,fetch,githubReadApi,makeRulesetAttestation,createAttestedReadApi,createGithubEvidence,canonicalRulesetMarker);
 assert.ok(messages.every(x=>!String(x).includes(secret)));assert.ok(calls.every(([,method])=>method==='GET'));assert.equal(process.env.RULESET_ATTEST_TOKEN,undefined);assert.equal(process.env.GITHUB_TOKEN,undefined);
 return {messages,exit:process.exitCode};
}
for(const [name,options,stage] of [
 ['missing token',{token:''},'ATTEST_TOKEN_INVALID'],
 ['missing ordinary token',{readToken:''},'READ_TOKEN_INVALID'],
 ['HTTP forbidden',{http:403},'ATTEST_HTTP_403'],
 ['network failure',{network:true},'ATTEST_REQUEST_FAILED'],
 ['hidden bypass actors',{response:{id:28293483,updated_at:ruleset.updated_at}},'BYPASS_ACTORS_UNAVAILABLE'],
 ['nonempty bypass actors',{response:{...ruleset,bypass_actors:[{}]}},'BYPASS_ACTORS_PRESENT'],
 ['invalid ruleset snapshot',{response:{...ruleset,updated_at:null}},'ATTESTATION_INVALID'],
 ['ordinary read forbidden',{ordinaryHttp:403},'READ_HTTP_403'],
 ['protection mismatch',{protection:true},'GOVERNANCE_OR_SIGNATURE_DENIED'],
 ['main mismatch',{main:{sha:'b'.repeat(40),verified:true,reason:'valid'}},'MAIN_MISMATCH']
])test(name+' is denied with sanitized stage',async()=>{const r=await run(options);assert.equal(r.exit,1);assert.ok(r.messages.some(x=>String(x).includes('RULESET_PREFLIGHT_DENIED '+stage)));});
test('successful preflight is read-only and does not assert drift marker semantics',async()=>{const r=await run();assert.equal(r.exit,0);const receipt=JSON.parse(r.messages.at(-1));assert.equal(receipt.status,'RULESET_PREFLIGHT_VERIFIED_READ_ONLY');assert.equal(receipt.executionAuthorized,false);assert.equal(receipt.publicationAuthorized,false);assert.equal(receipt.driftMarkerSemanticsVerified,false);});

test('workflow emits only allowlisted failure codes, never arbitrary exception data',async()=>{
 for(const [diagnosticCode,expected] of [
  ['RULESET_VISIBLE_FIELDS_MISMATCH','RULESET_VISIBLE_FIELDS_MISMATCH'],
  ['MAIN_SIGNATURE_INVALID','MAIN_SIGNATURE_INVALID'],
  ['REQUIRED_CHECK_BINDING','REQUIRED_CHECK_BINDING'],
  [secret,'GOVERNANCE_OR_SIGNATURE_DENIED'],
 ]){
  const r=await run({protection:true,diagnosticCode});
  assert.equal(r.exit,1);
  assert.deepEqual(r.messages,['RULESET_PREFLIGHT_DENIED '+expected]);
 }
});

test('missing ordinary revision marker verifies static protection separately but never authorizes runtime',async()=>{
 const {updated_at,...ordinary}=ruleset;
 const r=await run({ordinary});
 assert.equal(r.exit,1);
 assert.ok(r.messages.includes('RULESET_RUNTIME_MARKER_UNAVAILABLE'));
 const receipt=JSON.parse(r.messages.find(x=>x.startsWith('{')));
 assert.equal(receipt.status,'RULESET_STATIC_GOVERNANCE_VERIFIED_READ_ONLY');
 assert.equal(receipt.runtimeCompatibilityVerified,false);
 assert.equal(receipt.executionAuthorized,false);
 assert.equal(receipt.publicationAuthorized,false);
 assert.ok(r.messages.includes('RULESET_PREFLIGHT_DENIED RULESET_MARKER_MISMATCH'));
});

for(const [name,ordinary,code] of [
 ['different marker',{...ruleset,updated_at:'2026-11-28T00:01:00Z'},'RULESET_RUNTIME_MARKER_DIFFERENT'],
 ['wrong identity',{...ruleset,id:1},'RULESET_RUNTIME_ID_MISMATCH'],
])test(name+' remains blocked even with a static proof',async()=>{const r=await run({ordinary});assert.equal(r.exit,1);assert.ok(r.messages.includes(code));assert.ok(r.messages.includes('RULESET_PREFLIGHT_DENIED RULESET_MARKER_MISMATCH'));});
test('changed privileged bypass list prevents static proof',async()=>{const r=await run({ordinary:{...ruleset,updated_at:undefined},staticResponse:{...ruleset,bypass_actors:[{}]}});assert.equal(r.exit,1);assert.ok(r.messages.includes('RULESET_STATIC_GOVERNANCE_DENIED'));assert.ok(r.messages.every(x=>!x.startsWith('{')));});
test('changed privileged revision prevents static proof',async()=>{const r=await run({ordinary:{...ruleset,updated_at:undefined},staticResponse:{...ruleset,updated_at:'2026-11-28T00:01:00Z'}});assert.equal(r.exit,1);assert.ok(r.messages.includes('RULESET_STATIC_GOVERNANCE_DENIED'));assert.ok(r.messages.every(x=>!x.startsWith('{')));});

test('real evidence verifier separates live static proof from missing ordinary revision marker',async()=>{
 const {githubReadApi,createGithubEvidence}=await import('../src/dispatcher-github-evidence.mjs');
 const {makeRulesetAttestation,createAttestedReadApi}=await import('../src/dispatcher-ruleset-attestation.mjs');
 const full={...ruleset,target:'branch',enforcement:'active',conditions:{ref_name:{include:['refs/heads/main'],exclude:[]}},rules:[
  {type:'required_signatures'},{type:'non_fast_forward'},{type:'deletion'},
  {type:'pull_request',parameters:{required_approving_review_count:1,dismiss_stale_reviews_on_push:true,require_code_owner_review:true,required_review_thread_resolution:true}},
  {type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:['Required CI','CodeQL (python, none)','CodeQL (javascript-typescript, none)','npm-security','Dependency Review','validate-and-build'].map(context=>({context,integration_id:15368}))}},
  {type:'code_scanning',parameters:{code_scanning_tools:[{tool:'CodeQL',security_alerts_threshold:'high_or_higher',alerts_threshold:'errors'}]}},
  {type:'code_quality',parameters:{severity:'all'}}]};
 const ordinaryToken='ordinary-fixture-token';
 for(const corrupt of [false,true]){
  const messages=[];
  const process={env:{RULESET_ATTEST_TOKEN:secret,GITHUB_TOKEN:ordinaryToken,GITHUB_SHA:sha,GITHUB_RUN_ID:'1'},exitCode:0};
  const console={log:x=>messages.push(x),error:x=>messages.push(x)};
  const fetch=async(url,options)=>{
   assert.equal(options.method,'GET');
   const privileged=options.headers.Authorization==='Bearer '+secret;
   if(url.pathname.endsWith('/commits/main')){
    assert.equal(privileged,false);
    return {ok:true,json:async()=>({sha,commit:{verification:{verified:!corrupt,reason:corrupt?'invalid':'valid'}}})};
   }
   assert.equal(url.pathname,'/repos/GLORIFIER7/GLORIFIER/rulesets/28293483');
   const {updated_at,bypass_actors,...visible}=full;
   return {ok:true,json:async()=>privileged?full:visible};
  };
  await new AsyncFunction('process','console','fetch','githubReadApi','makeRulesetAttestation','createAttestedReadApi','createGithubEvidence','canonicalRulesetMarker',code)(process,console,fetch,githubReadApi,makeRulesetAttestation,createAttestedReadApi,createGithubEvidence,canonicalRulesetMarker);
  assert.equal(process.exitCode,1);
  assert.ok(messages.includes('RULESET_PREFLIGHT_DENIED RULESET_MARKER_MISMATCH'));
  assert.equal(messages.some(x=>x.includes('RULESET_STATIC_GOVERNANCE_VERIFIED_READ_ONLY')), !corrupt);
  assert.ok(messages.every(x=>!x.includes(secret)&&!x.includes(ordinaryToken)));
 }
});

 test('equivalent UTC formatting passes without false static fallback',async()=>{
 const r=await run({ordinary:{...ruleset,updated_at:'2026-11-28T00:00:00.000+00:00'}});
 assert.equal(r.exit,0);
 assert.equal(JSON.parse(r.messages.at(-1)).status,'RULESET_PREFLIGHT_VERIFIED_READ_ONLY');
 assert.ok(!r.messages.includes('RULESET_RUNTIME_MARKER_DIFFERENT'));
 });

test('genuine marker mismatch reports only strictly validated UTC timestamps and remains denied',async()=>{
 const r=await run({ordinary:{...ruleset,updated_at:'2026-11-28T00:00:00.000001Z'}});
 assert.equal(r.exit,1);
 const line=r.messages.find(x=>x.startsWith('RULESET_RUNTIME_MARKER_VALUES '));
 assert.deepEqual(JSON.parse(line.slice('RULESET_RUNTIME_MARKER_VALUES '.length)),{privileged:ruleset.updated_at,ordinary:'2026-11-28T00:00:00.000001Z'});
 assert.ok(r.messages.includes('RULESET_PREFLIGHT_DENIED RULESET_MARKER_MISMATCH'));
 const unsafe=await run({ordinary:{...ruleset,updated_at:secret}});
 assert.equal(unsafe.exit,1);
 assert.ok(!unsafe.messages.some(x=>x.startsWith('RULESET_RUNTIME_MARKER_VALUES ')));
});

test('real preflight accepts observed GitHub offset representation without authorizing execution',async()=>{
 const {githubReadApi,createGithubEvidence}=await import('../src/dispatcher-github-evidence.mjs');
 const {makeRulesetAttestation,createAttestedReadApi}=await import('../src/dispatcher-ruleset-attestation.mjs');
 const full={...ruleset,updated_at:'2026-11-28T20:52:48.235+07:00',created_at:'2026-11-28T20:52:48.100+07:00',target:'branch',enforcement:'active',conditions:{ref_name:{include:['refs/heads/main'],exclude:[]}},rules:[
  {type:'required_signatures'},{type:'non_fast_forward'},{type:'deletion'},
  {type:'pull_request',parameters:{required_approving_review_count:1,dismiss_stale_reviews_on_push:true,require_code_owner_review:true,required_review_thread_resolution:true}},
  {type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:['Required CI','CodeQL (python, none)','CodeQL (javascript-typescript, none)','npm-security','Dependency Review','validate-and-build'].map(context=>({context,integration_id:15368}))}},
  {type:'code_scanning',parameters:{code_scanning_tools:[{tool:'CodeQL',security_alerts_threshold:'high_or_higher',alerts_threshold:'errors'}]}},
  {type:'code_quality',parameters:{severity:'all'}}]};
 const ordinaryToken='ordinary-fixture-token';
 for(const [ordinaryMarker,expected] of [['2026-11-28T13:52:48.235Z',0],['2026-11-28T13:52:48.235000001Z',1]]){
  const messages=[];
  const process={env:{RULESET_ATTEST_TOKEN:secret,GITHUB_TOKEN:ordinaryToken,GITHUB_SHA:sha,GITHUB_RUN_ID:'1'},exitCode:0};
  const console={log:x=>messages.push(x),error:x=>messages.push(x)};
  const fetch=async(url,options)=>{
   assert.equal(options.method,'GET');
   const privileged=options.headers.Authorization==='Bearer '+secret;
   if(url.pathname.endsWith('/commits/main')){
    assert.equal(privileged,false);
    return {ok:true,json:async()=>({sha,commit:{verification:{verified:true,reason:'valid'}}})};
   }
   assert.equal(url.pathname,'/repos/GLORIFIER7/GLORIFIER/rulesets/28293483');
   const {bypass_actors,...visible}=full;
   return {ok:true,json:async()=>privileged?full:{...visible,updated_at:ordinaryMarker,created_at:'2026-11-28T13:52:48.1Z'}};
  };
  await new AsyncFunction('process','console','fetch','githubReadApi','makeRulesetAttestation','createAttestedReadApi','createGithubEvidence','canonicalRulesetMarker',code)(process,console,fetch,githubReadApi,makeRulesetAttestation,createAttestedReadApi,createGithubEvidence,canonicalRulesetMarker);
  assert.equal(process.exitCode,expected);
  assert.ok(messages.every(x=>!x.includes(secret)&&!x.includes(ordinaryToken)));
  const receipt=JSON.parse(messages.find(x=>x.startsWith('{')));
  assert.equal(receipt.executionAuthorized,false);
  assert.equal(receipt.publicationAuthorized,false);
  assert.equal(receipt.driftMarkerSemanticsVerified,false);
  if(expected===0)assert.equal(receipt.status,'RULESET_PREFLIGHT_VERIFIED_READ_ONLY');
  else{
   assert.equal(receipt.status,'RULESET_STATIC_GOVERNANCE_VERIFIED_READ_ONLY');
   assert.ok(messages.includes('RULESET_PREFLIGHT_DENIED RULESET_MARKER_MISMATCH'));
  }
 }
});
