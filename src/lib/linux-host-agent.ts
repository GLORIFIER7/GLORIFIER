import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { getLinuxRuntime, initializeLinuxRuntimeRegistry, listLinuxRuntimes } from './linux-runtime';
import {
  isLinuxHostAgentAction,
  normalizeLinuxHostHeartbeat,
  normalizeLinuxHostTaskResult,
  parseLinuxHostAgentBearerToken,
  validateLinuxHostEnrollment,
} from './linux-host-agent-contract';

const TOKEN_BYTES = 32;
const TASK_LEASE_SECONDS = 45;
const TASK_TTL_SECONDS = 120;

async function initializeLinuxHostAgentTables(): Promise<void> {
  await initializeLinuxRuntimeRegistry();
  await getPostgresPool().query(`
    CREATE TABLE IF NOT EXISTS linux_agent_credentials (
      runtime_id TEXT PRIMARY KEY REFERENCES linux_runtime_registry(id) ON DELETE CASCADE,
      token_sha256 TEXT NOT NULL,
      issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS linux_agent_tasks (
      id TEXT PRIMARY KEY,
      runtime_id TEXT NOT NULL REFERENCES linux_runtime_registry(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      params JSONB NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'approved',
      requested_by TEXT NOT NULL,
      approved_by TEXT NOT NULL,
      approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      claimed_at TIMESTAMPTZ,
      lease_until TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL,
      result JSONB,
      result_sha256 TEXT,
      error_code TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_linux_agent_tasks_claim
      ON linux_agent_tasks(runtime_id, status, approved_at);
    CREATE INDEX IF NOT EXISTS idx_linux_agent_tasks_expiry
      ON linux_agent_tasks(status, expires_at);
  `);
}

export async function enrollLinuxHostAgent(input: unknown, actor: string): Promise<{
  runtimeId: string;
  token: string;
  allowedActions: string[];
}> {
  const validated = validateLinuxHostEnrollment(input);
  await initializeLinuxHostAgentTables();
  const db = getPostgresPool();
  const runtimeId = 'linux-' + randomUUID();
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const allowedActions = ['host.info', 'memory.info', 'disk.info'];
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO linux_runtime_registry
        (id, display_name, host_ref, runtime, status, architecture, capabilities,
         allowed_actions, risk, requires_human_approval, metadata)
       VALUES ($1, $2, $1, 'linux', 'authorized', $3, $4::jsonb, $5::jsonb, 'low', TRUE, $6::jsonb)`,
      [
        runtimeId,
        validated.displayName,
        validated.architecture,
        JSON.stringify(['heartbeat', 'task-polling', 'read-only-host-diagnostics']),
        JSON.stringify(allowedActions),
        JSON.stringify({ enrollment: 'owner-authorized', agentVersion: null }),
      ],
    );
    await client.query(
      'INSERT INTO linux_agent_credentials(runtime_id, token_sha256) VALUES ($1, $2)',
      [runtimeId, tokenHash],
    );
    await client.query(
      'INSERT INTO linux_runtime_events(id, runtime_id, event_type, actor, details) VALUES ($1, $2, $3, $4, $5::jsonb)',
      ['lre-' + randomUUID(), runtimeId, 'agent_enrolled', actor, JSON.stringify({ tokenMaterialStored: false, allowedActions })],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { runtimeId, token, allowedActions };
}

export async function authenticateLinuxHostAgent(runtimeId: string, authorizationHeader: string | undefined): Promise<boolean> {
  const token = parseLinuxHostAgentBearerToken(authorizationHeader);
  if (!token) return false;
  await initializeLinuxHostAgentTables();
  const credential = await getPostgresPool().query(
    `SELECT c.token_sha256
       FROM linux_agent_credentials c
       JOIN linux_runtime_registry r ON r.id = c.runtime_id
      WHERE c.runtime_id = $1 AND c.revoked_at IS NULL AND r.status <> 'revoked'`,
    [runtimeId],
  );
  const storedHash = credential.rows[0]?.token_sha256;
  if (typeof storedHash !== 'string' || !/^[a-f0-9]{64}$/.test(storedHash)) return false;
  const actual = createHash('sha256').update(token, 'utf8').digest();
  const expected = Buffer.from(storedHash, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  await getPostgresPool().query(
    'UPDATE linux_agent_credentials SET last_used_at = NOW() WHERE runtime_id = $1 AND revoked_at IS NULL',
    [runtimeId],
  );
  return true;
}

export async function recordLinuxHostAgentHeartbeat(runtimeId: string, input: unknown): Promise<{ ok: true; status: 'online'; lastVerifiedAt: string }> {
  const heartbeat = normalizeLinuxHostHeartbeat(input);
  await initializeLinuxHostAgentTables();
  const db = getPostgresPool();
  const metadata = {
    agentVersion: heartbeat.agentVersion,
    hostname: heartbeat.hostname,
    distribution: heartbeat.distribution,
    kernelRelease: heartbeat.kernelRelease,
    pythonVersion: heartbeat.pythonVersion,
  };
  const r = await db.query(
    `UPDATE linux_runtime_registry
        SET status = 'online', architecture = $2, last_verified_at = NOW(),
            metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb, updated_at = NOW()
      WHERE id = $1 AND status <> 'revoked'
      RETURNING last_verified_at`,
    [runtimeId, heartbeat.architecture, JSON.stringify(metadata)],
  );
  if (!r.rows[0]) throw new Error('Linux host is not enrolled or has been revoked');
  await db.query(
    'INSERT INTO linux_runtime_events(id, runtime_id, event_type, actor, details) VALUES ($1, $2, $3, $4, $5::jsonb)',
    ['lre-' + randomUUID(), runtimeId, 'agent_heartbeat', 'linux-host-agent', JSON.stringify({ architecture: heartbeat.architecture, distribution: heartbeat.distribution, agentVersion: heartbeat.agentVersion })],
  );
  return { ok: true, status: 'online', lastVerifiedAt: new Date(r.rows[0].last_verified_at).toISOString() };
}

export async function createLinuxHostAgentTask(runtimeId: string, action: unknown, actor: string): Promise<{ taskId: string; action: string; status: 'approved' }> {
  if (!isLinuxHostAgentAction(action)) throw new Error('Unsupported Linux host-agent action');
  await initializeLinuxHostAgentTables();
  const runtime = await getLinuxRuntime(runtimeId);
  if (!runtime || runtime.status === 'revoked') throw new Error('Linux host is not enrolled or has been revoked');
  if (runtime.status !== 'online') throw new Error('Linux host must be online before tasks can be issued');
  if (!runtime.allowedActions.includes(action)) throw new Error('Action is not authorized for this Linux host');
  const taskId = 'linux-task-' + randomUUID();
  await getPostgresPool().query(
    `INSERT INTO linux_agent_tasks
      (id, runtime_id, action, params, status, requested_by, approved_by, expires_at)
     VALUES ($1, $2, $3, '{}'::jsonb, 'approved', $4, $4, NOW() + ($5 * INTERVAL '1 second'))`,
    [taskId, runtimeId, action, actor, TASK_TTL_SECONDS],
  );
  await getPostgresPool().query(
    'INSERT INTO linux_runtime_events(id, runtime_id, event_type, actor, details) VALUES ($1, $2, $3, $4, $5::jsonb)',
    ['lre-' + randomUUID(), runtimeId, 'read_only_task_approved', actor, JSON.stringify({ taskId, action, approvalBoundary: 'owner-authenticated-route' })],
  );
  return { taskId, action, status: 'approved' };
}

export async function claimLinuxHostAgentTask(runtimeId: string): Promise<null | {
  taskId: string;
  action: string;
  params: Record<string, unknown>;
  leaseUntil: string;
}> {
  await initializeLinuxHostAgentTables();
  const db = getPostgresPool();
  await db.query(
    `UPDATE linux_agent_tasks
        SET status = 'expired'
      WHERE runtime_id = $1 AND status = 'approved' AND expires_at <= NOW()`,
    [runtimeId],
  );
  const r = await db.query(
    `UPDATE linux_agent_tasks
        SET status = 'claimed', claimed_at = NOW(),
            lease_until = NOW() + ($2 * INTERVAL '1 second')
      WHERE id = (
        SELECT id FROM linux_agent_tasks
         WHERE runtime_id = $1 AND status = 'approved' AND expires_at > NOW()
         ORDER BY approved_at, id
         LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING id, action, params, lease_until`,
    [runtimeId, TASK_LEASE_SECONDS],
  );
  const row = r.rows[0];
  if (!row) return null;
  await db.query(
    'INSERT INTO linux_runtime_events(id, runtime_id, event_type, actor, details) VALUES ($1, $2, $3, $4, $5::jsonb)',
    ['lre-' + randomUUID(), runtimeId, 'agent_task_claimed', 'linux-host-agent', JSON.stringify({ taskId: row.id, action: row.action })],
  );
  return {
    taskId: row.id,
    action: row.action,
    params: row.params || {},
    leaseUntil: new Date(row.lease_until).toISOString(),
  };
}

export async function completeLinuxHostAgentTask(runtimeId: string, taskId: string, input: unknown): Promise<{ taskId: string; status: 'succeeded' | 'failed' }> {
  const result = normalizeLinuxHostTaskResult(input);
  await initializeLinuxHostAgentTables();
  const encodedResult = JSON.stringify(result.result || {});
  const resultHash = createHash('sha256').update(encodedResult, 'utf8').digest('hex');
  const updated = await getPostgresPool().query(
    `UPDATE linux_agent_tasks
        SET status = $3, result = $4::jsonb, result_sha256 = $5,
            error_code = $6, completed_at = NOW()
      WHERE id = $1 AND runtime_id = $2 AND status = 'claimed' AND lease_until > NOW()
      RETURNING id, status`,
    [taskId, runtimeId, result.status, encodedResult, resultHash, result.errorCode || null],
  );
  if (!updated.rows[0]) throw new Error('Task is not claimed by this host or its lease has expired');
  await getPostgresPool().query(
    'INSERT INTO linux_runtime_events(id, runtime_id, event_type, actor, details) VALUES ($1, $2, $3, $4, $5::jsonb)',
    ['lre-' + randomUUID(), runtimeId, 'agent_task_completed', 'linux-host-agent', JSON.stringify({ taskId, status: result.status, resultSha256: resultHash })],
  );
  return { taskId, status: result.status };
}

export async function revokeLinuxHostAgent(runtimeId: string, actor: string): Promise<boolean> {
  await initializeLinuxHostAgentTables();
  const db = getPostgresPool();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE linux_runtime_registry SET status = 'revoked', updated_at = NOW()
        WHERE id = $1 AND status <> 'revoked' RETURNING id`,
      [runtimeId],
    );
    if (!updated.rows[0]) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      'UPDATE linux_agent_credentials SET revoked_at = NOW() WHERE runtime_id = $1 AND revoked_at IS NULL',
      [runtimeId],
    );
    await client.query(
      `UPDATE linux_agent_tasks SET status = 'revoked'
        WHERE runtime_id = $1 AND status IN ('approved', 'claimed')`,
      [runtimeId],
    );
    await client.query(
      'INSERT INTO linux_runtime_events(id, runtime_id, event_type, actor, details) VALUES ($1, $2, $3, $4, $5::jsonb)',
      ['lre-' + randomUUID(), runtimeId, 'agent_revoked', actor, JSON.stringify({ credentialsRevoked: true, pendingTasksCancelled: true })],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listLinuxHostAgents() {
  await initializeLinuxHostAgentTables();
  return listLinuxRuntimes();
}
