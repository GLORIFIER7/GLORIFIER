// GAME v1: advisory ranking only. All inputs MUST come from authenticated,
// independently verified evidence and the existing GEAS/mission ledger, not agents.
// No IO, inference, identity grant, lease acquisition, spending, or execution here.
export const GAME_WEIGHTS = Object.freeze({quality:30, throughput:25, reliability:15, resolution:15, interoperability:10, efficiency:5});
const POLICY = ['protocol','corpusSha','windowStart','windowEnd','attempts','throughputTargetPerHour','resourceBudgetUnits','minQualityBps','minReliabilityBps','minCoordinationBps','minInteroperabilityBps'];
const REPORT = ['candidateId','corpusSha','protocol','windowStart','windowEnd','attempted','verifiedSuccessful','qualityBps','coordinationBps','resolved','interoperabilityBps','resourceUnits','costMicrousd','evidence','evidenceId','trust','available'];
const MISSION = ['missionId','scopeVerified','authorization','status','dependencyReady','needVerified','impactBps','urgencyBps','attempts','maxAttempts','nextRunAt','costMicrousd'];
const MAX_ROWS=1000, MAX_COUNT=1000000, DAY=86400000;
const ownRecord=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  [Object.prototype,null].includes(Object.getPrototypeOf(v))&&Reflect.ownKeys(v).length===keys.length&&
  keys.every(k=>{const d=Object.getOwnPropertyDescriptor(v,k);return d&&Object.hasOwn(d,'value');});
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const bps=n=>integer(n,0,10000);
const time=n=>integer(n,0,Number.MAX_SAFE_INTEGER);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(v);
const cmp=(a,b)=>a<b?-1:a>b?1:0;
const ratio=(a,b)=>Math.floor(10000*a/b);
const base=(status,ranked=[],rejected=[],ceoCandidate=null)=>({status,ranked,rejected,ceoCandidate,executionAuthorized:false,publicationAuthorized:false,approvalAuthorized:false,fullyVerified:false});
function validBenchmark(p,now){return ownRecord(p,POLICY)&&time(now)&&p.protocol==='game-v1'&&typeof p.corpusSha==='string'&&/^[a-f0-9]{64}$/.test(p.corpusSha)&&time(p.windowStart)&&time(p.windowEnd)&&
  p.windowEnd<=now&&now-p.windowEnd<=DAY&&p.windowEnd-p.windowStart>=60000&&p.windowEnd-p.windowStart<=DAY&&integer(p.attempts,20,MAX_COUNT)&&integer(p.throughputTargetPerHour,1,MAX_COUNT)&&integer(p.resourceBudgetUnits,1,MAX_COUNT)&&
  integer(p.minQualityBps,8000,10000)&&integer(p.minReliabilityBps,9000,10000)&&integer(p.minCoordinationBps,8000,10000)&&p.minInteroperabilityBps===10000;}
function reportDenial(r,p){
  if(r.protocol!==p.protocol||r.corpusSha!==p.corpusSha||r.windowStart!==p.windowStart||r.windowEnd!==p.windowEnd||r.attempted!==p.attempts)return 'incomparable-workload';
  if(r.evidence!=='VERIFIED'||r.trust!=='eligible'||r.available!==true||r.costMicrousd!==0)return 'trust-availability-cost';
  if(!integer(r.verifiedSuccessful,0,r.attempted)||!integer(r.resolved,0,r.verifiedSuccessful)||!bps(r.qualityBps)||!bps(r.coordinationBps)||!bps(r.interoperabilityBps)||!integer(r.resourceUnits,0,p.resourceBudgetUnits))return 'invalid-measurement';
  if(r.qualityBps<p.minQualityBps||ratio(r.verifiedSuccessful,r.attempted)<p.minReliabilityBps||r.coordinationBps<p.minCoordinationBps||r.interoperabilityBps<p.minInteroperabilityBps)return 'minimum-eligibility';
  return null;
}
// Aggregate reports must cover the same complete, independently adjudicated corpus
// and full wall-clock window (failed attempts, timeouts, and idle time included).
export function rankContributors(reports,benchmark,nowMs){
  if(!validBenchmark(benchmark,nowMs))return base('INVALID_BENCHMARK');
  if(!Array.isArray(reports)||reports.length>MAX_ROWS)return base('INVALID_COHORT');
  const candidates=new Set(),evidence=new Set();
  for(const r of reports){if(!ownRecord(r,REPORT)||!id(r.candidateId)||!id(r.evidenceId)||candidates.has(r.candidateId)||evidence.has(r.evidenceId))return base('INVALID_COHORT');candidates.add(r.candidateId);evidence.add(r.evidenceId);}
  const ranked=[],rejected=[],elapsed=benchmark.windowEnd-benchmark.windowStart;
  for(const r of reports){const reason=reportDenial(r,benchmark);if(reason){rejected.push({candidateId:r.candidateId,reason});continue;}
    const reliability=ratio(r.verifiedSuccessful,r.attempted),resolution=ratio(r.resolved,r.attempted);
    // Same time window for all candidates. Throughput uses the complete window,
    // never per-success latency; capped score is distinct from raw CEO ordering.
    const perHour=r.verifiedSuccessful*3600000/elapsed;
    const throughput=Math.min(10000,Math.floor(10000*perHour/benchmark.throughputTargetPerHour));
    const efficiency=ratio(benchmark.resourceBudgetUnits-r.resourceUnits,benchmark.resourceBudgetUnits);
    const scoreBps=Math.floor((30*r.qualityBps+25*throughput+15*reliability+15*resolution+10*r.interoperabilityBps+5*efficiency)/100);
    ranked.push({candidateId:r.candidateId,evidenceId:r.evidenceId,scoreBps,verifiedSuccessful:r.verifiedSuccessful,verifiedWorkPerHour:perHour,reliabilityBps:reliability,coordinationBps:r.coordinationBps});
  }
  ranked.sort((a,b)=>b.scoreBps-a.scoreBps||b.verifiedSuccessful-a.verifiedSuccessful||cmp(a.candidateId,b.candidateId));
  rejected.sort((a,b)=>cmp(a.candidateId,b.candidateId));
  const leader=[...ranked].sort((a,b)=>b.verifiedSuccessful-a.verifiedSuccessful||b.coordinationBps-a.coordinationBps||b.reliabilityBps-a.reliabilityBps||cmp(a.candidateId,b.candidateId))[0];
  return base(leader?'RANKED':'VACANT',ranked,rejected,leader?.candidateId??null);
}
// Prioritization does not claim a mission, open a new mission, or change a state.
// Caller must recheck the exact GEAS authorization, scope, budget and atomic lease.
export function prioritizeMissions(missions,nowMs){
  if(!time(nowMs)||!Array.isArray(missions)||missions.length>MAX_ROWS)return base('INVALID_QUEUE');
  const ids=new Set();for(const m of missions){if(!ownRecord(m,MISSION)||!id(m.missionId)||ids.has(m.missionId))return base('INVALID_QUEUE');ids.add(m.missionId);}
  const ranked=[],rejected=[];
  for(const m of missions){
    if(m.scopeVerified!==true||m.authorization!=='eligible'||m.status!=='queued'||m.dependencyReady!==true||m.needVerified!==true||m.costMicrousd!==0||!bps(m.impactBps)||!bps(m.urgencyBps)||!integer(m.maxAttempts,1,10)||!integer(m.attempts,0,m.maxAttempts-1)||!time(m.nextRunAt)||m.nextRunAt>nowMs){rejected.push({missionId:m.missionId,reason:'not-ready-or-authorized'});continue;}
    ranked.push({missionId:m.missionId,priorityBps:Math.floor((60*m.impactBps+40*m.urgencyBps)/100),attempts:m.attempts,nextRunAt:m.nextRunAt});
  }
  ranked.sort((a,b)=>b.priorityBps-a.priorityBps||a.attempts-b.attempts||a.nextRunAt-b.nextRunAt||cmp(a.missionId,b.missionId));
  rejected.sort((a,b)=>cmp(a.missionId,b.missionId));
  return base(ranked.length?'RANKED':'IDLE',ranked,rejected);
}
