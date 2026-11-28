import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAttestedReadApi,makeRulesetAttestation} from '../src/dispatcher-ruleset-attestation.mjs';
const path='/repos/GLORIFIER7/GLORIFIER/rulesets/28293483';
const sourceSha='a'.repeat(40),runId='123456',now=Date.parse('2026-11-28T11:00:00Z');
const ruleset={id:28293483,source_type:'Repository',source:'GLORIFIER7/GLORIFIER',target:'branch',enforcement:'active',updated_at:'2026-11-28T10:00:00Z',bypass_actors:[],conditions:{ref_name:{include:['refs/heads/main'],exclude:[]}},rules:[{type:'required_signatures'}]};
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

test('canonical object ordering specifies an explicit locale-aware comparator',()=>{
  const source=readFileSync(new URL('../src/dispatcher-ruleset-attestation.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(source,/Object\.keys\(v\)\.sort\(\s*\)/);
  assert.match(source,/localeCompare\(/);
});
test('canonical comparison is independent of nested key insertion order even for collation ties',async()=>{
  const original={...ruleset,metadata:{z:1,'é':2,'e\u0301':3,A:{b:true,a:false}}};
  const {bypass_actors,...rest}=original;
  const reordered={...rest,metadata:{A:{a:false,b:true},'e\u0301':3,'é':2,z:1}};
  const a=makeRulesetAttestation({ruleset:original,sourceSha,runId,now});
  const api=create(read(reordered),a);
  assert.deepEqual(await api(path),original);
  await assert.rejects(()=>create(read({...reordered,metadata:{...reordered.metadata,'é':9}}),a)(path));
});

for (const variable of ['attestation','live']) {
  test(`explicit null guard for ruleset ${variable}`,async()=>{
    if(variable==='attestation')assert.throws(()=>create(read(),null),/DISPATCHER_RULESET_ATTESTATION_DENIED/);
    else await assert.rejects(()=>create(read(null))(path),/DISPATCHER_RULESET_ATTESTATION_DENIED/);
    const source=readFileSync(new URL('../src/dispatcher-ruleset-attestation.mjs',import.meta.url),'utf8');
    assert.ok(source.includes(`if(!${variable})throw Error('DISPATCHER_RULESET_ATTESTATION_DENIED');`));
  });
}

test('attestation binds only the replacement ruleset identity',async()=>{
 const replacement={...ruleset,id:28293483};
 const a=makeRulesetAttestation({ruleset:replacement,sourceSha,runId,now});
 assert.deepEqual(await create(async()=>replacement,a)('/repos/GLORIFIER7/GLORIFIER/rulesets/28293483'),replacement);
 assert.throws(()=>makeRulesetAttestation({ruleset:{...replacement,id:27616646},sourceSha,runId,now}));
 await assert.rejects(()=>create(async()=>({...replacement,id:27616646}),a)('/repos/GLORIFIER7/GLORIFIER/rulesets/28293483'));
});

test('attestation diagnoses marker changes separately from ruleset response differences',async()=>{
 for(const [live,code] of [
  [{...ruleset,updated_at:'2026-11-28T10:01:00Z'},'RULESET_MARKER_MISMATCH'],
  [{...ruleset,bypass_actors:[{actor_id:2}]},'LIVE_BYPASS_DENIED'],
  [{...ruleset,enforcement:'disabled'},'RULESET_VISIBLE_FIELDS_MISMATCH'],
 ])await assert.rejects(()=>create(read(live))(path),{message:'DISPATCHER_RULESET_ATTESTATION_DENIED',code});
});

test('equivalent UTC marker spellings preserve the full revision instant',async()=>{
 const a=makeRulesetAttestation({ruleset:{...ruleset,updated_at:'2026-11-28T10:00:00.123456Z'},sourceSha,runId,now});
 const live={...ruleset,updated_at:'2026-11-28T10:00:00.123456000+00:00'};
 assert.deepEqual(await create(read(live),a)(path),a.ruleset);
});
test('submillisecond changes are denied, not rounded away',async()=>{
 const a=makeRulesetAttestation({ruleset:{...ruleset,updated_at:'2026-11-28T10:00:00.123456Z'},sourceSha,runId,now});
 await assert.rejects(()=>create(read({...ruleset,updated_at:'2026-11-28T10:00:00.123457Z'}),a)(path),{code:'RULESET_MARKER_MISMATCH'});
});
test('invalid calendar dates cannot be normalized into valid revisions',()=>{
 assert.throws(()=>makeRulesetAttestation({ruleset:{...ruleset,updated_at:'2026-02-30T10:00:00Z'},sourceSha,runId,now}));
});

test('observed GitHub +07:00 revision is identical to its UTC instant',async()=>{
 const privileged={...ruleset,updated_at:'2026-11-28T20:52:48.235+07:00',created_at:'2026-11-28T20:52:48.100+07:00'};
 const {bypass_actors,...visible}=privileged;
 const live={...visible,updated_at:'2026-11-28T13:52:48.235Z',created_at:'2026-11-28T13:52:48.1Z'};
 const a=makeRulesetAttestation({ruleset:privileged,sourceSha,runId,now});
 assert.deepEqual(await create(read(live),a)(path),privileged);
 await assert.rejects(()=>create(read({...live,updated_at:'2026-11-28T13:52:48.235000001Z'}),a)(path),{code:'RULESET_MARKER_MISMATCH'});
 await assert.rejects(()=>create(read({...live,created_at:'2026-11-28T13:52:48.100000001Z'}),a)(path),{code:'RULESET_VISIBLE_FIELDS_MISMATCH'});
});
test('negative offsets and day rollover preserve fractional precision',async()=>{
 const a=makeRulesetAttestation({ruleset:{...ruleset,updated_at:'2026-11-28T23:59:59.123456789-03:30'},sourceSha,runId,now});
 assert.deepEqual(await create(read({...ruleset,updated_at:'2026-11-29T03:29:59.123456789Z'}),a)(path),a.ruleset);
});
test('malformed offset, unknown offset and impossible local calendar dates are denied',()=>{
 for(const updated_at of ['2026-11-28T20:52:48.235+24:00','2026-11-28T20:52:48.235+07:60','2026-11-28T20:52:48.235-00:00','2026-02-30T20:52:48.235+07:00','2026-11-28T20:52:48.235+07:00\n'])assert.throws(()=>makeRulesetAttestation({ruleset:{...ruleset,updated_at},sourceSha,runId,now}));
});
