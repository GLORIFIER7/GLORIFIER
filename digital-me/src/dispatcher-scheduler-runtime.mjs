import {createHash} from 'node:crypto';
const repo='GLORIFIER7/GLORIFIER', owner='github:32674233', recipe='dispatcher-receipt-limit';
const sha=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const mission=v=>typeof v==='string'&&/^mission-coding-[a-f0-9]{64}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=()=>{throw Error('SCHEDULER_CANDIDATE_DENIED');};
const fingerprint=c=>createHash('sha256').update(JSON.stringify(c)).digest('hex');
const identity=(c,r)=>c?.missionId===r.missionId&&c.base===r.base&&c.recipeId===r.recipeId;

// Reuse the dispatcher core and existing mission store; no new authority or ledger.
export async function runSchedulerTick(d){
  if(d?.enabled!==true)return {status:'DISABLED',merged:false,fullyVerified:false};
  const m=await d.readMain();
  if(!sha(d.sourceSha)||m?.sha!==d.sourceSha||m.verified!==true||m.reason!=='valid')throw Error('SCHEDULER_SOURCE_DENIED');
  const recovered=await d.recoverExpired();
  if(!Number.isSafeInteger(recovered)||recovered<0)throw Error('SCHEDULER_RECOVERY_INCOMPLETE');
  let prepared, verified, used=false;
  const requestOk=r=>mission(r?.missionId)&&r.base===d.sourceSha&&r.recipeId===recipe;
  const candidateOk=(c,r)=>identity(c,r)&&c.status==='candidate-created'&&hash(c.digest)&&Array.isArray(c.changes)&&c.baselinePassed===true&&c.redReproduced===true&&c.greenPassed===true;
  const result=await d.dispatchTick({enabled:true,workerId:d.workerId,store:d.store,now:d.now,readMain:d.readMain,
    getAuthorization:async r=>{const g=await d.getAuthorization(r);return g?.recipeId===recipe?g:null;},
    prepare:async r=>{
      if(!requestOk(r))fail();prepared=undefined;verified=undefined;used=false;
      const c=await d.withCheckout(checkout=>d.prepare(checkout,r));
      if(c?.status==='already-applied')return c;
      if(!candidateOk(c,r))fail();prepared={request:Object.freeze({...r}),fingerprint:fingerprint(c)};return c;
    },
    verifyCandidate:async c=>{
      verified=undefined;
      if(!prepared||fingerprint(c)!==prepared.fingerprint)return false;
      const ok=await d.withCheckout(checkout=>d.verify(checkout,prepared.request,c));
      if(ok===true)verified=prepared.fingerprint;
      return ok===true;
    },
    publish:async(c,fence)=>{
      if(used||!verified||verified!==fingerprint(c)||!identity(c,fence)||fence.digest!==c.digest)fail();
      used=true;return d.publish(c,fence);
    },
    readPublication:async(fence,written)=>{if(!used||!prepared||!identity(fence,prepared.request))fail();return d.readPublication(fence,written);}
  });
  return {...result,recovered,merged:false,fullyVerified:false};
}

// Expired work is quarantined, never replayed. CAS prevents overwriting a renewal.
export async function quarantineExpired({rows,store,now}){
  if(!Number.isSafeInteger(now)||!Array.isArray(rows)||rows.length>100)throw Error('SCHEDULER_RECOVERY_INCOMPLETE');
  for(const row of rows){
    const p=row?.dispatcher;
    if(!mission(row?.id)||row.requester!==owner||row.title!=='GitHub fix #471'||row.status!=='executing'||
       !Number.isSafeInteger(row.version)||!row.leaseOwner||!Number.isFinite(Date.parse(row.leaseExpiresAt))||Date.parse(row.leaseExpiresAt)>now||
       !['preparing','publishing'].includes(p?.phase)||!sha(p.base)||![1,2].includes(p.attempts))throw Error('SCHEDULER_RECOVERY_INCOMPLETE');
    const at=new Date(now).toISOString();
    const event={schemaVersion:1,missionId:row.id,repository:repo,base:p.base,recipeId:p.recipeId,grantId:p.grantId,workerId:row.leaseOwner,attempt:p.attempts,maximumCostMicrousd:0,phase:'quarantined',outcome:'RECONCILIATION_REQUIRED',at,...(hash(p.digest)?{candidateDigest:p.digest}:{})};
    const next={...row,status:'reconciliation-required',verificationState:'reconciliation-required',updatedAt:at,dispatcher:{...p,phase:'quarantined',provenance:[...(Array.isArray(p.provenance)?p.provenance.slice(-4):[]),event]}};
    delete next.leaseOwner;delete next.leaseExpiresAt;delete next.nextRunAt;
    if(!await store.save(next,row.version))throw Error('SCHEDULER_RECOVERY_INCOMPLETE');
  }
  return rows.length;
}
