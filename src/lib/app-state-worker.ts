import { Client } from 'pg';

export type AppStatePgClient = {
  connect(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<{
    rows: Array<Record<string, any>>;
    rowCount?: number | null;
  }>;
  end(): Promise<void>;
};

export type AppStatePgClientFactory = (
  connectionString: string,
  options: { connectionTimeoutMillis: number; query_timeout: number },
) => AppStatePgClient;

export type WorkerAppState = {
  policy?: unknown;
  offers: unknown[];
  grants: unknown[];
  telemetryEvents: unknown[];
  transactions: unknown[];
  footprints: unknown[];
  exposures: unknown[];
  stats: Record<string, number>;
};

export type WorkerAppStateInput = Partial<WorkerAppState> & {
  // This field is deliberately ignored. The authenticated principal is the
  // only authority for selecting a user's database partition.
  userReference?: unknown;
};

export type WorkerNeonBinding = { connectionString: string };

const CLIENT_OPTIONS = Object.freeze({
  connectionTimeoutMillis: 10_000,
  query_timeout: 8_000,
});

const defaultClientFactory: AppStatePgClientFactory = (connectionString, options) =>
  new Client({ connectionString, ...options }) as unknown as AppStatePgClient;

const normalizeUserReference = (value: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new Error('A valid authenticated user identity is required for app-state access.');
  }
  return normalized;
};

const requireConnectionString = (binding: WorkerNeonBinding): string => {
  const value = typeof binding?.connectionString === 'string' ? binding.connectionString.trim() : '';
  if (!value || !/^postgres(?:ql)?:\/\//i.test(value)) {
    throw new Error('A valid Neon Hyperdrive connection string is required.');
  }
  return value;
};

async function withClient<T>(
  binding: WorkerNeonBinding,
  operation: (client: AppStatePgClient) => Promise<T>,
  factory: AppStatePgClientFactory,
): Promise<T> {
  const connectionString = requireConnectionString(binding);
  const client = factory(connectionString, CLIENT_OPTIONS);
  let connected = false;
  try {
    await client.connect();
    connected = true;
    return await operation(client);
  } finally {
    if (connected) await client.end();
  }
}

function parseJsonValue(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') {
    throw new Error('App-state values must be JSON serializable.');
  }
  return serialized;
}

async function readStateOnClient(
  client: AppStatePgClient,
  userReference: string,
): Promise<WorkerAppState> {
  const [policy, offers, grants, telemetry, storedTransactions, footprints, exposures] = await Promise.all([
    client.query('SELECT policy FROM public.app_policies WHERE user_reference=$1', [userReference]),
    client.query('SELECT offer FROM public.app_offers WHERE user_reference=$1 ORDER BY updated_at DESC', [userReference]),
    client.query('SELECT grant_data FROM public.app_grants WHERE user_reference=$1 ORDER BY updated_at DESC', [userReference]),
    client.query('SELECT event_data FROM public.app_telemetry WHERE user_reference=$1 ORDER BY occurred_at DESC LIMIT 100', [userReference]),
    client.query('SELECT transaction_data FROM public.app_transactions WHERE user_reference=$1 ORDER BY created_at DESC LIMIT 100', [userReference]),
    client.query('SELECT footprint_data FROM public.app_footprints WHERE user_reference=$1 ORDER BY updated_at DESC', [userReference]),
    client.query('SELECT exposure_data FROM public.app_exposures WHERE user_reference=$1 ORDER BY updated_at DESC', [userReference]),
  ]);
  // Keep the same marketplace-ledger view returned by the existing Express API.
  // The app_transactions collection is persisted for compatibility but is not
  // substituted for marketplace transactions in this public response.
  void storedTransactions;

  const marketplace = await client.query(
    'SELECT id, offer_id, amount_minor, currency, status, created_at FROM public.marketplace_transactions WHERE user_reference=$1 ORDER BY created_at DESC LIMIT 100',
    [userReference],
  );
  const revenue = await client.query(
    `SELECT
       COALESCE(SUM(CASE WHEN status='paid' THEN amount_minor ELSE 0 END),0)::bigint AS paid_minor,
       COALESCE(SUM(CASE WHEN status='refunded' THEN amount_minor ELSE 0 END),0)::bigint AS refunded_minor,
       COALESCE(SUM(CASE WHEN status='disputed' THEN amount_minor ELSE 0 END),0)::bigint AS disputed_minor
     FROM public.revenue_ledger WHERE user_reference=$1`,
    [userReference],
  );
  const payouts = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN status IN ('pending','processing','paid')
      THEN amount_minor ELSE 0 END),0)::bigint AS reserved_minor
     FROM public.payout_requests WHERE user_reference=$1`,
    [userReference],
  );

  const transactions = marketplace.rows.map(row => ({
    id: row.id,
    offerId: row.offer_id,
    amountUsd: Number(row.amount_minor) / 100,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at,
  }));
  const paidMinor = Number(revenue.rows[0]?.paid_minor || 0);
  const refundedMinor = Number(revenue.rows[0]?.refunded_minor || 0);
  const disputedMinor = Number(revenue.rows[0]?.disputed_minor || 0);
  const reservedMinor = Number(payouts.rows[0]?.reserved_minor || 0);
  const ledgerBalanceUsd = Math.max(0, paidMinor - refundedMinor - disputedMinor - reservedMinor) / 100;
  const pending = transactions.reduce(
    (total, transaction) => total + (transaction.status === 'accepted' ? Number(transaction.amountUsd || 0) : 0),
    0,
  );
  const footprintRows = footprints.rows.map(row => row.footprint_data);
  const offerRows = offers.rows.map(row => row.offer);

  return {
    policy: policy.rows[0]?.policy,
    offers: offerRows,
    grants: grants.rows.map(row => row.grant_data),
    telemetryEvents: telemetry.rows.map(row => row.event_data),
    transactions,
    footprints: footprintRows,
    exposures: exposures.rows.map(row => row.exposure_data),
    stats: {
      totalEarnedUsd: ledgerBalanceUsd,
      pendingSettlementUsd: pending,
      activeDataStreamsCount: footprintRows.filter((row: any) => Boolean(row?.isMonetized)).length,
      monthlyPacingUsd: ledgerBalanceUsd,
      totalDataPointsGoverned: footprintRows.reduce((total: number, row: any) => total + Number(row?.dataPointsMonthly || 0), 0),
      privacyShieldIndex: 0,
      brokerBidsProcessedToday: offerRows.length,
    },
  };
}

/**
 * Read exactly one authenticated user's app state and the matching finance
 * summary. The Worker role is granted SELECT on these tables only.
 */
export async function readWorkerAppState(
  binding: WorkerNeonBinding,
  authenticatedUserId: string,
  factory: AppStatePgClientFactory = defaultClientFactory,
): Promise<WorkerAppState> {
  const userReference = normalizeUserReference(authenticatedUserId);
  return withClient(binding, async client => {
    await client.query('BEGIN READ ONLY');
    try {
      const state = await readStateOnClient(client, userReference);
      await client.query('COMMIT');
      return state;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }, factory);
}

/**
 * Upsert user-controlled app state in one transaction. No DDL or deletes are
 * issued. The user partition key always comes from the verified Worker
 * principal; client-supplied userReference fields are ignored.
 */
export async function upsertWorkerAppState(
  binding: WorkerNeonBinding,
  authenticatedUserId: string,
  payload: WorkerAppStateInput,
  factory: AppStatePgClientFactory = defaultClientFactory,
): Promise<WorkerAppState> {
  const userReference = normalizeUserReference(authenticatedUserId);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('App-state payload must be a JSON object.');
  }

  return withClient(binding, async client => {
    await client.query('BEGIN');
    try {
      if (payload.policy !== undefined) {
        await client.query(
          `INSERT INTO public.app_policies(user_reference,policy) VALUES($1,$2::jsonb)
           ON CONFLICT(user_reference) DO UPDATE
           SET policy=EXCLUDED.policy, updated_at=NOW()`,
          [userReference, parseJsonValue(payload.policy)],
        );
      }

      const collections = [
        {
          key: 'offers' as const,
          table: 'app_offers',
          idColumn: 'offer_id',
          jsonColumn: 'offer',
          timestampColumn: 'updated_at',
        },
        {
          key: 'grants' as const,
          table: 'app_grants',
          idColumn: 'grant_id',
          jsonColumn: 'grant_data',
          timestampColumn: 'updated_at',
        },
        {
          key: 'telemetryEvents' as const,
          table: 'app_telemetry',
          idColumn: 'event_id',
          jsonColumn: 'event_data',
          timestampColumn: 'occurred_at',
        },
        {
          key: 'transactions' as const,
          table: 'app_transactions',
          idColumn: 'transaction_id',
          jsonColumn: 'transaction_data',
          timestampColumn: 'created_at',
        },
        {
          key: 'footprints' as const,
          table: 'app_footprints',
          idColumn: 'footprint_id',
          jsonColumn: 'footprint_data',
          timestampColumn: 'updated_at',
        },
        {
          key: 'exposures' as const,
          table: 'app_exposures',
          idColumn: 'exposure_id',
          jsonColumn: 'exposure_data',
          timestampColumn: 'updated_at',
        },
      ];

      for (const collection of collections) {
        const items = payload[collection.key];
        if (!Array.isArray(items)) continue;
        for (const item of items) {
          if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
          const id = String((item as { id?: unknown }).id || '').trim();
          if (!id || id.length > 200) continue;
          const json = parseJsonValue(item);
          const sql = `INSERT INTO public.${collection.table}(user_reference,${collection.idColumn},${collection.jsonColumn})
            VALUES($1,$2,$3::jsonb)
            ON CONFLICT(user_reference,${collection.idColumn}) DO UPDATE
            SET ${collection.jsonColumn}=EXCLUDED.${collection.jsonColumn},
                ${collection.timestampColumn}=NOW()`;
          await client.query(sql, [userReference, id, json]);
        }
      }

      await client.query('COMMIT');
      await client.query('BEGIN READ ONLY');
      const state = await readStateOnClient(client, userReference);
      await client.query('COMMIT');
      return state;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  }, factory);
}

/**
 * Validate the real Hyperdrive role without performing a write. The session is
 * only marked write-capable when the exact app-state table has INSERT and
 * UPDATE grants.
 */
export async function getWorkerDatabaseSession(
  binding: WorkerNeonBinding,
  factory: AppStatePgClientFactory = defaultClientFactory,
): Promise<{
  connected: true;
  databaseName: string | null;
  databaseRole: string | null;
  serverTime: string | null;
  readCapabilityVerified: boolean;
  writeCapabilityVerified: boolean;
}> {
  const appStateTables = [
    'app_policies',
    'app_offers',
    'app_grants',
    'app_telemetry',
    'app_transactions',
    'app_footprints',
    'app_exposures',
  ];
  const appStateSelectChecks = appStateTables
    .map(table => `has_table_privilege(current_user, 'public.${table}', 'SELECT')`)
    .join(' AND ');
  const appStateInsertChecks = appStateTables
    .map(table => `has_table_privilege(current_user, 'public.${table}', 'INSERT')`)
    .join(' AND ');
  const appStateUpdateChecks = appStateTables
    .map(table => `has_table_privilege(current_user, 'public.${table}', 'UPDATE')`)
    .join(' AND ');

  return withClient(binding, async client => {
    const result = await client.query(
      `SELECT current_database() AS database_name,
              current_user AS database_role,
              NOW() AS database_time,
              (${appStateSelectChecks}) AS app_state_read_allowed,
              (
                has_table_privilege(current_user, 'public.marketplace_transactions', 'SELECT')
                AND has_table_privilege(current_user, 'public.revenue_ledger', 'SELECT')
                AND has_table_privilege(current_user, 'public.payout_requests', 'SELECT')
              ) AS finance_read_allowed,
              (${appStateInsertChecks}) AS app_state_insert_allowed,
              (${appStateUpdateChecks}) AS app_state_update_allowed`,
    );
    const row = result.rows[0] ?? {};
    return {
      connected: true,
      databaseName: typeof row.database_name === 'string' ? row.database_name : null,
      databaseRole: typeof row.database_role === 'string' ? row.database_role : null,
      serverTime: row.database_time == null ? null : String(row.database_time),
      readCapabilityVerified: row.app_state_read_allowed === true && row.finance_read_allowed === true,
      writeCapabilityVerified: row.app_state_insert_allowed === true && row.app_state_update_allowed === true,
    };
  }, factory);
}
