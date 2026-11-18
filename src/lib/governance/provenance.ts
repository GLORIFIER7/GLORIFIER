import crypto from 'node:crypto';
import { getPostgresPool } from '../db/postgres';

export type ProvenanceEventType =
  | 'observation'
  | 'opportunity'
  | 'analysis'
  | 'decision'
  | 'authorization'
  | 'action'
  | 'external-result'
  | 'evidence'
  | 'verification'
  | 'economic-outcome'
  | 'trust-anchor';

export interface ProvenanceEvent {
  id: string;
  sequence: number;
  type: ProvenanceEventType;
  actorId: string;
  payload: Record<string, unknown>;
  sourceRef?: string;
  externalRef?: string;
  previousHash: string | null;
  eventHash: string;
  createdAt: string;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  const record = value as Record<string, unknown>;
  return '{' + Object.keys(record).sort((left, right) => left < right ? -1 : left > right ? 1 : 0).map(key => JSON.stringify(key) + ':' + canonicalize(record[key])).join(',') + '}';
}

function hashEvent(input: Omit<ProvenanceEvent, 'eventHash'>): string {
  return crypto.createHash('sha256').update(canonicalize(input)).digest('hex');
}

async function ensureTable() {
  await getPostgresPool().query(`
    CREATE TABLE IF NOT EXISTS glorifier_provenance_events (
      sequence BIGSERIAL PRIMARY KEY,
      id TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      payload JSONB NOT NULL,
      source_ref TEXT,
      external_ref TEXT,
      previous_hash TEXT,
      event_hash TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_glorifier_provenance_created_at
      ON glorifier_provenance_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_glorifier_provenance_type
      ON glorifier_provenance_events(event_type);
  `);
}

export async function appendProvenanceEvent(
  type: ProvenanceEventType,
  actorId: string,
  payload: Record<string, unknown>,
  options: { sourceRef?: string; externalRef?: string } = {}
): Promise<ProvenanceEvent> {
  const createdAt = new Date().toISOString();
  await ensureTable();

  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('glorifier:provenance-chain'))");
    const previous = await client.query(
      'SELECT sequence, event_hash FROM glorifier_provenance_events ORDER BY sequence DESC LIMIT 1'
    );
    const sequence = Number(previous.rows[0]?.sequence || 0) + 1;
    const previousHash = previous.rows[0]?.event_hash || null;
    const base = {
      id: 'pev-' + crypto.randomUUID(),
      sequence,
      type,
      actorId,
      payload,
      sourceRef: options.sourceRef,
      externalRef: options.externalRef,
      previousHash,
      createdAt
    };
    const eventHash = hashEvent(base);
    await client.query(
      `INSERT INTO glorifier_provenance_events
       (id,sequence,event_type,actor_id,payload,source_ref,external_ref,previous_hash,event_hash,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [base.id, base.sequence, base.type, base.actorId, JSON.stringify(base.payload),
       base.sourceRef || null, base.externalRef || null, base.previousHash, eventHash, base.createdAt]
    );
    await client.query('COMMIT');
    return { ...base, eventHash };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listProvenanceEvents(limit = 100): Promise<ProvenanceEvent[]> {
  await ensureTable();
  const result = await getPostgresPool().query(
    `SELECT id,sequence,event_type,actor_id,payload,source_ref,external_ref,previous_hash,event_hash,created_at
     FROM glorifier_provenance_events ORDER BY sequence DESC LIMIT $1`,
    [Math.min(Math.max(limit, 1), 1000)]
  );
  return result.rows.map(row => ({
    id: row.id,
    sequence: Number(row.sequence),
    type: row.event_type as ProvenanceEventType,
    actorId: row.actor_id,
    payload: row.payload || {},
    sourceRef: row.source_ref || undefined,
    externalRef: row.external_ref || undefined,
    previousHash: row.previous_hash || null,
    eventHash: row.event_hash,
    createdAt: new Date(row.created_at).toISOString()
  }));
}

export async function verifyProvenanceChain(limit = 1000) {
  const events = (await listProvenanceEvents(limit)).sort((a, b) => a.sequence - b.sequence);
  let previousHash: string | null = events[0]?.previousHash || null;
  const failures: Array<{ id: string; sequence: number; reason: string }> = [];
  for (const event of events) {
    const { eventHash, ...base } = event;
    const recalculated = hashEvent(base);
    if (event.previousHash !== previousHash) failures.push({ id: event.id, sequence: event.sequence, reason: 'previous_hash_mismatch' });
    if (eventHash !== recalculated) failures.push({ id: event.id, sequence: event.sequence, reason: 'event_hash_mismatch' });
    previousHash = eventHash;
  }
  return {
    ok: failures.length === 0,
    checked: events.length,
    failures,
    latestSequence: events.at(-1)?.sequence || 0,
    latestHash: events.at(-1)?.eventHash || null
  };
}

export async function getProvenanceArchitecture() {
  return {
    model: 'cryptographic-provenance',
    databaseAuthority: 'Neon',
    anchoring: 'optional-external-blockchain',
    privateDataOnChain: false,
    revenueTruth: 'external-evidence-plus-verification-policy',
    invariants: [
      'Blockchain is never the primary private-data store.',
      'Hashes prove record integrity, not factual truth by themselves.',
      'External blockchain transactions are trust anchors, not revenue proof.',
      'Verified revenue requires qualifying external payment evidence.',
      'Human authority remains required for irreversible external actions.',
      'Provider and network implementations remain replaceable through adapters.'
    ],
    capabilities: [
      'append-only hash chain',
      'tamper detection',
      'source and external reference provenance',
      'optional public timestamp anchoring',
      'audit-ready event history'
    ]
  };
}
