import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../../.github/workflows/digital-me-ruleset-preflight.yml',import.meta.url),'utf8');
const code=workflow.split("node --input-type=module <<'NODE'\n")[1].split('\n          NODE')[0].replace(/^\s*import .*;$/gm,'');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const sha='a'.repeat(40), secret='fixture-token-do-not-log', ruleset={id:28293483,bypass_actors:[],updated_at:'2026-11-28T00:00:00Z'};
async function run({token=secret,readToken=secret,response=ruleset,http=200,ordinaryHttp=200,ordinary=ruleset,main={sha,verified:true,reason:'valid'},protection=false,network=false,diagnosticCode}={}){
 const messages=[],calls=[];const process={env:{RULESET_ATTEST_TOKEN:token,GITHUB_TOKEN:readToken,GITHUB_SHA:sha,GITHUB_RUN_ID:'1'},exitCode:0};
 const console={log:x=>messages.push(x),error:x=>messages.push(x)};
 const fetch=async(url,options)=>{calls.push([String(url),options.method]);if(network)throw Error(secret); const status=calls.length===1?http:ordinaryHttp;return {ok:status===200,status,json:async()=>calls.length===1?response:ordinary};};
 const githubReadApi=(t,f=fetch)=>async path=>{const r=await f('https://api.github.com'+path,{method:'GET'});if(!r.ok)throw Error(secret);return r.json();};
 const makeRulesetAttestation=({ruleset:r})=>{if(!Array.isArray(r?.bypass_actors)||r.bypass_actors.length||!r.updated_at)throw Error(secret);return {ruleset:r};};
 const createAttestedReadApi=({api,attestation})=>async path=>{const live=await api(path);if(live.updated_at!==attestation.ruleset.updated_at)throw Error(secret);return attestation.ruleset;};
 const createGithubEvidence=({api})=>({readMain:async()=>{await api('/repos/GLORIFIER7/GLORIFIER/rulesets/28293483');if(protection)throw Object.assign(Error(secret),{code:diagnosticCode});return main;}});
 await new AsyncFunction('process','console','fetch','githubReadApi','makeRulesetAttestation','createAttestedReadApi','createGithubEvidence',code)(process,console,fetch,githubReadApi,makeRulesetAttestation,createAttestedReadApi,createGithubEvidence);
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
