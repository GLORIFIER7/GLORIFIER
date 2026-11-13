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

export type FederatedA2AQuery = (
  sql: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

export interface FederatedA2APersistence {
  audit(
    taskId: string,
    state: FederatedA2ATaskState,
    actor: string,
    detail: unknown,
  ): Promise<string>;
  persist(task: FederatedA2ATask): Promise<void>;
}

const defaultFederatedA2APersistence: FederatedA2APersistence = { audit, persist };


function parseJsonValue(value: unknown, fallback: unknown): unknown {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function timestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value ?? ''));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function taskFromDatabaseRow(row: Record<string, unknown>): FederatedA2ATask {
  return {
    id: String(row.id),
    requesterAgentId: String(row.requester_agent_id),
    targetAgentId: row.target_agent_id == null ? null : String(row.target_agent_id),
    capability: String(row.capability),
    objective: String(row.objective),
    input: parseJsonValue(row.input, null),
    state: String(row.state) as FederatedA2ATaskState,
    attempt: Number(row.attempt ?? 0),
    maxAttempts: Number(row.max_attempts ?? 3),
    parentTaskId: row.parent_task_id == null ? null : String(row.parent_task_id),
    createdAt: timestamp(row.created_at),
    updatedAt: timestamp(row.updated_at),
    evidenceRefs: parseJsonValue(row.evidence_refs, []) as string[],
    auditRefs: parseJsonValue(row.audit_refs, []) as string[],
    ...(row.result == null ? {} : { result: parseJsonValue(row.result, null) }),
    ...(row.error == null ? {} : { error: String(row.error) }),
  };
}

const postgresFederatedA2AQuery: FederatedA2AQuery = async (sql, values = []) => {
  const result = await getPostgresPool().query(sql, values as any[]);
  return { rows: result.rows as Array<Record<string, unknown>> };
};

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
  await getPostgresPool().query(`INSERT INTO ${TASKS}(id,requester_agent_id,target_agent_id,capability,objective,input,state,attempt,max_attempts,parent_task_id,evidence_refs,audit_refs,result,error,created_at,updated_at)
  VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15,$16)
  ON CONFLICT(id) DO UPDATE SET target_agent_id=EXCLUDED.target_agent_id,state=EXCLUDED.state,attempt=EXCLUDED.attempt,evidence_refs=EXCLUDED.evidence_refs,audit_refs=EXCLUDED.audit_refs,result=EXCLUDED.result,error=EXCLUDED.error,updated_at=EXCLUDED.updated_at`,
  [task.id,task.requesterAgentId,task.targetAgentId,task.capability,task.objective,JSON.stringify(task.input??null),task.state,task.attempt,task.maxAttempts,task.parentTaskId,JSON.stringify(task.evidenceRefs),JSON.stringify(task.auditRefs),JSON.stringify(task.result??null),task.error??null,task.createdAt,task.updatedAt]);
  memory.set(task.id,task);
}
async function transitionFederatedA2ATask(
  task: FederatedA2ATask,
  state: FederatedA2ATaskState,
  actor: string,
  detail: unknown,
  updates: Partial<FederatedA2ATask> = {},
  persistence: FederatedA2APersistence = defaultFederatedA2APersistence,
): Promise<FederatedA2ATask> {
  const nextTask: FederatedA2ATask = {
    ...task,
    ...updates,
    state,
    updatedAt: new Date().toISOString(),
    evidenceRefs: [...(updates.evidenceRefs ?? task.evidenceRefs)],
    auditRefs: [...task.auditRefs],
  };
  const auditId = await persistence.audit(task.id, state, actor, detail);
  nextTask.auditRefs.push(auditId);
  await persistence.persist(nextTask);
  Object.assign(task, nextTask);
  memory.set(task.id, task);
  return task;
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
  const restored = await getPostgresPool().query(`SELECT * FROM ${TASKS} ORDER BY updated_at DESC LIMIT 500`);
  for (const row of restored.rows as Array<Record<string, unknown>>) {
    const task = taskFromDatabaseRow(row);
    memory.set(task.id, task);
  }
}
export function getFederatedA2AV3Policy(){
  return {architecture:'GLORIFIER_FEDERATED_A2A_V3',version:FEDERATED_A2A_V3_VERSION,lifecycle:FEDERATED_A2A_V3_LIFECYCLE,
    routing:'capability-first with governed fallback', signing:'HMAC-SHA256 signed task envelopes with expiry and nonce',
    evidence:'evidence-linked transitions; verification requires qualifying evidence',
    retries:'bounded attempts with deterministic capability candidates', settlement:'explicit verified state only; no autonomous financial settlement',
    humanAuthorityRemainsHighest:true, automaticFinancialTransfers:false, automaticIrreversibleProductionChanges:false,
    automaticCredentialRotation:false, truthBoundary:'Task execution, registration, or network presence never proves economic truth or external completion.'} as const;
}
export async function createFederatedA2ATask(
  input:{requesterAgentId:string;targetAgentId?:string;capability:string;objective:string;input?:unknown;parentTaskId?:string;maxAttempts?:number},
  persistTask?: (task:FederatedA2ATask) => Promise<void>,
): Promise<FederatedA2ATask> {
  const now=new Date().toISOString(), capability=input.capability.trim().toLowerCase();
  const task:FederatedA2ATask={id:'fa2a-'+crypto.randomUUID(),requesterAgentId:input.requesterAgentId,targetAgentId:input.targetAgentId||null,capability,objective:input.objective,input:input.input??null,state:'DISCOVERED',attempt:0,maxAttempts:Math.max(1,Math.min(5,input.maxAttempts||3)),parentTaskId:input.parentTaskId||null,createdAt:now,updatedAt:now,evidenceRefs:[],auditRefs:[]};
  if (persistTask) await persistTask(task);
  else if (process.env.DATABASE_URL) await persist(task);
  memory.set(task.id,task);
  return task;
}
export function getFederatedA2ATask(id:string){return memory.get(id)||null;}
export function listFederatedA2ATasks(limit=50, requesterAgentId?: string, allowAll = false){
  const requester = typeof requesterAgentId === 'string' ? requesterAgentId.trim() : undefined;
  if (requesterAgentId !== undefined && !requester) return [];
  if (!requester && !allowAll) return [];
  return [...memory.values()]
    .filter((task) => allowAll || task.requesterAgentId === requester)
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt))
    .slice(0,Math.min(100,Math.max(1,Number.isFinite(limit) ? Math.floor(limit) : 50)));
}
export async function listFederatedA2ATasksFromStore(
  limit = 50,
  requesterAgentId?: string,
  allowAll = false,
  query: FederatedA2AQuery = postgresFederatedA2AQuery,
): Promise<FederatedA2ATask[]> {
  const requester = typeof requesterAgentId === 'string' ? requesterAgentId.trim() : undefined;
  if (requesterAgentId !== undefined && !requester) return [];
  if (!requester && !allowAll) return [];
  const boundedLimit = Math.min(100, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 50));
  const result = await query(
    requester && !allowAll
      ? `SELECT * FROM ${TASKS} WHERE requester_agent_id = $1 ORDER BY created_at DESC LIMIT $2`
      : `SELECT * FROM ${TASKS} ORDER BY created_at DESC LIMIT $1`,
    requester && !allowAll ? [requester, boundedLimit] : [boundedLimit],
  );
  return result.rows.map(taskFromDatabaseRow);
}

export async function getFederatedA2ATaskFromStore(
  id: string,
  requesterAgentId?: string,
  allowAll = false,
  query: FederatedA2AQuery = postgresFederatedA2AQuery,
): Promise<FederatedA2ATask | null> {
  const requester = typeof requesterAgentId === 'string' ? requesterAgentId.trim() : undefined;
  if (requesterAgentId !== undefined && !requester) return null;
  if (!requester && !allowAll) return null;
  const result = await query(
    requester && !allowAll
      ? `SELECT * FROM ${TASKS} WHERE id = $1 AND requester_agent_id = $2 LIMIT 1`
      : `SELECT * FROM ${TASKS} WHERE id = $1 LIMIT 1`,
    requester && !allowAll ? [id, requester] : [id],
  );
  return result.rows[0] ? taskFromDatabaseRow(result.rows[0]) : null;
}

export async function authorizeFederatedA2ATask(taskId: string, actor: string, humanApproved = false) {
  const task = getFederatedA2ATask(taskId);
  if (!task) throw new Error('Federated A2A task not found');
  if (task.state !== 'DISCOVERED') {
    throw new Error('Only DISCOVERED tasks may be authorized');
  }
  const route = routeAgentCapability(task.capability);
  if (!route.governed) throw new Error('Capability is not governed');
  if (route.humanApprovalDefault && !humanApproved) throw new Error('Human approval required');
  return transitionFederatedA2ATask(task, 'AUTHORIZED', actor, { capability: task.capability });
}
export async function assignFederatedA2ATask(taskId: string, actor = 'glorifier-daemon') {
  const task = getFederatedA2ATask(taskId);
  if (!task) throw new Error('Federated A2A task not found');
  if (task.state !== 'AUTHORIZED') throw new Error('Task must be AUTHORIZED before ASSIGNED');
  const route = task.targetAgentId ? null : routeAgentCapability(task.capability);
  const targetAgentId = task.targetAgentId || route?.specialists[0] || route?.fallback || null;
  if (!targetAgentId) throw new Error('No eligible agent for capability');
  return transitionFederatedA2ATask(task, 'ASSIGNED', actor, { targetAgentId }, { targetAgentId });
}

export async function startFederatedA2ATask(
  taskId: string,
  actor = 'neural-agent',
  persistence: FederatedA2APersistence = defaultFederatedA2APersistence,
): Promise<FederatedA2ATask> {
  const task = getFederatedA2ATask(taskId);
  if (!task) throw new Error('Federated A2A task not found');
  if (task.state !== 'ASSIGNED' || !task.targetAgentId) {
    throw new Error('Task must be ASSIGNED before RUNNING');
  }
  return transitionFederatedA2ATask(
    task,
    'RUNNING',
    actor,
    { targetAgentId: task.targetAgentId },
    {},
    persistence,
  );
}
export const FEDERATED_A2A_ENVELOPE_MAX_TTL_SECONDS = 300;

export async function createFederatedA2AEnvelope(
  taskId: string,
  actor = 'glorifier-daemon',
  ttlSeconds = FEDERATED_A2A_ENVELOPE_MAX_TTL_SECONDS,
) {
  const task = getFederatedA2ATask(taskId);
  if (!task || !task.targetAgentId) throw new Error('Task must be assigned before handoff');
  if (!['ASSIGNED', 'RUNNING'].includes(task.state)) throw new Error('Task is not handoff-ready');
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > FEDERATED_A2A_ENVELOPE_MAX_TTL_SECONDS) {
    throw new Error('TTL must be an integer from 1 through 300 seconds');
  }
  const issued = new Date();
  const unsigned: Omit<FederatedA2AEnvelope, 'signature'> = {
    protocol: 'GLORIFIER-A2A-v3',
    version: '3',
    envelopeId: 'env-' + crypto.randomUUID(),
    taskId,
    fromAgentId: task.requesterAgentId,
    toAgentId: task.targetAgentId,
    capability: task.capability,
    objective: task.objective,
    payload: task.input,
    issuedAt: issued.toISOString(),
    expiresAt: new Date(issued.getTime() + ttlSeconds * 1000).toISOString(),
    nonce: crypto.randomBytes(18).toString('base64url'),
    signatureAlgorithm: 'HMAC-SHA256',
  };
  const envelope = { ...unsigned, signature: sign(unsigned) };
  await getPostgresPool().query(
    `INSERT INTO ${ENVELOPES}(envelope_id,task_id,from_agent_id,to_agent_id,envelope,created_at) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
    [envelope.envelopeId, task.id, envelope.fromAgentId, envelope.toAgentId, JSON.stringify(envelope), issued.toISOString()],
  );
  return envelope;
}
export function verifyFederatedA2AEnvelope(e:FederatedA2AEnvelope){
  try{if(!secret()) return {valid:false,reason:'signing_not_configured'}; if(new Date(e.expiresAt).getTime()<=Date.now()) return {valid:false,reason:'expired'}; const expected=sign(unsignedEnvelope(e)); const a=Buffer.from(e.signature),b=Buffer.from(expected); return a.length===b.length&&crypto.timingSafeEqual(a,b)?{valid:true,reason:'verified'}:{valid:false,reason:'invalid_signature'};}catch{return {valid:false,reason:'verification_error'};}
}
export async function markFederatedA2AEvidence(
  taskId: string,
  evidenceRef: string,
  actor = 'system',
  persistence: FederatedA2APersistence = defaultFederatedA2APersistence,
): Promise<FederatedA2ATask> {
  const task = getFederatedA2ATask(taskId);
  if (!task) throw new Error('Federated A2A task not found');
  if (!['RUNNING', 'EVIDENCE'].includes(task.state)) {
    throw new Error('Task is not accepting evidence');
  }
  const reference = evidenceRef.trim();
  if (!reference || reference.length > 2048 || /[\u0000-\u001f\u007f]/.test(reference)) {
    throw new Error('evidenceRef must be a non-empty, bounded reference without control characters');
  }
  if (task.evidenceRefs.includes(reference)) throw new Error('evidenceRef is already attached to this task');
  const evidenceRefs = [...task.evidenceRefs, reference];
  return transitionFederatedA2ATask(
    task,
    'EVIDENCE',
    actor,
    { evidenceRef: reference },
    { evidenceRefs },
    persistence,
  );
}
export interface FederatedA2AEvidenceVerification {
  status: 'VERIFIED' | 'NOT VERIFIED';
  source: string;
  evidenceRefs: string[];
  observedAt: string;
  verifier: string;
}

export type FederatedA2AEvidenceVerifier = (
  task: Readonly<FederatedA2ATask>,
) => Promise<FederatedA2AEvidenceVerification>;

export async function verifyFederatedA2ATask(
  taskId: string,
  actor = 'verifier',
  evidenceVerifier?: FederatedA2AEvidenceVerifier,
): Promise<FederatedA2ATask> {
  const task = getFederatedA2ATask(taskId);
  if (!task) throw new Error('Federated A2A task not found');
  if (task.state !== 'EVIDENCE' || task.evidenceRefs.length === 0) {
    throw new Error('Evidence must be attached before verification');
  }
  if (typeof evidenceVerifier !== 'function') {
    throw new Error('Independent evidence verifier is not configured');
  }

  let decision: FederatedA2AEvidenceVerification;
  try {
    decision = await evidenceVerifier(Object.freeze({
      ...task,
      evidenceRefs: [...task.evidenceRefs],
      auditRefs: [...task.auditRefs],
    }));
  } catch {
    throw new Error('Independent evidence verification is unavailable');
  }

  if (!decision || decision.status !== 'VERIFIED') {
    throw new Error('Independent evidence verifier did not confirm qualifying evidence');
  }
  const source = typeof decision.source === 'string' ? decision.source.trim() : '';
  const verifier = typeof decision.verifier === 'string' ? decision.verifier.trim() : '';
  const observedAt = typeof decision.observedAt === 'string' ? Date.parse(decision.observedAt) : NaN;
  const attachedEvidence = new Set(task.evidenceRefs);
  const verifiedEvidence = Array.isArray(decision.evidenceRefs)
    ? decision.evidenceRefs.filter((reference): reference is string => typeof reference === 'string')
    : [];
  if (
    !source ||
    !verifier ||
    !Number.isFinite(observedAt) ||
    observedAt > Date.now() ||
    verifiedEvidence.length === 0 ||
    new Set(verifiedEvidence).size !== verifiedEvidence.length ||
    verifiedEvidence.some((reference) => !attachedEvidence.has(reference)) ||
    verifier === task.requesterAgentId ||
    (task.targetAgentId !== null && verifier === task.targetAgentId)
  ) {
    throw new Error('Independent verification evidence references do not match the task');
  }

  return transitionFederatedA2ATask(
    task,
    'VERIFIED',
    actor,
    {
      evidenceRefs: verifiedEvidence,
      source,
      observedAt: new Date(observedAt).toISOString(),
      verifier,
    },
  );
}
export async function settleFederatedA2ATask(taskId: string, actor = 'human-owner') {
  const task = getFederatedA2ATask(taskId);
  if (!task) throw new Error('Federated A2A task not found');
  if (task.state !== 'VERIFIED') throw new Error('Only VERIFIED tasks may be SETTLED');
  return transitionFederatedA2ATask(task, 'SETTLED', actor, { settlement: 'non-financial lifecycle settlement' });
}
export async function failFederatedA2ATask(taskId: string, error: string, actor = 'runtime') {
  const task = getFederatedA2ATask(taskId);
  if (!task) throw new Error('Federated A2A task not found');
  if (['VERIFIED', 'SETTLED', 'FAILED'].includes(task.state)) {
    throw new Error('Terminal task cannot transition to FAILED');
  }
  const safeError = String(error).trim().slice(0, 2048);
  if (!safeError) throw new Error('Task failure reason is required');
  return transitionFederatedA2ATask(task, 'FAILED', actor, { error: safeError }, { error: safeError });
}
