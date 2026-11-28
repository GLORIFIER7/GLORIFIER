// Reconcile only durable, previously verified publications. No grant or publisher
// is used here: a completed historic repair is not a new execution request.
const repo='GLORIFIER7/GLORIFIER',owner='github:32674233',recipe='dispatcher-receipt-limit';
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const positive=v=>Number.isSafeInteger(v)&&v>0;
const deny=()=>{throw Error('MERGE_RECONCILIATION_DENIED');};
const requireThat=v=>{if(!v)deny();};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function validate(row){
  if(!row)throw Error('MERGE_RECONCILIATION_DENIED');
  const p=row.dispatcher;
  if(!p)throw Error('MERGE_RECONCILIATION_DENIED');
  requireThat(/^mission-coding-[a-f0-9]{64}$/.test(row.id??'')&&row.requester===owner&&row.title==='GitHub fix #471'&&row.status==='blocked'&&positive(row.version)&&!row.leaseOwner&&!row.leaseExpiresAt&&p.phase==='awaiting-review'&&p.recipeId===recipe&&sha(p.base)&&sha(p.head)&&p.base!==p.head&&positive(p.pr)&&hash(p.digest)&&[1,2].includes(p.attempts)&&p.grantId==='digital-me-grant-'+row.id.slice(15)&&Array.isArray(p.provenance)&&p.provenance.length<=5);
  const match=e=>e?.schemaVersion===1&&e.missionId===row.id&&e.repository===repo&&e.base===p.base&&e.recipeId===recipe&&e.grantId===p.grantId&&e.attempt===p.attempts&&e.maximumCostMicrousd===0&&e.candidateDigest===p.digest&&Number.isFinite(Date.parse(e.at));
  const last=p.provenance.at(-1),candidate=p.provenance.at(-2);
  requireThat(match(last)&&last.outcome==='SIGNED_DRAFT_VERIFIED'&&last.phase==='awaiting-review'&&last.head===p.head&&last.pr===p.pr&&last.signatureVerified===true&&last.ciJobsCreated===true&&match(candidate)&&candidate.outcome==='CANDIDATE_VERIFIED'&&candidate.phase==='publishing'&&['baselinePassed','redReproduced','greenPassed','independentVerifierPassed'].every(k=>candidate.candidateVerification?.[k]===true));
  return p;
}
export async function reconcileMergedMissions({rows,store,now,sourceSha,workerId,readMerge}){
  requireThat(Array.isArray(rows)&&rows.length<=100&&Number.isSafeInteger(now)&&now>0&&sha(sourceSha)&&/^github-run-\d+$/.test(workerId)&&typeof store?.get==='function'&&typeof store?.save==='function'&&typeof readMerge==='function');
  let reconciled=0,pending=0;
  for(const observed of rows){
    const p=validate(observed),row=await store.get(observed.id);
    if(!row||row.version!==observed.version){pending++;continue;}
    requireThat(same(row.dispatcher,p)&&row.status===observed.status);validate(row);
    const proof=await readMerge({missionId:row.id,base:p.base,head:p.head,pr:p.pr,digest:p.digest,sourceSha});
    if(proof?.status!=='MERGED'||proof.pr!==p.pr||proof.head!==p.head||proof.base!==p.base||proof.digest!==p.digest||proof.mainSha!==sourceSha||!sha(proof.mergeSha)||proof.reviewerId!==32674233||!Array.isArray(proof.checkIds)||proof.checkIds.length!==6||!proof.checkIds.every(positive)||new Set(proof.checkIds).size!==6||!Number.isFinite(Date.parse(proof.mergedAt))||Date.parse(proof.mergedAt)<Date.parse(p.provenance.at(-1).at)||Date.parse(proof.mergedAt)>now){pending++;continue;}
    const at=new Date(now).toISOString(),event={schemaVersion:1,missionId:row.id,repository:repo,base:p.base,recipeId:recipe,grantId:p.grantId,workerId,attempt:p.attempts,maximumCostMicrousd:0,phase:'merged-reconciled',outcome:'PROTECTED_MERGE_RECONCILED',at,candidateDigest:p.digest,pr:p.pr,head:p.head,mergeSha:proof.mergeSha,mainSha:sourceSha,mergedAt:proof.mergedAt,reviewerId:proof.reviewerId,checkIds:proof.checkIds};
    const next={...row,status:'completed',verificationState:'pending-external-evidence',updatedAt:at,dispatcher:{...p,phase:'merged-reconciled',mergeSha:proof.mergeSha,provenance:[...p.provenance.slice(-4),event]},evidenceRefs:[...new Set([...(Array.isArray(row.evidenceRefs)?row.evidenceRefs:[]),'https://github.com/'+repo+'/pull/'+p.pr,'https://github.com/'+repo+'/commit/'+proof.mergeSha])]};
    delete next.lastError;delete next.nextRunAt;delete next.leaseOwner;delete next.leaseExpiresAt;
    const saved=await store.save(next,row.version);requireThat(saved?.version===row.version+1&&saved.status==='completed'&&saved.dispatcher?.mergeSha===proof.mergeSha);reconciled++;
  }
  return {reconciled,pending};
}
