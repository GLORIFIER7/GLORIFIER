// The privileged read is isolated in a separate job. The dispatcher never
// receives its credential. Missing bypass actors are NOT interpreted as zero.
const path='/repos/GLORIFIER7/GLORIFIER/rulesets/28293483';
const check=(v,code)=>{if(!v)throw Object.assign(Error('DISPATCHER_RULESET_ATTESTATION_DENIED'),code?{code}:{});};
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const run=v=>typeof v==='string'&&/^\d{1,24}$/.test(v);
// Compare UTC revision markers without rounding away fractional seconds.
// Only equivalent UTC spellings are canonicalized; other forms fail closed.
export function canonicalRulesetMarker(value){
  if(typeof value!=='string')return null;
  const m=/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(?:Z|\+00:00)$/.exec(value);
  if(!m||m[0]!==value)return null;
  const seconds=Date.parse(m[1]+'Z');
  if(!Number.isFinite(seconds)||new Date(seconds).toISOString()!==m[1]+'.000Z')return null;
  const fraction=(m[2]??'').replace(/0+$/,'');
  return m[1]+(fraction?'.'+fraction:'')+'Z';
}
const marker=r=>canonicalRulesetMarker(r?.updated_at)!==null;
function canonical(v){
  if(Array.isArray(v))return v.map(canonical);
  if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort((a,b)=>a.localeCompare(b,'en-US',{sensitivity:'variant'})||(a<b?-1:a>b?1:0)).map(k=>[k,canonical(v[k])]));
  return v;
}
function visible(r){const {bypass_actors,...rest}=r;return JSON.stringify(canonical({...rest,updated_at:canonicalRulesetMarker(rest.updated_at)}));}
export function makeRulesetAttestation({ruleset,sourceSha,runId,now=Date.now()}){
  check(sha(sourceSha)&&run(runId)&&Number.isSafeInteger(now)&&now>0&&ruleset?.id===28293483&&marker(ruleset)&&Array.isArray(ruleset.bypass_actors)&&ruleset.bypass_actors.length===0);
  return {schemaVersion:1,sourceSha,runId,observedAt:now,ruleset:structuredClone(ruleset)};
}
export function createAttestedReadApi({api,attestation,sourceSha,runId,now=Date.now}){
  if(!attestation)throw Error('DISPATCHER_RULESET_ATTESTATION_DENIED');
  check(typeof api==='function'&&typeof now==='function'&&attestation.schemaVersion===1&&attestation.sourceSha===sourceSha&&attestation.runId===runId);
  const a=makeRulesetAttestation({ruleset:attestation.ruleset,sourceSha,runId,now:attestation.observedAt});
  function fresh(){const age=now()-a.observedAt;check(Number.isFinite(age)&&age>=0&&age<=1200000,'ATTESTATION_EXPIRED');}
  return async p=>{
    if(p!==path)return api(p);
    fresh();const live=await api(p);fresh();
    if(!live)throw Error('DISPATCHER_RULESET_ATTESTATION_DENIED');
    check(live.id===a.ruleset.id&&marker(live)&&canonicalRulesetMarker(live.updated_at)===canonicalRulesetMarker(a.ruleset.updated_at),'RULESET_MARKER_MISMATCH');
    check(!Object.hasOwn(live,'bypass_actors')||(Array.isArray(live.bypass_actors)&&live.bypass_actors.length===0),'LIVE_BYPASS_DENIED');
    check(visible(live)===visible(a.ruleset),'RULESET_VISIBLE_FIELDS_MISMATCH');
    return structuredClone(a.ruleset);
  };
}
