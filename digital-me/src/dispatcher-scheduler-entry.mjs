import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {runSchedulerTick,quarantineExpired} from './dispatcher-scheduler-runtime.mjs';
import {createPublicationFence} from './dispatcher-publication-fence.mjs';
import {createReceiptPublisher} from './dispatcher-receipt-publisher.mjs';
import {withDispatcherApp} from './dispatcher-app-transport.mjs';
import {dispatchTick} from './mission-dispatcher.mjs';
import {prepareDispatcherCandidate,verifyDispatcherCandidate} from './dispatcher-repair-recipes.mjs';
import {createGithubEvidence,githubReadApi} from './dispatcher-github-evidence.mjs';
import {reconcileMergedMissions} from './dispatcher-merge-reconciliation.mjs';
import {createAttestedReadApi} from './dispatcher-ruleset-attestation.mjs';
import {WorkerAutopilotMissionStore} from '../../src/lib/autopilot-worker-store.ts';
import {createDispatcherAuthorization} from '../../src/lib/governance/digital-me-dispatcher-authority.ts';
import pg from 'pg';

const repo='GLORIFIER7/GLORIFIER',owner='github:32674233',role='digital_me_dispatcher_login',host='ep-wild-tree-b5yekavc.c-7.us-east-2.aws.neon.tech';
const root=fileURLToPath(new URL('../../',import.meta.url));
const deny=()=>{throw Error('DISPATCHER_RUNTIME_DENIED');};
const requireThat=v=>{if(!v)deny();};
function config(value){
  requireThat(typeof value==='string'&&value.length>0);
  const u=new URL(value);
  requireThat(['postgres:','postgresql:'].includes(u.protocol)&&u.hostname===host&&(!u.port||u.port==='5432')&&u.username===role&&u.password&&u.pathname==='/glorifier'&&!u.hash);
  requireThat([...u.searchParams.keys()].every(k=>['sslmode','channel_binding'].includes(k))&&u.searchParams.getAll('sslmode').length<=1&&u.searchParams.getAll('channel_binding').length<=1&&[null,'require','verify-full'].includes(u.searchParams.get('sslmode'))&&[null,'require','prefer'].includes(u.searchParams.get('channel_binding')));
  return {host,port:5432,database:'glorifier',user:role,password:decodeURIComponent(u.password),ssl:{rejectUnauthorized:true,servername:host},enableChannelBinding:true,connectionTimeoutMillis:10000,query_timeout:8000,statement_timeout:8000,application_name:'digital-me-dispatcher-scheduler'};
}
function clientFactory(options){
  const client=new pg.Client(options);
  return {async connect(){try{await client.connect();const stream=client.connection.stream;requireThat(stream.encrypted===true&&stream.authorized===true&&['TLSv1.2','TLSv1.3'].includes(stream.getProtocol()));const {rows:[r]}=await client.query('SELECT current_user AS role, session_user AS session_role, current_database() AS db');requireThat(r?.role===role&&r.session_role===role&&r.db==='glorifier');}catch{await client.end().catch(()=>{});deny();}},query:(sql,values)=>client.query(sql,values),end:()=>client.end()};
}
function scopedRead(factory){return async(sql,values)=>{
  const c=factory();await c.connect();try{await c.query('BEGIN READ ONLY');await c.query("SELECT set_config('glorifier.requester',$1,true),set_config('glorifier.allow_all','false',true)",[owner]);const r=await c.query(sql,values);await c.query('COMMIT');return r;}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{await c.end();}
};}
function checkoutSession(base){
  const git=(...args)=>execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null','-c','core.autocrlf=false',...args],{cwd:root,env:{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'},timeout:60000,stdio:['ignore','pipe','pipe']});
  requireThat(git('rev-parse','HEAD').toString().trim()===base);
  requireThat(git('status','--porcelain','--untracked-files=no').toString().trim()==='');
  return async fn=>{
    const temp=mkdtempSync(join(tmpdir(),'glorifier-dispatch-')),path=join(temp,'source');let added=false;
    try{git('worktree','add','--detach',path,base);added=true;return await fn(path);}finally{try{if(added)git('worktree','remove','--force',path);}finally{rmSync(temp,{recursive:true,force:true});}}
  };
}
async function main(env){
  if(env.DIGITAL_ME_DISPATCHER_ENABLED!=='true'||env.DIGITAL_ME_DISPATCHER_FREE_TIER_CONFIRMED!=='true'){console.log(JSON.stringify({status:'DISABLED',fullyVerified:false}));return;}
  requireThat(env.GITHUB_REPOSITORY===repo&&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_RUN_ATTEMPT==='1'&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA??'')&&/^\d+$/.test(env.GITHUB_RUN_ID??'')&&env.NODE_TLS_REJECT_UNAUTHORIZED!=='0');
  requireThat(env.GITHUB_EVENT_NAME==='schedule'||(env.GITHUB_EVENT_NAME==='workflow_dispatch'&&env.GITHUB_ACTOR_ID==='32674233'&&env.GITHUB_TRIGGERING_ACTOR==='GLORIFIER7'));
  const base=env.GITHUB_SHA,workerId='github-run-'+env.GITHUB_RUN_ID,db=env.DIGITAL_ME_DISPATCHER_DATABASE_URL,pem=env.DIGITAL_ME_APP_PRIVATE_KEY,token=env.GITHUB_TOKEN;
  delete env.DIGITAL_ME_DISPATCHER_DATABASE_URL;delete env.DIGITAL_ME_APP_PRIVATE_KEY;delete env.GITHUB_TOKEN;
  requireThat(typeof pem==='string'&&pem.length>0&&typeof token==='string'&&token.length>0);
  const encoded=env.DIGITAL_ME_RULESET_ATTESTATION;
  delete env.DIGITAL_ME_RULESET_ATTESTATION;
  requireThat(typeof encoded==='string'&&encoded.length>0&&encoded.length<=100000&&/^[A-Za-z0-9+/]+={0,2}$/.test(encoded));
  const attestation=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));
  const api=createAttestedReadApi({api:githubReadApi(token),attestation,sourceSha:base,runId:env.GITHUB_RUN_ID});
  const options=config(db),factory=()=>clientFactory(options),read=scopedRead(factory);
  const ledger=new WorkerAutopilotMissionStore({connectionString:db},{requester:owner,allowAll:false},factory);
  await ledger.initializeDispatcher();
  const getAuthorization=createDispatcherAuthorization({query:read});
  // Filter current-base grants before pagination; the existing admission parser
  // rejects malformed or stale objective text per mission without SQL casts. Bounded inventory
  // fails closed instead of silently starving newer eligible missions.
  const {rows:eligible}=await read(`SELECT payload FROM public.glorifier_autopilot_missions
    WHERE requester=$1 AND id ~ '^mission-coding-[a-f0-9]{64}$' AND status='blocked'
      AND payload->>'title'='GitHub fix #471' AND lease_owner IS NULL AND lease_expires_at IS NULL
      AND (payload->'dispatcher' IS NULL OR (payload->'dispatcher'->>'phase'='retryable' AND payload->'dispatcher'->>'attempts'='1'))
      AND public.read_digital_me_dispatcher_grant(id,$2)->>'recipeId'='dispatcher-receipt-limit'
    ORDER BY created_at,id LIMIT 101`,[owner,base]);
  requireThat(eligible.length<=100);
  const store={get:id=>ledger.get(id),save:(...args)=>ledger.save(...args),listCodingDispatchPage:async(requester,limit,cursor)=>{
    requireThat(requester===owner&&limit===100);
    if(cursor===null)return eligible.map(row=>row.payload);
    const index=eligible.findIndex(row=>row.payload.id===cursor.id&&row.payload.createdAt===cursor.createdAt);requireThat(index>=0);return eligible.slice(index+1).map(row=>row.payload);
  }};
  let manifest;
  const evidence=createGithubEvidence({api,resolveManifest:async fence=>{requireThat(manifest?.missionId===fence.missionId&&manifest.base===fence.base&&manifest.digest===fence.digest);return manifest;}});
  // Historical merge reconciliation is independent of current execution grants.
  const {rows:awaiting}=await read(`SELECT payload FROM public.glorifier_autopilot_missions
    WHERE requester=$1 AND id ~ '^mission-coding-[a-f0-9]{64}$' AND status='blocked'
      AND payload->>'title'='GitHub fix #471' AND lease_owner IS NULL AND lease_expires_at IS NULL
      AND payload->'dispatcher'->>'phase'='awaiting-review'
    ORDER BY created_at,id LIMIT 101`,[owner]);
  requireThat(awaiting.length<=100);
  const reconciliation=await reconcileMergedMissions({rows:awaiting.map(r=>r.payload),store,now:Date.now(),sourceSha:base,workerId,readMerge:evidence.readMergedReceipt});
  const assertFence=createPublicationFence({store,getAuthorization,readMain:evidence.readMain});
  const result=await runSchedulerTick({enabled:true,sourceSha:base,workerId,now:Date.now,store,readMain:evidence.readMain,getAuthorization,dispatchTick,
    recoverExpired:async()=>{const now=Date.now();const {rows}=await read(`SELECT payload FROM public.glorifier_autopilot_missions WHERE requester=$1 AND id ~ '^mission-coding-[a-f0-9]{64}$' AND payload->>'title'='GitHub fix #471' AND status='executing' AND lease_expires_at <= $2::timestamptz ORDER BY lease_expires_at,id LIMIT 101`,[owner,new Date(now).toISOString()]);return quarantineExpired({rows:rows.map(r=>r.payload),store,now});},
    withCheckout:checkoutSession(base),prepare:prepareDispatcherCandidate,verify:verifyDispatcherCandidate,
    publish:async(candidate,fence)=>{manifest=candidate;await assertFence(fence);return withDispatcherApp(pem,api=>createReceiptPublisher({api,assertFence})(candidate,fence));},
    readPublication:async(fence,written)=>{const deadline=Math.min(Date.now()+90000,Date.parse(fence.leaseExpiresAt)-20000);while(Date.now()<deadline){await assertFence(fence);try{return await evidence.readPublication(fence,written);}catch{const left=deadline-Date.now();if(left<=0)break;await pause(Math.min(5000,left));}}throw Error('DISPATCHER_PUBLICATION_RECONCILIATION_REQUIRED');}
  });
  console.log(JSON.stringify({sourceSha:base,eligibleMissions:eligible.length,reconciliation,...result}));
  if(result.status!=='TICK_COMPLETE'||result.results?.some(r=>r.status==='RECONCILIATION_REQUIRED'||r.status==='CANDIDATE_REJECTED'||r.status==='DENIED'))process.exitCode=1;
}
try{await main(process.env);}catch{console.error(JSON.stringify({status:'DISPATCHER_RUNTIME_DENIED',fullyVerified:false}));process.exitCode=1;}
