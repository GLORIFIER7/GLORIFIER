import test from 'node:test';
import assert from 'node:assert/strict';
import {createAttestedReadApi,makeRulesetAttestation} from '../src/dispatcher-ruleset-attestation.mjs';
const path='/repos/GLORIFIER7/GLORIFIER/rulesets/27616646';
const sourceSha='a'.repeat(40),runId='123456',now=Date.parse('2026-11-28T11:00:00Z');
const ruleset={id:27616646,source_type:'Repository',source:'GLORIFIER7/GLORIFIER',target:'branch',enforcement:'active',updated_at:'2026-11-28T10:00:00Z',bypass_actors:[],conditions:{ref_name:{include:['refs/heads/main'],exclude:[]}},rules:[{type:'required_signatures'}]};
const read=(r=ruleset)=>async p=>p===path?r:{sha:sourceSha};
const att=()=>makeRulesetAttestation({ruleset,sourceSha,runId,now});
const create=(api,attestation=att(),stamp=now)=>createAttestedReadApi({api,attestation,sourceSha,runId,now:()=>stamp});
test('uses same-run zero-bypass snapshot only when live visible rules are unchanged',async()=>{
  const {bypass_actors,...visible}=ruleset;const api=create(read(visible));assert.deepEqual(await api(path),ruleset);assert.deepEqual(await api('/repos/GLORIFIER7/GLORIFIER/commits/main'),{sha:sourceSha});
});
test('rejects absent or nonempty privileged bypass list',()=>{
  const {bypass_actors,...visible}=ruleset;
  for(const r of [visible,{...ruleset,bypass_actors:[{actor_id:1}]}])assert.throws(()=>makeRulesetAttestation({ruleset:r,sourceSha,runId,now}));
});
test('rejects drift, absent change marker, or a live nonzero bypass list',async()=>{
  for(const r of [{...ruleset,updated_at:'2026-11-28T10:01:00Z'},{...ruleset,updated_at:undefined},{...ruleset,enforcement:'disabled'},{...ruleset,bypass_actors:[{actor_id:2}]}])await assert.rejects(()=>create(read(r))(path));
});
test('rejects stale, wrong run, wrong source, or future attestations',async()=>{
  for(const a of [{...att(),runId:'9'},{...att(),sourceSha:'b'.repeat(40)},{...att(),observedAt:now+1000},{...att(),observedAt:now-1200001}])await assert.rejects(async()=>create(read(),a)(path));
});
test('rechecks visible rules on every fence read',async()=>{let r=ruleset;const api=create(async()=>r);await api(path);r={...ruleset,updated_at:'2026-11-28T10:01:00Z'};await assert.rejects(()=>api(path));});
