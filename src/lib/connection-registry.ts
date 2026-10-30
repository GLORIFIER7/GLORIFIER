import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { persistConnectionApprovalAtomically, createMemoizedAsyncInitializer } from './connection-approval';

export type ConnectionAuthType = 'oauth2' | 'oidc' | 'api_key' | 'service_account' | 'webhook' | 'public';
export type ConnectionStatus = 'discovered' | 'pending_authorization' | 'authorized' | 'degraded' | 'revoked' | 'expired' | 'disabled';
export type ConnectionRisk = 'low' | 'medium' | 'high' | 'critical';

export interface ConnectionRecord {
  id: string;
  provider: string;
  displayName: string;
  authType: ConnectionAuthType;
  status: ConnectionStatus;
  scopes: string[];
  risk: ConnectionRisk;
  accountRef?: string | null;
  expiresAt?: string | null;
  lastVerifiedAt?: string | null;
  requiresHumanApproval: boolean;
  metadata: Record<string, unknown>;
}

const initializeConnectionRegistryOnce = createMemoizedAsyncInitializer(async () => {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS connection_registry (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      display_name TEXT NOT NULL,
      auth_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'discovered',
      scopes JSONB NOT NULL DEFAULT '[]',
      risk TEXT NOT NULL DEFAULT 'medium',
      account_ref TEXT,
      expires_at TIMESTAMPTZ,
      last_verified_at TIMESTAMPTZ,
      requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_connection_registry_provider ON connection_registry(provider);
    CREATE INDEX IF NOT EXISTS idx_connection_registry_status ON connection_registry(status);
    CREATE TABLE IF NOT EXISTS connection_events (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES connection_registry(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_connection_events_connection_time ON connection_events(connection_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS connection_approvals (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES connection_registry(id) ON DELETE CASCADE,
      requested_by TEXT NOT NULL,
      scope JSONB NOT NULL DEFAULT '[]',
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      related_task_id TEXT,
      decided_by TEXT,
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE connection_approvals ADD COLUMN IF NOT EXISTS related_task_id TEXT;
  `);
});

export function initializeConnectionRegistry(): Promise<void> {
  return initializeConnectionRegistryOnce();
}

export async function registerConnection(input: Omit<ConnectionRecord, 'id'> & { id?: string }) {
  await initializeConnectionRegistry();
  const id = input.id || `conn-${crypto.randomUUID()}`;
  const db = getPostgresPool();
  const r = await db.query(
    `INSERT INTO connection_registry
      (id,provider,display_name,auth_type,status,scopes,risk,account_ref,expires_at,last_verified_at,requires_human_approval,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT(id) DO UPDATE SET
       provider=EXCLUDED.provider, display_name=EXCLUDED.display_name, auth_type=EXCLUDED.auth_type,
       status=EXCLUDED.status, scopes=EXCLUDED.scopes, risk=EXCLUDED.risk, account_ref=EXCLUDED.account_ref,
       expires_at=EXCLUDED.expires_at, last_verified_at=EXCLUDED.last_verified_at,
       requires_human_approval=EXCLUDED.requires_human_approval, metadata=EXCLUDED.metadata, updated_at=NOW()
     RETURNING *`,
    [id,input.provider,input.displayName,input.authType,input.status,JSON.stringify(input.scopes),input.risk,input.accountRef||null,input.expiresAt||null,input.lastVerifiedAt||null,input.requiresHumanApproval,JSON.stringify(input.metadata||{})]
  );
  return mapConnection(r.rows[0]);
}

export async function listConnections(status?: ConnectionStatus) {
  await initializeConnectionRegistry();
  const db = getPostgresPool();
  const r = status
    ? await db.query('SELECT * FROM connection_registry WHERE status=$1 ORDER BY provider,display_name',[status])
    : await db.query('SELECT * FROM connection_registry ORDER BY provider,display_name');
  return r.rows.map(mapConnection);
}

export async function getConnection(id: string) {
  await initializeConnectionRegistry();
  const r = await getPostgresPool().query('SELECT * FROM connection_registry WHERE id=$1',[id]);
  return r.rows[0] ? mapConnection(r.rows[0]) : null;
}

export async function recordConnectionEvent(connectionId: string, eventType: string, actor: string, details: Record<string, unknown> = {}) {
  await initializeConnectionRegistry();
  const id = `ce-${crypto.randomUUID()}`;
  await getPostgresPool().query(
    'INSERT INTO connection_events(id,connection_id,event_type,actor,details) VALUES($1,$2,$3,$4,$5)',
    [id,connectionId,eventType,actor,JSON.stringify(details)]
  );
  return { id, connectionId, eventType, actor, details };
}

export async function requestConnectionApproval(
  connectionId: string,
  requestedBy: string,
  action: string,
  scope: string[],
  relatedTaskId?: string,
) {
  await initializeConnectionRegistry();
  const connection = await getConnection(connectionId);
  if (!connection) throw new Error('Connection not found');
  const db = getPostgresPool();
  return persistConnectionApprovalAtomically(
    (sql, values) => db.query(sql, values as any[]),
    {
      approvalId: `approval-${crypto.randomUUID()}`,
      eventId: `ce-${crypto.randomUUID()}`,
      connectionId,
      requestedBy,
      action,
      scope,
      relatedTaskId,
    },
  );
}

export async function verifyConnection(id: string, actor = 'connection-manager') {
  await initializeConnectionRegistry();
  const connection = await getConnection(id);
  if (!connection) return null;
  // This endpoint only reviews the registry record; no provider challenge or health check is performed.
  const status = connection.status;
  const r = await getPostgresPool().query(
    'UPDATE connection_registry SET status=$2,last_verified_at=NULL,updated_at=NOW() WHERE id=$1 RETURNING *',
    [id,status]
  );
  await recordConnectionEvent(id,'registry_record_reviewed',actor,{status,providerConnectivityTested:false,verified:false});
  return mapConnection(r.rows[0]);
}

function mapConnection(x: any): ConnectionRecord {
  return {
    id:x.id, provider:x.provider, displayName:x.display_name, authType:x.auth_type,
    status:x.status, scopes:x.scopes||[], risk:x.risk, accountRef:x.account_ref||null,
    expiresAt:x.expires_at ? new Date(x.expires_at).toISOString() : null,
    lastVerifiedAt:x.last_verified_at ? new Date(x.last_verified_at).toISOString() : null,
    requiresHumanApproval:Boolean(x.requires_human_approval), metadata:x.metadata||{}
  };
}
