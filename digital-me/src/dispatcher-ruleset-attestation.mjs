// The privileged read is isolated in a separate job. The dispatcher never
// receives its credential. Missing bypass actors are NOT interpreted as zero.
const path='/repos/GLORIFIER7/GLORIFIER/rulesets/27616646';
const check=v=>{if(!v)throw Error('DISPATCHER_RULESET_ATTESTATION_DENIED');};
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const run=v=>typeof v==='string'&&/^\d{1,24}$/.test(v);
const marker=r=>typeof r?.updated_at==='string'&&Number.isFinite(Date.parse(r.updated_at));
function canonical(v){
  if(Array.isArray(v))return v.map(canonical);
  if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
  return v;
}
function visible(r){const {bypass_actors,...rest}=r;return JSON.stringify(canonical(rest));}
export function makeRulesetAttestation({ruleset,sourceSha,runId,now=Date.now()}){
  check(sha(sourceSha)&&run(runId)&&Number.isSafeInteger(now)&&now>0&&ruleset?.id===27616646&&marker(ruleset)&&Array.isArray(ruleset.bypass_actors)&&ruleset.bypass_actors.length===0);
  return {schemaVersion:1,sourceSha,runId,observedAt:now,ruleset:structuredClone(ruleset)};
}
export function createAttestedReadApi({api,attestation,sourceSha,runId,now=Date.now}){
  check(typeof api==='function'&&typeof now==='function'&&attestation?.schemaVersion===1&&attestation.sourceSha===sourceSha&&attestation.runId===runId);
  const a=makeRulesetAttestation({ruleset:attestation.ruleset,sourceSha,runId,now:attestation.observedAt});
  function fresh(){const age=now()-a.observedAt;check(Number.isFinite(age)&&age>=0&&age<=1200000);}
  return async p=>{
    if(p!==path)return api(p);
    fresh();const live=await api(p);fresh();
    check(live?.id===a.ruleset.id&&marker(live)&&live.updated_at===a.ruleset.updated_at);
    check(!Object.hasOwn(live,'bypass_actors')||(Array.isArray(live.bypass_actors)&&live.bypass_actors.length===0));
    check(visible(live)===visible(a.ruleset));
    return structuredClone(a.ruleset);
  };
}
