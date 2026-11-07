import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { initializeLinuxRuntimeRegistry, listLinuxRuntimes } from './linux-runtime';
import {
  isLinuxHostAgentAction,
  normalizeLinuxHostHeartbeat,
  normalizeLinuxHostTaskResult,
  canonicalizeLinuxHostAgentJson,
  parseLinuxHostAgentBearerToken,
  validateLinuxHostEnrollment,
  isSafeLinuxHostRuntimeId,
  isSafeLinuxHostTaskId,
} from './linux-host-agent-contract';

const TOKEN_BYTES = 32;
const TASK_LEASE_SECONDS = 45;
const TASK_TTL_SECONDS = 120;
const HEARTBEAT_FRESHNESS_SECONDS = 90;
let tableInitialization: Promise<void> | null = null;

async function initializeLinuxHostAgentTables(): Promise<void> {
  if (!tableInitialization) {
    tableInitialization = (async () => {
      await initializeLinuxRuntimeRegistry();
      const schema = [
        'CREATE TABLE IF NOT EXISTS linux_agent_credentials (',
        '  runtime_id TEXT PRIMARY KEY REFERENCES linux_runtime_registry(id) ON DELETE CASCADE,',
        '  token_sha256 TEXT NOT NULL CHECK (token_sha256 ~ \'^[a-f0-9]{64}$\'),',
        '  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),',
        '  last_used_at TIMESTAMPTZ,',
        '  revoked_at TIMESTAMPTZ',
        ');',
        'CREATE TABLE IF NOT EXISTS linux_agent_tasks (',
        '  id TEXT PRIMARY KEY,',
        '  runtime_id TEXT NOT NULL REFERENCES linux_runtime_registry(id) ON DELETE CASCADE,',
        '  action TEXT NOT NULL CHECK (action IN (\'host.info\', \'memory.info\', \'disk.info\')),',
        '  params JSONB NOT NULL DEFAULT \'{}\' CHECK (jsonb_typeof(params) = \'object\'),',
        '  status TEXT NOT NULL DEFAULT \'approved\' CHECK (status IN (\'approved\', \'claimed\', \'succeeded\', \'failed\', \'expired\', \'revoked\')),',
        '  requested_by TEXT NOT NULL,',
        '  approved_by TEXT NOT NULL,',
        '  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),',
        '  claimed_at TIMESTAMPTZ,',
        '  lease_until TIMESTAMPTZ,',
        '  completed_at TIMESTAMPTZ,',
        '  expires_at TIMESTAMPTZ NOT NULL,',
        '  result JSONB CHECK (result IS NULL OR jsonb_typeof(result) = \'object\'),',
        '  result_sha256 TEXT,',
        '  error_code TEXT CHECK (error_code IS NULL OR error_code IN (\'unsupported_action\', \'probe_failed\')),',
        '  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()',
        ');',
        'CREATE INDEX IF NOT EXISTS idx_linux_agent_tasks_claim ON linux_agent_tasks(runtime_id, status, approved_at);',
        'CREATE INDEX IF NOT EXISTS idx_linux_agent_tasks_expiry ON linux_agent_tasks(status, expires_at);',
      ].join('\n');
      await getPostgresPool().query(schema);
    })();
  }
  try {
    await tableInitialization;
  } catch (error) {
    tableInitialization = null;
    throw error;
  }
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
  if (!isSafeLinuxHostRuntimeId(runtimeId)) return false;
  const token = parseLinuxHostAgentBearerToken(authorizationHeader);
  if (!token) return false;
  await initializeLinuxHostAgentTables();
  const credential = await getPostgresPool().query(
    `SELECT c.token_sha256
       FROM linux_agent_credentials c
       JOIN linux_runtime_registry r ON r.id = c.runtime_id
      WHERE c.runtime_id = $1 AND c.revoked_at IS NULL AND r.status <> 'revoked'
      LIMIT 1`,
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
  if (!isSafeLinuxHostRuntimeId(runtimeId)) throw new Error('Invalid Linux runtime identifier');
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
  const observed = await db.query(
    `WITH prior AS (
       SELECT status FROM linux_runtime_registry WHERE id = $1 FOR UPDATE
     ),
     updated AS (
       UPDATE linux_runtime_registry
          SET status = 'online', architecture = $2, last_verified_at = NOW(),
              metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb, updated_at = NOW()
        WHERE id = $1 AND status <> 'revoked'
        RETURNING last_verified_at
     )
     SELECT prior.status AS prior_status, updated.last_verified_at
       FROM prior JOIN updated ON TRUE`,
    [runtimeId, heartbeat.architecture, JSON.stringify(metadata)],
  );
  const row = observed.rows[0];
  if (!row) throw new Error('Linux host is not enrolled or has been revoked');
  // Record state transitions only; the 15-second heartbeat itself is reflected
  // by last_verified_at and must not create an unbounded audit-event stream.
  if (row.prior_status !== 'online') {
    await db.query(
      'INSERT INTO linux_runtime_events(id, runtime_id, event_type, actor, details) VALUES ($1, $2, $3, $4, $5::jsonb)',
      ['lre-' + randomUUID(), runtimeId, 'agent_online', 'linux-host-agent', JSON.stringify({ architecture: heartbeat.architecture, distribution: heartbeat.distribution, agentVersion: heartbeat.agentVersion })],
    );
  }
  return { ok: true, status: 'online', lastVerifiedAt: new Date(row.last_verified_at).toISOString() };
}

export async function createLinuxHostAgentTask(runtimeId: string, action: unknown, actor: string): Promise<{ taskId: string; action: string; status: 'approved' }> {
  if (!isSafeLinuxHostRuntimeId(runtimeId)) throw new Error('Invalid Linux runtime identifier');
  if (!isLinuxHostAgentAction(action)) throw new Error('Unsupported Linux host-agent action');
  await initializeLinuxHostAgentTables();
  const db = getPostgresPool();
  const client = await db.connect();
  const taskId = 'linux-task-' + randomUUID();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT status, last_verified_at, allowed_actions
         FROM linux_runtime_registry
        WHERE id = $1
        FOR UPDATE`,
      [runtimeId],
    );
    const runtime = locked.rows[0];
    if (!runtime || runtime.status === 'revoked') throw new Error('Linux host is not enrolled or has been revoked');
    const lastVerifiedAt = runtime.last_verified_at ? new Date(runtime.last_verified_at).getTime() : 0;
    if (runtime.status !== 'online' || !lastVerifiedAt || Date.now() - lastVerifiedAt > HEARTBEAT_FRESHNESS_SECONDS * 1000) {
      throw new Error('Linux host must have a fresh heartbeat before tasks can be issued');
    }
    const allowedActions = Array.isArray(runtime.allowed_actions) ? runtime.allowed_actions : [];
    if (!allowedActions.includes(action)) throw new Error('Action is not authorized for this Linux host');
    await client.query(
      `INSERT INTO linux_agent_tasks
        (id, runtime_id, action, params, status, requested_by, approved_by, expires_at)
       VALUES ($1, $2, $3, '{}'::jsonb, 'approved', $4, $4, NOW() + ($5 * INTERVAL '1 second'))`,
      [taskId, runtimeId, action, actor, TASK_TTL_SECONDS],
    );
    await client.query(
      'INSERT INTO linux_runtime_events(id, runtime_id, event_type, actor, details) VALUES ($1, $2, $3, $4, $5::jsonb)',
      ['lre-' + randomUUID(), runtimeId, 'read_only_task_approved', actor, JSON.stringify({ taskId, action, approvalBoundary: 'owner-authenticated-route' })],
    );
    await client.query('COMMIT');
    return { taskId, action, status: 'approved' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function claimLinuxHostAgentTask(runtimeId: string): Promise<null | {
  taskId: string;
  action: string;
  params: Record<string, unknown>;
  leaseUntil: string;
}> {
  if (!isSafeLinuxHostRuntimeId(runtimeId)) throw new Error('Invalid Linux runtime identifier');
  await initializeLinuxHostAgentTables();
  const client = await getPostgresPool().connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      `SELECT status, last_verified_at
         FROM linux_runtime_registry
        WHERE id = $1
        FOR UPDATE`,
      [runtimeId],
    );
    const runtime = locked.rows[0];
    const lastVerifiedAt = runtime?.last_verified_at ? new Date(runtime.last_verified_at).getTime() : 0;
    if (!runtime || runtime.status !== 'online' || !lastVerifiedAt || Date.now() - lastVerifiedAt > HEARTBEAT_FRESHNESS_SECONDS * 1000) {
      throw new Error('Linux host heartbeat is stale or host is not online');
    }
    await client.query(
      `UPDATE linux_agent_tasks SET status = 'expired'
        WHERE runtime_id = $1 AND status = 'approved' AND expires_at <= NOW()`,
      [runtimeId],
    );
    await client.query(
      `UPDATE linux_agent_tasks SET status = 'expired'
        WHERE runtime_id = $1 AND status = 'claimed' AND lease_until <= NOW()`,
      [runtimeId],
    );
    const r = await client.query(
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
    if (!row) {
      await client.query('COMMIT');
      return null;
    }
    await client.query(
      'INSERT INTO linux_runtime_events(id, runtime_id, event_type, actor, details) VALUES ($1, $2, $3, $4, $5::jsonb)',
      ['lre-' + randomUUID(), runtimeId, 'agent_task_claimed', 'linux-host-agent', JSON.stringify({ taskId: row.id, action: row.action })],
    );
    await client.query('COMMIT');
    return {
      taskId: row.id,
      action: row.action,
      params: row.params || {},
      leaseUntil: new Date(row.lease_until).toISOString(),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function completeLinuxHostAgentTask(runtimeId: string, taskId: string, input: unknown): Promise<{ taskId: string; status: 'succeeded' | 'failed' }> {
  if (!isSafeLinuxHostRuntimeId(runtimeId)) throw new Error('Invalid Linux runtime identifier');
  if (!isSafeLinuxHostTaskId(taskId)) throw new Error('Invalid Linux task identifier');
  const result = normalizeLinuxHostTaskResult(input);
  await initializeLinuxHostAgentTables();
  const encodedResult = canonicalizeLinuxHostAgentJson(result.result || {});
  const resultHash = createHash('sha256').update(encodedResult, 'utf8').digest('hex');
  const client = await getPostgresPool().connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE linux_agent_tasks
          SET status = $3, result = $4::jsonb, result_sha256 = $5,
              error_code = $6, completed_at = NOW()
        WHERE id = $1 AND runtime_id = $2 AND status = 'claimed' AND lease_until > NOW()
        RETURNING id, status`,
      [taskId, runtimeId, result.status, encodedResult, resultHash, result.errorCode || null],
    );
    if (!updated.rows[0]) throw new Error('Task is not claimed by this host or its lease has expired');
    await client.query(
      'INSERT INTO linux_runtime_events(id, runtime_id, event_type, actor, details) VALUES ($1, $2, $3, $4, $5::jsonb)',
      ['lre-' + randomUUID(), runtimeId, 'agent_task_completed', 'linux-host-agent', JSON.stringify({ taskId, status: result.status, resultSha256: resultHash, resultHashEncoding: 'canonical-json-v1' })],
    );
    await client.query('COMMIT');
    return { taskId, status: result.status };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeLinuxHostAgent(runtimeId: string, actor: string): Promise<boolean> {
  if (!isSafeLinuxHostRuntimeId(runtimeId)) throw new Error('Invalid Linux runtime identifier');
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

export async function listLinuxHostAgentTasks(runtimeId: string) {
  if (!isSafeLinuxHostRuntimeId(runtimeId)) throw new Error('Invalid Linux runtime identifier');
  await initializeLinuxHostAgentTables();
  const r = await getPostgresPool().query(
    `SELECT id, action, status, requested_by, approved_by, approved_at, claimed_at,
            lease_until, completed_at, expires_at, result, result_sha256, error_code
       FROM linux_agent_tasks
      WHERE runtime_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [runtimeId],
  );
  return r.rows;
}

export async function listLinuxHostAgents() {
  await initializeLinuxHostAgentTables();
  await getPostgresPool().query(
    `UPDATE linux_runtime_registry
        SET status = 'offline', updated_at = NOW()
      WHERE status = 'online'
        AND last_verified_at < NOW() - ($1 * INTERVAL '1 second')`,
    [HEARTBEAT_FRESHNESS_SECONDS],
  );
  return listLinuxRuntimes();
}
