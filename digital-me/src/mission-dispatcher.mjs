import { createHash } from 'node:crypto';

// Dispatcher core only. All adapters must be trusted, repository-owned code.
// Do not expose this function as an agent-callable endpoint or enable it before
// dedicated ledger permissions, real GEAS authorization and publisher integration.
const REPO='GLORIFIER7/GLORIFIER', REQUESTER='github:32674233';
const BOT='glorifier-digital-me[bot]', LEASE_MS=300_000, MAX_ATTEMPTS=2;
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const identifier=x=>typeof x==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(x);
const result=(status,extra={})=>({status,...extra,merged:false,fullyVerified:false});
const iso=n=>new Date(n).toISOString();
function admission(row,id) {
  if(!row||row.id!==id||row.requester!==REQUESTER||row.status!=='blocked'||
     !Number.isSafeInteger(row.version)||row.version<1||row.leaseOwner||row.leaseExpiresAt||
     !Array.isArray(row.steps)||row.steps.length!==0||typeof row.objective!=='string'||row.objective.length>4096) return null;
  let o;try{o=JSON.parse(row.objective);}catch{return null;}
  if(o?.schemaVersion!==1||o.repository!==REPO||o.intent!=='fix'||o.executionAuthorized!==false||
     o.target?.kind!=='issue'||o.target.number!==471||o.target.headSha!==null||
     !Number.isSafeInteger(o.commentId)||o.commentId<1||!sha(o.sourceSnapshotSha))return null;
  const key=`github:${REPO}:comment:${o.commentId}`;
  if(row.idempotencyKey!==key||id!=='mission-coding-'+createHash('sha256').update(key).digest('hex'))return null;
  if(row.dispatcher&&(!['retryable'].includes(row.dispatcher.phase)||
      !Number.isSafeInteger(row.dispatcher.attempts)||row.dispatcher.attempts<1||row.dispatcher.attempts>=MAX_ATTEMPTS))return null;
  if(!row.dispatcher&&row.version!==1)return null;
  return {base:o.sourceSnapshotSha,attempts:row.dispatcher?.attempts??0};
}
function grantValid(g,id,base,now){return g?.repository===REPO&&g.missionId===id&&g.base===base&&identifier(g.recipeId)&&identifier(g.grantId)&&g.revoked===false&&g.executionAuthorized===true&&g.publicationAuthorized===true&&g.maximumCostMicrousd===0&&typeof g.expiresAt==='string'&&Number.isFinite(Date.parse(g.expiresAt))&&Date.parse(g.expiresAt)>now;}
function candidateValid(c,base,recipe){return c?.base===base&&c.recipeId===recipe&&hash(c.digest)&&c.baselinePassed===true&&c.redReproduced===true&&c.greenPassed===true;}
function publicationValid(p,w,id,base,digest){return p?.missionId===id&&p.base===base&&p.digest===digest&&p.head===w?.head&&p.pr===w?.pr&&sha(p.head)&&Number.isSafeInteger(p.pr)&&p.pr>0&&p.author===BOT&&p.verified===true&&p.reason==='valid'&&p.draft===true&&p.ciJobsCreated===true;}

export async function dispatchMission(id,deps={}){
  const {store,now,workerId,getAuthorization,readMain,prepare,verifyCandidate,publish,readPublication}=deps;
  if(typeof id!=='string'||!/^mission-coding-[a-f0-9]{64}$/.test(id)||!identifier(workerId)||typeof store?.get!=='function'||typeof store?.save!=='function'||![now,getAuthorization,readMain,prepare,verifyCandidate,publish,readPublication].every(f=>typeof f==='function'))return result('DENIED');
  let row=await store.get(id), info=admission(row,id);
  if(!info)return result('NOT_ELIGIBLE');
  const {base,attempts}=info;
  let grant;
  try{grant=await getAuthorization({missionId:id,repository:REPO,base});
    const m=await readMain();if(!grantValid(grant,id,base,now())||m?.sha!==base||m.verified!==true||m.reason!=='valid')return result('DENIED');
  }catch{return result('DENIED');}
  // Snapshot trusted authorization fields; a mutated adapter result cannot change the binding.
  const recipeId=grant.recipeId,grantId=grant.grantId;
  const stamp=now(),expires=stamp+LEASE_MS;
  if(!Number.isSafeInteger(stamp)||stamp<0)return result('DENIED');
  const claim={...row,status:'executing',leaseOwner:workerId,leaseExpiresAt:iso(expires),updatedAt:iso(stamp),dispatcher:{phase:'preparing',attempts:attempts+1,recipeId,grantId,base}};
  row=await store.save(claim,row.version);
  if(!row)return result('NOT_ELIGIBLE');
  const own=async()=>{const r=await store.get(id);return r?.version===row.version&&r.status==='executing'&&r.leaseOwner===workerId&&r.leaseExpiresAt===iso(expires)&&now()<expires;};
  const transition=async(phase,status,extra={})=>{
    const next={...row,status,updatedAt:iso(now()),dispatcher:{...row.dispatcher,phase,...extra}};
    if(status!=='executing'){delete next.leaseOwner;delete next.leaseExpiresAt;delete next.nextRunAt;}
    if(phase==='awaiting-review')next.verificationState='pending-external-evidence';
    if(status==='reconciliation-required')next.verificationState='reconciliation-required';
    const saved=await store.save(next,row.version);if(saved)row=saved;return Boolean(saved);
  };
  const quarantine=async()=>{try{await transition('quarantined','reconciliation-required');}catch{/* persistent publishing marker must be reconciled */}return result('RECONCILIATION_REQUIRED');};
  const stop=async(status)=>{try{if(!await own())return quarantine();return await transition('retryable','blocked')?result(status):result('RECONCILIATION_REQUIRED');}catch{return result('RECONCILIATION_REQUIRED');}};
  const authorized=async()=>{const g=await getAuthorization({missionId:id,repository:REPO,base});const m=await readMain();return grantValid(g,id,base,now())&&g.recipeId===recipeId&&g.grantId===grantId&&m?.sha===base&&m.verified===true&&m.reason==='valid';};
  let candidate;
  try{
    candidate=await prepare({missionId:id,base,recipeId});
    if(!await own())return quarantine();
    if(candidate?.status==='already-applied')return await transition('already-applied','blocked')?result('ALREADY_APPLIED'):result('RECONCILIATION_REQUIRED');
    if(!candidateValid(candidate,base,recipeId))return stop('CANDIDATE_REJECTED');
    // Immutable binding passed separately; verifier must reproduce and inspect the exact manifest.
    candidate=Object.freeze({...candidate});
    if(await verifyCandidate(candidate)!==true)return stop('CANDIDATE_REJECTED');
    if(!await own())return quarantine();
    if(!await authorized())return stop('DENIED');
    if(!await own())return quarantine();
  }catch{return stop('CANDIDATE_REJECTED');}
  // Durable intent BEFORE external writes. Never automatically retry from this phase.
  try{
    if(!await transition('publishing','executing',{digest:candidate.digest}))return result('RECONCILIATION_REQUIRED');
    if(!await own()||!await authorized()||!await own())return quarantine();
    // Adapter MUST recheck this fence immediately before GitHub mutation and use a
    // deterministic branch, expectedHeadOid and exact digest. Uncertain writes quarantine.
    const fence=Object.freeze({missionId:id,base,recipeId,grantId,workerId,version:row.version,leaseExpiresAt:iso(expires),digest:candidate.digest});
    const written=await publish(candidate,fence);
    const observed=await readPublication(fence,written);
    if(!await own()||!publicationValid(observed,written,id,base,candidate.digest))return quarantine();
    if(!await transition('awaiting-review','blocked',{pr:observed.pr,head:observed.head}))return result('RECONCILIATION_REQUIRED');
    return result('SIGNED_DRAFT_VERIFIED',{pr:observed.pr,head:observed.head});
  }catch{return quarantine();}
}

// One scheduler tick, not a daemon. A trusted scheduler must provide the scoped
// store and adapters and enforce a free execution budget. No generic workers.
export async function dispatchTick(deps={}){
  if(deps.enabled!==true)return result('DISABLED');
  if(typeof deps.store?.list!=='function')return result('DENIED');
  let rows;try{rows=await deps.store.list(REQUESTER,100,false);}catch{return result('INVENTORY_INCOMPLETE');}
  // A full page might hide older eligible work; do not silently treat as exhaustive.
  if(!Array.isArray(rows)||rows.length>=100)return result('INVENTORY_INCOMPLETE');
  const results=[],seen=new Set();
  for(const row of rows){
    if(!admission(row,row?.id)||seen.has(row.id))continue;
    seen.add(row.id);
    try{results.push(await dispatchMission(row.id,deps));}catch{results.push(result('RECONCILIATION_REQUIRED'));}
    // One publication attempt per tick; no flood of independent repairs.
    break;
  }
  return result('TICK_COMPLETE',{results});
}
