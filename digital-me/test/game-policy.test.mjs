import test from 'node:test';
import assert from 'node:assert/strict';
import { rankContributors, prioritizeMissions } from '../src/game-policy.mjs';

const now = Date.parse('2026-11-27T07:00:00Z');
const benchmark = { protocol:'game-v1', corpusSha:'a'.repeat(64), windowStart:now-3600000, windowEnd:now-60000,
  attempts:100, throughputTargetPerHour:100, resourceBudgetUnits:10000, minQualityBps:8000,
  minReliabilityBps:9000, minCoordinationBps:8000, minInteroperabilityBps:10000 };
const report = { candidateId:'provider-a/model-a', corpusSha:benchmark.corpusSha, protocol:benchmark.protocol,
  windowStart:benchmark.windowStart, windowEnd:benchmark.windowEnd, attempted:100, verifiedSuccessful:95,
  qualityBps:9500, coordinationBps:9500, resolved:95, interoperabilityBps:10000,
  resourceUnits:5000, costMicrousd:0, evidence:'VERIFIED', evidenceId:'independent-report-a',
  trust:'eligible', available:true };
const rank = (rows, policy=benchmark, time=now) => rankContributors(rows,policy,time);
const variant = (id, overrides={}) => ({...report,candidateId:id,evidenceId:'report-'+id,...overrides});

test('exactly measured score and throughput are separate, no authority granted',()=>{
  const r=rank([report]); assert.equal(r.status,'RANKED'); assert.equal(r.ranked[0].candidateId,report.candidateId);
  assert.equal(r.ranked[0].scoreBps,9365); assert.equal(r.ceoCandidate,report.candidateId); assert.equal(r.executionAuthorized,false);
});
test('CEO is highest eligible throughput even when composite score ranks another first',()=>{
  const faster=variant('fast',{verifiedSuccessful:96,resolved:70,qualityBps:8000,resourceUnits:10000});
  const stronger=variant('strong',{verifiedSuccessful:95,resolved:95,qualityBps:10000,resourceUnits:1000});
  const r=rank([faster,stronger]); assert.equal(r.ranked[0].candidateId,'strong'); assert.equal(r.ceoCandidate,'fast');
});
test('fast but unreliable, quarantined, unavailable or unverified candidates cannot win',()=>{
  const bad=[variant('unreliable',{verifiedSuccessful:89,resolved:89}),variant('quarantine',{trust:'quarantined'}),variant('offline',{available:false}),variant('unverified',{evidence:'PARTIALLY VERIFIED'}),variant('interop',{interoperabilityBps:9999}),variant('coordination',{coordinationBps:7999})];
  const r=rank([report,...bad]); assert.equal(r.ceoCandidate,report.candidateId); assert.equal(r.rejected.length,6);
});
test('incomparable windows, corpus or protocol are rejected',()=>{
  assert.equal(rank([variant('a',{windowStart:now-7200000}),variant('b',{corpusSha:'b'.repeat(64)}),variant('c',{protocol:'other'})]).status,'VACANT');
});
test('invalid policy and stale/future measurement windows fail closed',()=>{
  for (const p of [{...benchmark,attempts:0},{...benchmark,windowEnd:now+1},{...benchmark,throughputTargetPerHour:0}]) assert.equal(rank([report],p).status,'INVALID_BENCHMARK');
  assert.equal(rank([report],benchmark,now+86400000).status,'INVALID_BENCHMARK');
});
test('nonzero or unobserved spend, omitted failures and invalid measurements reject',()=>{
  const rows=[variant('spend',{costMicrousd:1}),variant('missing',{resourceUnits:null}),variant('omitted',{attempted:95}),variant('impossible',{verifiedSuccessful:101}),variant('over',{resourceUnits:10001}),variant('fake',{qualityBps:Infinity})];
  assert.equal(rank(rows).rejected.length,rows.length); assert.equal(rank(rows).status,'VACANT');
});
test('duplicate candidates and recycled evidence deny the cohort',()=>{
  assert.equal(rank([report,{...report}]).status,'INVALID_COHORT');
  assert.equal(rank([report,variant('b',{evidenceId:report.evidenceId})]).status,'INVALID_COHORT');
});
test('tie breaking is deterministic regardless of input order',()=>{
  const a=variant('a'),b=variant('b'); assert.deepEqual(rank([b,a]),rank([a,b])); assert.equal(rank([b,a]).ceoCandidate,'a');
});
test('no fabricated leader for empty cohort',()=>{assert.equal(rank([]).ceoCandidate,null);assert.equal(rank([]).status,'VACANT');});
const mission = { missionId:'m1', scopeVerified:true, authorization:'eligible', status:'queued', dependencyReady:true,
  needVerified:true, impactBps:8000, urgencyBps:9000, attempts:0, maxAttempts:3, nextRunAt:now-1, costMicrousd:0 };
test('mission rank is useful only for verified authorized ready zero-budget tasks',()=>{
  const r=prioritizeMissions([mission,{...mission,missionId:'m2',impactBps:2000}],now); assert.deepEqual(r.ranked.map(x=>x.missionId),['m1','m2']); assert.equal(r.executionAuthorized,false);
});
test('blocked, executing, delayed, unnecessary and unauthorized missions cannot be ranked',()=>{
  const variants=[{status:'blocked'},{status:'executing'},{dependencyReady:false},{scopeVerified:false},{authorization:'require_approval'},{needVerified:false},{attempts:3},{costMicrousd:1},{nextRunAt:now+1}];
  const r=prioritizeMissions(variants.map((x,i)=>({...mission,missionId:'m'+i,...x})),now); assert.equal(r.ranked.length,0); assert.equal(r.rejected.length,variants.length);
});
test('duplicate mission IDs reject the queue and do not amplify rewards',()=>{
  assert.equal(prioritizeMissions([mission,mission],now).status,'INVALID_QUEUE');
});
test('malformed or inherited fields fail closed',()=>{
  assert.equal(rank([Object.create(report)]).status,'INVALID_COHORT');
  assert.equal(prioritizeMissions([{...mission,extra:true}],now).status,'INVALID_QUEUE');
});
