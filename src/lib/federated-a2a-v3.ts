import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { routeAgentCapability } from './agent-runtime';

export const FEDERATED_A2A_V3_VERSION = 'G-A2A-TASK-3.0';
export const FEDERATED_A2A_V3_LIFECYCLE = ['DISCOVERED','AUTHORIZED','ASSIGNED','RUNNING','EVIDENCE','VERIFIED','SETTLED','FAILED'] as const;
export type FederatedA2ATaskState = typeof FEDERATED_A2A_V3_LIFECYCLE[number];

export interface FederatedA2ATask {
  id: string; requesterAgentId: string; targetAgentId: string | null; capability: string;
  objective: string; input: unknown; state: FederatedA2ATaskState; attempt: number;
  maxAttempts: number; parentTaskId: string | null; createdAt: string; updatedAt: string;
  evidenceRefs: string[]; auditRefs: string[]; result?: unknown; error?: string;
}

export interface FederatedA2AEnvelope {
  protocol: 'GLORIFIER-A2A-v3'; version: '3';
  envelopeId: string; taskId: string; fromAgentId: string; toAgentId: string;
  capability: string; objective: string; payload: unknown; issuedAt: string; expiresAt: string;
  nonce: string; signatureAlgorithm: 'HMAC-SHA256'; signature: string;
}

const TASKS='glorifier_federated_a2a_tasks';
const AUDIT='glorifier_federated_a2a_audit';
const ENVELOPES='glorifier_federated_a2a_envelopes';
const memory=new Map<string,FederatedA2ATask>();

function secret(){return String(process.env.GLORIFIER_A2A_SIGNING_SECRET||'').trim();}
function canonical(v:unknown){return JSON.stringify(v);}
function unsignedEnvelope(e: FederatedA2AEnvelope){const {signature:_,...u}=e; return u;}
function sign(e: Omit<FederatedA2AEnvelope,'signature'>){
  const s=secret(); if(!s) throw new Error('A2A signing is not configured');
  return crypto.createHmac('sha256',s).update(canonical(e)).digest('base64url');
}
async function audit(taskId:string, state:FederatedA2ATaskState, actor:string, detail:unknown){
  const id='audit-'+crypto.randomUUID(), now=new Date().toISOString();
  await getPostgresPool().query(`INSERT INTO ${AUDIT}(id,task_id,state,actor,detail,created_at) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,[id,taskId,state,actor,JSON.stringify(detail??{}),now]);
  return id;
}
async function persist(task:FederatedA2ATask){
  memory.set(task.id,task);
  await getPostgresPool().query(`INSERT INTO ${TASKS}(id,requester_agent_id,target_agent_id,capability,objective,input,state,attempt,max_attempts,parent_task_id,evidence_refs,audit_refs,result,error,created_at,updated_at)
  VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16)
  ON CONFLICT(id) DO UPDATE SET target_agent_id=EXCLUDED.target_agent_id,state=EXCLUDED.state,attempt=EXCLUDED.attempt,evidence_refs=EXCLUDED.evidence_refs,audit_refs=EXCLUDED.audit_refs,result=EXCLUDED.result,error=EXCLUDED.error,updated_at=EXCLUDED.updated_at`,
  [task.id,task.requesterAgentId,task.targetAgentId,task.capability,task.objective,JSON.stringify(task.input??null),task.state,task.attempt,task.maxAttempts,task.parentTaskId,JSON.stringify(task.evidenceRefs),JSON.stringify(task.auditRefs),JSON.stringify(task.result??null),task.error??null,task.createdAt,task.updatedAt]);
}
export async function initializeFederatedA2AV3(){
  await getPostgresPool().query(`CREATE TABLE IF NOT EXISTS ${TASKS}(
    id TEXT PRIMARY KEY, requester_agent_id TEXT NOT NULL, target_agent_id TEXT, capability TEXT NOT NULL, objective TEXT NOT NULL,
    input JSONB, state TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3,
    parent_task_id TEXT, evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb, audit_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    result JSONB, error TEXT, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_fa2a_tasks_state ON ${TASKS}(state,updated_at DESC);
    CREATE TABLE IF NOT EXISTS ${AUDIT}(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,state TEXT NOT NULL,actor TEXT NOT NULL,detail JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_fa2a_audit_task ON ${AUDIT}(task_id,created_at DESC);
    CREATE TABLE IF NOT EXISTS ${ENVELOPES}(envelope_id TEXT PRIMARY KEY,task_id TEXT NOT NULL,from_agent_id TEXT NOT NULL,to_agent_id TEXT NOT NULL,envelope JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL);
  `);
}
export function getFederatedA2AV3Policy(){
  return {architecture:'GLORIFIER_FEDERATED_A2A_V3',version:FEDERATED_A2A_V3_VERSION,lifecycle:FEDERATED_A2A_V3_LIFECYCLE,
    routing:'capability-first with governed fallback', signing:'HMAC-SHA256 signed task envelopes with expiry and nonce',
    evidence:'evidence-linked transitions; verification requires qualifying evidence',
    retries:'bounded attempts with deterministic capability candidates', settlement:'explicit verified state only; no autonomous financial settlement',
    humanAuthorityRemainsHighest:true, automaticFinancialTransfers:false, automaticIrreversibleProductionChanges:false,
    automaticCredentialRotation:false, truthBoundary:'Task execution, registration, or network presence never proves economic truth or external completion.'} as const;
}
export function createFederatedA2ATask(input:{requesterAgentId:string;targetAgentId?:string;capability:string;objective:string;input?:unknown;parentTaskId?:string;maxAttempts?:number}){
  const now=new Date().toISOString(), capability=input.capability.trim().toLowerCase();
  const task:FederatedA2ATask={id:'fa2a-'+crypto.randomUUID(),requesterAgentId:input.requesterAgentId,targetAgentId:input.targetAgentId||null,capability,objective:input.objective,input:input.input??null,state:'DISCOVERED',attempt:0,maxAttempts:Math.max(1,Math.min(5,input.maxAttempts||3)),parentTaskId:input.parentTaskId||null,createdAt:now,updatedAt:now,evidenceRefs:[],auditRefs:[]};
  memory.set(task.id,task); void persist(task).catch(()=>{});
  return task;
}
export function getFederatedA2ATask(id:string){return memory.get(id)||null;}
export function listFederatedA2ATasks(limit=50){return [...memory.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,Math.min(100,Math.max(1,limit)));}
export async function authorizeFederatedA2ATask(taskId:string,actor:string,humanApproved=false){
  const task=getFederatedA2ATask(taskId); if(!task) throw new Error('Federated A2A task not found');
  const route=routeAgentCapability(task.capability);
  if(!route.governed) throw new Error('Capability is not governed');
  if(route.humanApprovalDefault && !humanApproved) throw new Error('Human approval required');
  task.state='AUTHORIZED'; task.updatedAt=new Date().toISOString(); task.auditRefs.push(await audit(task.id,task.state,actor,{capability:task.capability})); await persist(task); return task;
}
export async function assignFederatedA2ATask(taskId:string,actor='glorifier-daemon'){
  const task=getFederatedA2ATask(taskId); if(!task) throw new Error('Federated A2A task not found');
  if(task.state!=='AUTHORIZED') throw new Error('Task must be AUTHORIZED before ASSIGNED');
  if(!task.targetAgentId){const route=routeAgentCapability(task.capability); task.targetAgentId=route.specialists[0]||route.fallback;}
  if(!task.targetAgentId) throw new Error('No eligible agent for capability');
  task.state='ASSIGNED'; task.updatedAt=new Date().toISOString(); task.auditRefs.push(await audit(task.id,task.state,actor,{targetAgentId:task.targetAgentId})); await persist(task); return task;
}
export async function createFederatedA2AEnvelope(taskId:string,actor='glorifier-daemon',ttlSeconds=300){
  const task=getFederatedA2ATask(taskId); if(!task||!task.targetAgentId) throw new Error('Task must be assigned before handoff');
  if(!['ASSIGNED','RUNNING'].includes(task.state)) throw new Error('Task is not handoff-ready');
  const issued=new Date(), u:Omit<FederatedA2AEnvelope,'signature'>={protocol:'GLORIFIER-A2A-v3',version:'3',envelopeId:'env-'+crypto.randomUUID(),taskId,fromAgentId:task.requesterAgentId,toAgentId:task.targetAgentId,capability:task.capability,objective:task.objective,payload:task.input,issuedAt:issued.toISOString(),expiresAt:new Date(issued.getTime()+ttlSeconds*1000).toISOString(),nonce:crypto.randomBytes(18).toString('base64url'),signatureAlgorithm:'HMAC-SHA256'};
  const envelope={...u,signature:sign(u)}; await getPostgresPool().query(`INSERT INTO ${ENVELOPES}(envelope_id,task_id,from_agent_id,to_agent_id,envelope,created_at) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,[envelope.envelopeId,task.id,envelope.fromAgentId,envelope.toAgentId,JSON.stringify(envelope),issued.toISOString()]); return envelope;
}
export function verifyFederatedA2AEnvelope(e:FederatedA2AEnvelope){
  try{if(!secret()) return {valid:false,reason:'signing_not_configured'}; if(new Date(e.expiresAt).getTime()<=Date.now()) return {valid:false,reason:'expired'}; const expected=sign(unsignedEnvelope(e)); const a=Buffer.from(e.signature),b=Buffer.from(expected); return a.length===b.length&&crypto.timingSafeEqual(a,b)?{valid:true,reason:'verified'}:{valid:false,reason:'invalid_signature'};}catch{return {valid:false,reason:'verification_error'};}
}
export async function markFederatedA2AEvidence(taskId:string,evidenceRef:string,actor='system'){
  const task=getFederatedA2ATask(taskId); if(!task) throw new Error('Federated A2A task not found');
  if(!['RUNNING','EVIDENCE'].includes(task.state)) throw new Error('Task is not accepting evidence');
  if(!evidenceRef.trim()) throw new Error('evidenceRef is required');
  task.evidenceRefs.push(evidenceRef); task.state='EVIDENCE'; task.updatedAt=new Date().toISOString(); task.auditRefs.push(await audit(task.id,task.state,actor,{evidenceRef})); await persist(task); return task;
}
export async function verifyFederatedA2ATask(taskId:string,qualifyingEvidence=true,actor='verifier'){
  const task=getFederatedA2ATask(taskId); if(!task) throw new Error('Federated A2A task not found');
  if(task.state!=='EVIDENCE'||task.evidenceRefs.length===0||!qualifyingEvidence) throw new Error('Qualifying evidence is required before VERIFIED');
  task.state='VERIFIED'; task.updatedAt=new Date().toISOString(); task.auditRefs.push(await audit(task.id,task.state,actor,{evidenceRefs:task.evidenceRefs})); await persist(task); return task;
}
export async function settleFederatedA2ATask(taskId:string,actor='human-owner'){
  const task=getFederatedA2ATask(taskId); if(!task) throw new Error('Federated A2A task not found');
  if(task.state!=='VERIFIED') throw new Error('Only VERIFIED tasks may be SETTLED');
  task.state='SETTLED'; task.updatedAt=new Date().toISOString(); task.auditRefs.push(await audit(task.id,task.state,actor,{settlement:'non-financial lifecycle settlement'})); await persist(task); return task;
}
export async function failFederatedA2ATask(taskId:string,error:string,actor='runtime'){
  const task=getFederatedA2ATask(taskId); if(!task) throw new Error('Federated A2A task not found');
  task.state='FAILED'; task.error=error; task.updatedAt=new Date().toISOString(); task.auditRefs.push(await audit(task.id,task.state,actor,{error})); await persist(task); return task;
}
