/**
 * Opt-in long-term memory store. This module provides persistence primitives,
 * not authorization, automatic agent recall, evidence certification, or action execution.
 * An authenticated, tenant-authorized caller must supply the namespace identifiers.
 */
export type MemoryCategory = 'identity' | 'fact' | 'decision' | 'episode';
export type MemoryStatus = 'NOT VERIFIED';

export interface MemoryInput {
  tenantId: string;
  subjectId: string;
  memoryKey: string;
  category: MemoryCategory;
  content: string;
  sourceRef: string;
}

export interface MemoryRecord extends MemoryInput {
  status: MemoryStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount?: number | null;
}

export type MemoryQuery = (
  sql: string,
  values?: unknown[],
) => Promise<MemoryQueryResult>;

const memoryColumns = `tenant_id AS "tenantId", subject_id AS "subjectId",
  memory_key AS "memoryKey", category, content,
  source_ref AS "sourceRef", status, version,
  created_at AS "createdAt", updated_at AS "updatedAt"`;

const maxContentBytes = 8192;
const maxSourceBytes = 1024;
const maxSearchCandidates = 500;
const categories: ReadonlySet<string> = new Set(['identity', 'fact', 'decision', 'episode']);

function validateIdentifier(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)) {
    throw new Error(`invalid ${label}: expected 1-128 safe identifier characters`);
  }
}

function validateText(value: unknown, label: string, maxBytes: number): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (Buffer.byteLength(value, 'utf8') > maxBytes || value.includes('\0')) {
    throw new Error(`${label} exceeds its size limit or contains NUL`);
  }
}

function validateInput(input: MemoryInput): void {
  validateIdentifier(input.tenantId, 'tenantId');
  validateIdentifier(input.subjectId, 'subjectId');
  validateIdentifier(input.memoryKey, 'memoryKey');
  if (!categories.has(input.category)) throw new Error('invalid memory category');
  validateText(input.content, 'content', maxContentBytes);
  validateText(input.sourceRef, 'sourceRef', maxSourceBytes);
}

function validateVersion(version: number): void {
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error('expectedVersion must be a positive safe integer');
  }
}

function validateLimit(limit: number): number {
  if (!Number.isFinite(limit)) throw new Error('limit must be a finite number');
  return Math.max(1, Math.min(100, Math.trunc(limit)));
}

function normalizeRecord(raw: Record<string, unknown>): MemoryRecord {
  const timestamp = (v: unknown): string => v instanceof Date ? v.toISOString() : String(v);
  return {
    tenantId: String(raw.tenantId),
    subjectId: String(raw.subjectId),
    memoryKey: String(raw.memoryKey),
    category: raw.category as MemoryCategory,
    content: String(raw.content),
    sourceRef: String(raw.sourceRef),
    status: raw.status as MemoryStatus,
    version: Number(raw.version),
    createdAt: timestamp(raw.createdAt),
    updatedAt: timestamp(raw.updatedAt),
  };
}

export class PostgresLongTermMemoryStore {
  constructor(private readonly query: MemoryQuery) {}

  async initialize(): Promise<void> {
    await this.query(`CREATE TABLE IF NOT EXISTS glorifier_long_term_memory (
      tenant_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      memory_key TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('identity','fact','decision','episode')),
      content TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NOT VERIFIED' CHECK (status = 'NOT VERIFIED'),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, subject_id, memory_key)
    )`);
    await this.query(`CREATE INDEX IF NOT EXISTS idx_glorifier_memory_scope_recency_v1
      ON glorifier_long_term_memory (tenant_id, subject_id, updated_at DESC, memory_key ASC)`);
  }

  /** Create only: concurrent duplicate inserts do not overwrite existing records. */
  async create(input: MemoryInput): Promise<MemoryRecord | null> {
    validateInput(input);
    const result = await this.query(`INSERT INTO glorifier_long_term_memory (
      tenant_id, subject_id, memory_key, content, source_ref, category, status, version
    ) VALUES ($1, $2, $3, $4, $5, $6, 'NOT VERIFIED', 1)
    ON CONFLICT (tenant_id, subject_id, memory_key) DO NOTHING
    RETURNING ${memoryColumns}`, [
      input.tenantId, input.subjectId, input.memoryKey, input.content, input.sourceRef, input.category,
    ]);
    return result.rows[0] ? normalizeRecord(result.rows[0]) : null;
  }

  /** Compare-and-swap replacement; updating content always resets verification state. */
  async replace(input: MemoryInput, expectedVersion: number): Promise<MemoryRecord | null> {
    validateInput(input);
    validateVersion(expectedVersion);
    const result = await this.query(`UPDATE glorifier_long_term_memory
      SET content = $4, source_ref = $5, category = $6,
          status = 'NOT VERIFIED', version = version + 1, updated_at = NOW()
      WHERE tenant_id = $1 AND subject_id = $2 AND memory_key = $3 AND version = $7
      RETURNING ${memoryColumns}`, [
      input.tenantId, input.subjectId, input.memoryKey, input.content, input.sourceRef,
      input.category, expectedVersion,
    ]);
    return result.rows[0] ? normalizeRecord(result.rows[0]) : null;
  }

  async get(tenantId: string, subjectId: string, memoryKey: string): Promise<MemoryRecord | null> {
    validateIdentifier(tenantId, 'tenantId');
    validateIdentifier(subjectId, 'subjectId');
    validateIdentifier(memoryKey, 'memoryKey');
    const result = await this.query(`SELECT ${memoryColumns}
      FROM glorifier_long_term_memory
      WHERE tenant_id = $1 AND subject_id = $2 AND memory_key = $3
      LIMIT 1`, [tenantId, subjectId, memoryKey]);
    return result.rows[0] ? normalizeRecord(result.rows[0]) : null;
  }

  async list(tenantId: string, subjectId: string, limit = 25): Promise<MemoryRecord[]> {
    validateIdentifier(tenantId, 'tenantId');
    validateIdentifier(subjectId, 'subjectId');
    const bounded = validateLimit(limit);
    const result = await this.query(`SELECT ${memoryColumns}
      FROM glorifier_long_term_memory
      WHERE tenant_id = $1 AND subject_id = $2
      ORDER BY updated_at DESC, memory_key ASC LIMIT $3`, [tenantId, subjectId, bounded]);
    return result.rows.map(normalizeRecord);
  }

  /** Literal substring search over the 500 most recent scoped records only.
   * MATERIALIZED limits content scanning *before* filtering the text; use get()
   * for complete key-based historical retrieval. No wildcard/embedding semantics.
   */
  async search(tenantId: string, subjectId: string, query: string, limit = 25): Promise<MemoryRecord[]> {
    validateIdentifier(tenantId, 'tenantId');
    validateIdentifier(subjectId, 'subjectId');
    validateText(query, 'query', 256);
    const bounded = validateLimit(limit);
    const result = await this.query(`WITH candidates AS MATERIALIZED (
        SELECT * FROM glorifier_long_term_memory
        WHERE tenant_id = $1 AND subject_id = $2
        ORDER BY updated_at DESC, memory_key ASC LIMIT ${maxSearchCandidates}
      )
      SELECT ${memoryColumns} FROM candidates
      WHERE position(lower($3) in lower(content)) > 0
      ORDER BY updated_at DESC, memory_key ASC LIMIT $4`, [tenantId, subjectId, query, bounded]);
    return result.rows.map(normalizeRecord);
  }

  /** Hard-delete the active record; retained backups require independent deletion handling. */
  async delete(tenantId: string, subjectId: string, memoryKey: string, expectedVersion: number): Promise<boolean> {
    validateIdentifier(tenantId, 'tenantId');
    validateIdentifier(subjectId, 'subjectId');
    validateIdentifier(memoryKey, 'memoryKey');
    validateVersion(expectedVersion);
    const result = await this.query(`DELETE FROM glorifier_long_term_memory
      WHERE tenant_id = $1 AND subject_id = $2 AND memory_key = $3 AND version = $4
      RETURNING memory_key AS "memoryKey"`, [tenantId, subjectId, memoryKey, expectedVersion]);
    return result.rows.length > 0;
  }
}

/** JSON wire-format validator for opt-in cross-language import/export. */
export function parsePortableMemoryRecord(value: unknown): MemoryRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid memory record object');
  }
  const record = value as Record<string, unknown>;
  const required = [
    'tenantId', 'subjectId', 'memoryKey', 'category', 'content', 'sourceRef',
    'status', 'version', 'createdAt', 'updatedAt',
  ];
  if (Object.keys(record).length !== required.length || required.some(key => !Object.hasOwn(record, key))) {
    throw new Error('invalid memory record fields');
  }
  const input: MemoryInput = {
    tenantId: record.tenantId as string,
    subjectId: record.subjectId as string,
    memoryKey: record.memoryKey as string,
    category: record.category as MemoryCategory,
    content: record.content as string,
    sourceRef: record.sourceRef as string,
  };
  validateInput(input);
  if (record.status !== 'NOT VERIFIED') throw new Error('invalid memory evidence status');
  validateVersion(record.version as number);
  for (const field of ['createdAt', 'updatedAt'] as const) {
    const timestamp = record[field];
    if (typeof timestamp !== 'string' || timestamp.startsWith('0000-') ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) ||
        !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
      throw new Error(`invalid ${field} timestamp`);
    }
  }
  return value as MemoryRecord;
}
