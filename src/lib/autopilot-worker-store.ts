import { Client } from 'pg';
import type { AutopilotMission, AutopilotMissionStore } from './autopilot-mission-control';
import type { WorkerNeonBinding } from './app-state-worker';

export type WorkerAutopilotMissionAccess = {
  requester: string;
  allowAll?: boolean;
  source?: 'owner' | 'internal-service';
};

export type WorkerAutopilotPgClient = {
  connect(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{
    rows: Array<Record<string, unknown>>;
    rowCount?: number | null;
  }>;
  end(): Promise<void>;
};

export type WorkerAutopilotPgClientFactory = (
  connectionString: string,
  options: { connectionTimeoutMillis: number; query_timeout: number },
) => WorkerAutopilotPgClient;

const CLIENT_OPTIONS = Object.freeze({
  connectionTimeoutMillis: 10_000,
  query_timeout: 8_000,
});

const defaultClientFactory: WorkerAutopilotPgClientFactory = (connectionString, options) =>
  new Client({ connectionString, ...options }) as unknown as WorkerAutopilotPgClient;

const TABLE_NAME = 'public.glorifier_autopilot_missions';
const INTERNAL_SERVICE_REQUESTER = 'glorifier-internal-service';

export class WorkerAutopilotSchemaNotReadyError extends Error {
  readonly code = 'AUTOPILOT_MISSION_SCHEMA_NOT_READY';

  constructor(message = 'The Neon Autopilot mission table or its least-privilege grants are not provisioned.') {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'WorkerAutopilotSchemaNotReadyError';
  }
}

function parseMission(value: unknown): AutopilotMission {
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Stored Autopilot mission payload is invalid.');
  }

  const mission = parsed as AutopilotMission;
  if (typeof mission.id !== 'string' || typeof mission.requester !== 'string' ||
      typeof mission.idempotencyKey !== 'string' || typeof mission.status !== 'string') {
    throw new Error('Stored Autopilot mission payload is missing required identity fields.');
  }
  if (!mission.verificationState) {
    mission.verificationState = mission.status === 'completed' ? 'pending-external-evidence' : 'not-started';
  }
  if (!Number.isSafeInteger(mission.recoveryAttempts)) mission.recoveryAttempts = 0;
  if (!Number.isSafeInteger(mission.planningAttempts)) mission.planningAttempts = 0;
  mission.steps = Array.isArray(mission.steps)
    ? mission.steps.map(step => ({
        ...step,
        attemptCount: Number.isSafeInteger(step.attemptCount) ? step.attemptCount : 0,
      }))
    : [];
  mission.evidenceRefs = Array.isArray(mission.evidenceRefs) ? mission.evidenceRefs : [];
  return mission;
}

/**
 * Cloudflare Worker adapter for the durable Autopilot mission table.
 *
 * The Worker uses APP_STATE_HYPERDRIVE, whose database role is explicitly
 * granted SELECT/INSERT/UPDATE on this table by the reviewed Neon migration.
 * Every operation runs in one short transaction and sets transaction-local
 * requester context consumed by PostgreSQL RLS. This adapter never runs DDL.
 */
export class WorkerAutopilotMissionStore implements AutopilotMissionStore {
  private readonly requester: string;
  private readonly allowAll: boolean;
  private readonly source?: 'owner' | 'internal-service';

  constructor(
    private readonly binding: WorkerNeonBinding,
    access: WorkerAutopilotMissionAccess,
    private readonly factory: WorkerAutopilotPgClientFactory = defaultClientFactory,
  ) {
    const requester = typeof access?.requester === 'string' ? access.requester.trim() : '';
    if (!requester || requester.length > 256) {
      throw new Error('A verified Autopilot requester identity is required.');
    }
    this.requester = requester;
    this.allowAll = access.allowAll === true;
    this.source = access.source;
    if (this.source === 'internal-service' &&
        (this.allowAll || this.requester !== INTERNAL_SERVICE_REQUESTER)) {
      throw new Error('Internal-service access must use the fixed requester partition with allowAll=false.');
    }
    const connectionString = typeof binding?.connectionString === 'string' ? binding.connectionString.trim() : '';
    if (!connectionString || !/^postgres(?:ql)?:\/\//i.test(connectionString)) {
      throw new Error('A valid Neon Hyperdrive connection string is required.');
    }
  }

  private async withTransaction<T>(
    operation: (client: WorkerAutopilotPgClient) => Promise<T>,
    readOnly = false,
  ): Promise<T> {
    const connectionString = this.binding.connectionString.trim();
    const client = this.factory(connectionString, CLIENT_OPTIONS);
    let connected = false;
    let transactionStarted = false;
    try {
      await client.connect();
      connected = true;
      await client.query(readOnly ? 'BEGIN READ ONLY' : 'BEGIN');
      transactionStarted = true;
      await client.query(
        `SELECT
           set_config('glorifier.requester', $1, true),
           set_config('glorifier.allow_all', $2, true)`,
        [this.requester, String(this.allowAll)],
      );
      const result = await operation(client);
      await client.query('COMMIT');
      transactionStarted = false;
      return result;
    } catch (error) {
      if (connected && transactionStarted) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      throw error;
    } finally {
      if (connected) await client.end();
    }
  }

  private requireElevatedAccess(operation: string): void {
    const ownerAccess = this.allowAll && this.source !== 'internal-service';
    const scopedInternalServiceAccess = !this.allowAll &&
      this.source === 'internal-service' &&
      this.requester === INTERNAL_SERVICE_REQUESTER;
    if (!ownerAccess && !scopedInternalServiceAccess) {
      throw new Error(`An owner or scoped internal-service context is required for Autopilot ${operation}.`);
    }
  }

  private requireOwnRequester(requester: string, operation: string): string {
    const normalized = typeof requester === 'string' ? requester.trim() : '';
    if (!normalized || normalized !== this.requester) {
      throw new Error(`Autopilot ${operation} must use the verified requester context.`);
    }
    return normalized;
  }

  async initialize(): Promise<void> {
    await this.withTransaction(async client => {
      const result = await client.query(
        `SELECT
           to_regclass('${TABLE_NAME}')::text AS table_name,
           has_table_privilege(current_user, '${TABLE_NAME}', 'SELECT') AS can_select,
           has_table_privilege(current_user, '${TABLE_NAME}', 'INSERT') AS can_insert,
           has_table_privilege(current_user, '${TABLE_NAME}', 'UPDATE') AS can_update`,
      );
      const row = result.rows[0] ?? {};
      if (!row.table_name || row.can_select !== true || row.can_insert !== true || row.can_update !== true) {
        throw new WorkerAutopilotSchemaNotReadyError();
      }
    }, true);
  }

  /** Readiness for the dedicated coding dispatcher; it must not create missions. */
  async initializeDispatcher(): Promise<void> {
    if (this.requester !== 'github:32674233' || this.allowAll || this.source === 'internal-service') {
      throw new Error('Dispatcher readiness requires the fixed owner requester partition.');
    }
    await this.withTransaction(async client => {
      const result = await client.query(
        `SELECT
           to_regclass('${TABLE_NAME}')::text AS table_name,
           pg_has_role(current_user, 'digital_me_dispatcher', 'USAGE') AS dispatcher_member,
           row_security_active('${TABLE_NAME}') AS scoped_rls,
           has_table_privilege(current_user, '${TABLE_NAME}', 'SELECT') AS can_select,
           (SELECT bool_and(has_column_privilege(current_user, '${TABLE_NAME}', col, 'UPDATE'))
              FROM unnest(ARRAY['status','version','payload','next_run_at','lease_owner','lease_expires_at','updated_at']) AS fields(col)) AS can_update,
           has_any_column_privilege(current_user, '${TABLE_NAME}', 'id,requester,idempotency_key,created_at', 'UPDATE') AS can_update_identity,
           has_function_privilege(current_user, 'public.read_digital_me_dispatcher_grant(text,text)', 'EXECUTE') AS can_read_grant,
           has_any_column_privilege(current_user, '${TABLE_NAME}', 'INSERT') AS can_insert,
           has_table_privilege(current_user, '${TABLE_NAME}', 'DELETE,TRUNCATE') AS can_destroy,
           has_table_privilege(current_user, 'public.digital_me_dispatcher_grants', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS can_access_grant_table`,
      );
      const row = result.rows[0] ?? {};
      if (!row.table_name || row.dispatcher_member !== true || row.scoped_rls !== true ||
          row.can_select !== true || row.can_update !== true || row.can_read_grant !== true ||
          row.can_insert !== false || row.can_destroy !== false || row.can_access_grant_table !== false) {
        throw new WorkerAutopilotSchemaNotReadyError('Dedicated dispatcher privileges are not ready.');
      }
    }, true);
  }

  async create(mission: AutopilotMission): Promise<AutopilotMission> {
    if (!mission || this.requireOwnRequester(mission.requester, 'mission creation') !== mission.requester) {
      throw new Error('Autopilot mission requester does not match the verified identity.');
    }
    const payload = JSON.stringify(mission);
    if (payload.length > 256_000) throw new Error('Autopilot mission payload exceeds the 256 KB limit.');

    return this.withTransaction(async client => {
      const inserted = await client.query(
        `INSERT INTO ${TABLE_NAME}
          (id, requester, idempotency_key, status, version, payload, next_run_at,
           lease_owner, lease_expires_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz,$8,$9::timestamptz,$10::timestamptz,$11::timestamptz)
         ON CONFLICT (requester, idempotency_key) DO NOTHING
         RETURNING payload`,
        [
          mission.id, mission.requester, mission.idempotencyKey, mission.status, mission.version,
          payload, mission.nextRunAt ?? null, mission.leaseOwner ?? null,
          mission.leaseExpiresAt ?? null, mission.createdAt, mission.updatedAt,
        ],
      );
      if (inserted.rows[0]?.payload) return parseMission(inserted.rows[0].payload);

      const existing = await client.query(
        `SELECT payload FROM ${TABLE_NAME}
         WHERE requester = $1 AND idempotency_key = $2
         LIMIT 1`,
        [mission.requester, mission.idempotencyKey],
      );
      if (!existing.rows[0]?.payload) {
        throw new Error('Autopilot mission idempotency conflict could not be reconciled.');
      }
      return parseMission(existing.rows[0].payload);
    });
  }

  async get(id: string): Promise<AutopilotMission | null> {
    const missionId = typeof id === 'string' ? id.trim() : '';
    if (!missionId || missionId.length > 256) return null;
    return this.withTransaction(async client => {
      const result = await client.query(
        `SELECT payload FROM ${TABLE_NAME} WHERE id = $1 LIMIT 1`,
        [missionId],
      );
      return result.rows[0]?.payload ? parseMission(result.rows[0].payload) : null;
    }, true);
  }

  async list(requester: string | undefined, limit: number, allowAll = false): Promise<AutopilotMission[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Autopilot mission limit must be an integer between 1 and 100.');
    }
    const mayReadAll = allowAll === true && this.allowAll;
    if (allowAll && !this.allowAll) this.requireElevatedAccess('cross-requester listing');
    const normalizedRequester = mayReadAll ? undefined : this.requireOwnRequester(String(requester || ''), 'listing');

    return this.withTransaction(async client => {
      const result = await client.query(
        mayReadAll
          ? `SELECT payload FROM ${TABLE_NAME} ORDER BY updated_at DESC LIMIT $1`
          : `SELECT payload FROM ${TABLE_NAME}
             WHERE requester = $1 ORDER BY updated_at DESC LIMIT $2`,
        mayReadAll ? [limit] : [normalizedRequester, limit],
      );
      return result.rows
        .filter(row => row.payload !== undefined && row.payload !== null)
        .map(row => parseMission(row.payload));
    }, true);
  }

  async listCodingDispatchPage(requester: string, limit: number, cursor: { createdAt: string; id: string } | null): Promise<AutopilotMission[]> {
    const owner = this.requireOwnRequester(requester, 'coding dispatch discovery');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid coding dispatch limit.');
    if (cursor && (!Number.isFinite(Date.parse(cursor.createdAt)) || !/^mission-coding-[a-f0-9]{64}$/.test(cursor.id))) {
      throw new Error('Invalid coding dispatch cursor.');
    }
    return this.withTransaction(async client => {
      const result = await client.query(
        `SELECT payload FROM ${TABLE_NAME}
         WHERE requester = $1 AND id LIKE 'mission-coding-%' AND status = 'blocked'
           AND lease_owner IS NULL AND lease_expires_at IS NULL
           AND (payload->'dispatcher' IS NULL OR
                (payload->'dispatcher'->>'phase' = 'retryable' AND payload->'dispatcher'->>'attempts' = '1'))
           AND ($3::timestamptz IS NULL OR (created_at, id) > ($3::timestamptz, $4::text))
         ORDER BY created_at, id LIMIT $2`,
        [owner, limit, cursor?.createdAt ?? null, cursor?.id ?? null],
      );
      return result.rows.map(row => parseMission(row.payload));
    }, true);
  }

  async findByIdempotencyKey(requester: string, idempotencyKey: string): Promise<AutopilotMission | null> {
    const normalizedRequester = this.requireOwnRequester(requester, 'idempotency lookup');
    const key = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
    if (!key || key.length > 128) return null;
    return this.withTransaction(async client => {
      const result = await client.query(
        `SELECT payload FROM ${TABLE_NAME}
         WHERE requester = $1 AND idempotency_key = $2
         LIMIT 1`,
        [normalizedRequester, key],
      );
      return result.rows[0]?.payload ? parseMission(result.rows[0].payload) : null;
    }, true);
  }

  async save(mission: AutopilotMission, expectedVersion: number, leaseFence?: { owner: string; expiresAt: string }): Promise<AutopilotMission | null> {
    if (!this.allowAll && mission.requester !== this.requester) {
      throw new Error('Autopilot mission update does not match the verified requester context.');
    }
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new Error('Autopilot mission expected version is invalid.');
    }
    const next = { ...mission, version: expectedVersion + 1 };
    const payload = JSON.stringify(next);
    if (payload.length > 256_000) throw new Error('Autopilot mission payload exceeds the 256 KB limit.');

    return this.withTransaction(async client => {
      const result = await client.query(
        `UPDATE ${TABLE_NAME}
         SET status = $3,
             version = version + 1,
             payload = $4::jsonb,
             next_run_at = $5::timestamptz,
             lease_owner = $6,
             lease_expires_at = $7::timestamptz,
             updated_at = $8::timestamptz
         WHERE id = $1 AND requester = $9 AND version = $2
           ${leaseFence ? "AND status = 'executing' AND lease_owner = $10 AND lease_expires_at = $11::timestamptz AND lease_expires_at > clock_timestamp()" : ''}
         RETURNING payload`,
        [
          mission.id, expectedVersion, next.status, payload,
          next.nextRunAt ?? null, next.leaseOwner ?? null, next.leaseExpiresAt ?? null,
          next.updatedAt, mission.requester,
          ...(leaseFence ? [leaseFence.owner, leaseFence.expiresAt] : []),
        ],
      );
      return result.rows[0]?.payload ? parseMission(result.rows[0].payload) : null;
    });
  }

  async claimNext(workerId: string, leaseMs: number, now: string): Promise<AutopilotMission | null> {
    this.requireElevatedAccess('mission claiming');
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 30_000 || leaseMs > 30 * 60_000) {
      throw new Error('Autopilot mission lease must be between 30 seconds and 30 minutes.');
    }
    const requesterClause = this.allowAll ? '' : 'AND requester = $4';
    const missionRequesterClause = this.allowAll ? '' : 'AND mission.requester = $4';
    const values = this.allowAll ? [workerId, leaseMs, now] : [workerId, leaseMs, now, this.requester];
    return this.withTransaction(async client => {
      const result = await client.query(
        `WITH candidate AS (
           SELECT id
           FROM ${TABLE_NAME}
           WHERE status = 'queued'
             AND (next_run_at IS NULL OR next_run_at <= $3::timestamptz)
             AND (lease_expires_at IS NULL OR lease_expires_at <= $3::timestamptz)
             ${requesterClause}
           ORDER BY COALESCE(next_run_at, created_at), created_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE ${TABLE_NAME} AS mission
         SET status = CASE
               WHEN jsonb_typeof(mission.payload->'steps') = 'array'
                 AND jsonb_array_length(mission.payload->'steps') > 0
               THEN 'executing' ELSE 'planning' END,
             version = mission.version + 1,
             lease_owner = $1,
             lease_expires_at = $3::timestamptz + ($2::bigint * INTERVAL '1 millisecond'),
             updated_at = $3::timestamptz,
             payload = mission.payload || jsonb_build_object(
               'status', CASE
                 WHEN jsonb_typeof(mission.payload->'steps') = 'array'
                   AND jsonb_array_length(mission.payload->'steps') > 0
                 THEN 'executing' ELSE 'planning' END,
               'version', mission.version + 1,
               'leaseOwner', $1,
               'leaseExpiresAt', $3::timestamptz + ($2::bigint * INTERVAL '1 millisecond'),
               'updatedAt', $3::timestamptz
             )
         WHERE mission.id = (SELECT id FROM candidate)
           ${missionRequesterClause}
         RETURNING mission.payload`,
        values,
      );
      return result.rows[0]?.payload ? parseMission(result.rows[0].payload) : null;
    });
  }

  async renewLease(id: string, workerId: string, leaseMs: number, now: string): Promise<AutopilotMission | null> {
    this.requireElevatedAccess('lease renewal');
    if (!Number.isSafeInteger(leaseMs) || leaseMs < 30_000 || leaseMs > 30 * 60_000) {
      throw new Error('Autopilot mission lease must be between 30 seconds and 30 minutes.');
    }
    return this.withTransaction(async client => {
      const result = await client.query(
        `UPDATE ${TABLE_NAME}
         SET version = version + 1,
             lease_expires_at = $4::timestamptz + ($3::bigint * INTERVAL '1 millisecond'),
             updated_at = $4::timestamptz,
             payload = payload || jsonb_build_object(
               'version', version + 1,
               'leaseExpiresAt', $4::timestamptz + ($3::bigint * INTERVAL '1 millisecond'),
               'updatedAt', $4::timestamptz
             )
         WHERE id = $1 AND lease_owner = $2
           AND status IN ('planning', 'executing')
           AND lease_expires_at > $4::timestamptz
         RETURNING payload`,
        [id, workerId, leaseMs, now],
      );
      return result.rows[0]?.payload ? parseMission(result.rows[0].payload) : null;
    });
  }

  async recoverExpired(now: string): Promise<number> {
    this.requireElevatedAccess('expired-lease recovery');
    const requesterClause = this.allowAll ? '' : 'AND requester = $2';
    const values = this.allowAll ? [now] : [now, this.requester];
    return this.withTransaction(async client => {
      const result = await client.query(
        `UPDATE ${TABLE_NAME}
         SET status = 'reconciliation-required',
             version = version + 1,
             lease_owner = NULL,
             lease_expires_at = NULL,
             updated_at = $1::timestamptz,
             payload = jsonb_set(
               jsonb_set(
                 jsonb_set(
                   payload,
                   '{status}',
                   '"reconciliation-required"'::jsonb
                 ),
                 '{lastError}',
                 to_jsonb('Expired execution lease; external side effects must be reconciled before any retry.'::text)
               ),
               '{steps}',
               COALESCE((
                 SELECT jsonb_agg(
                   CASE WHEN step->>'status' = 'running'
                     THEN jsonb_set(step, '{status}', '"reconciliation-required"'::jsonb)
                     ELSE step
                   END
                 )
                 FROM jsonb_array_elements(COALESCE(payload->'steps', '[]'::jsonb)) AS step
               ), '[]'::jsonb)
             ) || jsonb_build_object(
               'version', version + 1,
               'leaseOwner', NULL,
               'leaseExpiresAt', NULL,
               'updatedAt', $1::timestamptz
             )
         WHERE status IN ('planning', 'executing')
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at <= $1::timestamptz
           ${requesterClause}
         RETURNING id`,
        values,
      );
      return result.rowCount ?? result.rows.length;
    });
  }
}
