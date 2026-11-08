import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getWorkerDatabaseSession,
  readWorkerAppState,
  upsertWorkerAppState,
  type AppStatePgClient,
  type AppStatePgClientFactory,
} from './app-state-worker';

type QueryCall = { sql: string; values: unknown[] };

function makeClient(
  calls: QueryCall[],
  responder: (sql: string, values: unknown[]) => Record<string, unknown>[] = () => [],
): AppStatePgClient {
  return {
    async connect() {},
    async end() {},
    async query(sql: string, values: unknown[] = []) {
      calls.push({ sql, values });
      return { rows: responder(sql, values) };
    },
  };
}

function factoryFor(
  calls: QueryCall[],
  responder?: (sql: string, values: unknown[]) => Record<string, unknown>[],
): AppStatePgClientFactory {
  return () => makeClient(calls, responder);
}

const binding = { connectionString: 'postgresql://worker:credential@neon.example/glorifier' };

test('Cloudflare app-state reads are scoped to the authenticated UID and preserve financial summaries', async () => {
  const calls: QueryCall[] = [];
  const uid = 'firebase-user-123';
  const state = await readWorkerAppState(binding, uid, factoryFor(calls, (sql, values) => {
    if (sql.trimStart().toUpperCase().startsWith('SELECT')) assert.equal(values[0], uid, 'every user-data query must use the authenticated UID');
    if (sql.includes('SELECT policy FROM public.app_policies')) return [{ policy: { mode: 'strict' } }];
    if (sql.includes('SELECT offer FROM public.app_offers')) return [{ offer: { id: 'offer-1' } }];
    if (sql.includes('SELECT grant_data FROM public.app_grants')) return [{ grant_data: { id: 'grant-1' } }];
    if (sql.includes('SELECT event_data FROM public.app_telemetry')) return [{ event_data: { id: 'event-1' } }];
    if (sql.includes('SELECT transaction_data FROM public.app_transactions')) return [{ transaction_data: { id: 'tx-1', amountUsd: 4, status: 'accepted' } }];
    if (sql.includes('SELECT footprint_data FROM public.app_footprints')) return [{ footprint_data: { id: 'fp-1', isMonetized: true, dataPointsMonthly: 12 } }];
    if (sql.includes('SELECT exposure_data FROM public.app_exposures')) return [{ exposure_data: { id: 'exposure-1' } }];
    if (sql.includes('marketplace_transactions')) return [
      { id: 'paid-1', offer_id: 'offer-1', amount_minor: 1250, currency: 'USD', status: 'paid', created_at: '2026-11-01T00:00:00.000Z' },
      { id: 'accepted-1', offer_id: 'offer-2', amount_minor: 400, currency: 'USD', status: 'accepted', created_at: '2026-11-02T00:00:00.000Z' },
    ];
    if (sql.includes('revenue_ledger')) return [{ paid_minor: '5000', refunded_minor: '1000', disputed_minor: '500' }];
    if (sql.includes('payout_requests')) return [{ reserved_minor: '1000' }];
    return [];
  }));

  assert.deepEqual(state.policy, { mode: 'strict' });
  assert.deepEqual(state.offers, [{ id: 'offer-1' }]);
  assert.deepEqual(state.grants, [{ id: 'grant-1' }]);
  assert.deepEqual(state.telemetryEvents, [{ id: 'event-1' }]);
  assert.deepEqual(state.footprints, [{ id: 'fp-1', isMonetized: true, dataPointsMonthly: 12 }]);
  assert.deepEqual(state.exposures, [{ id: 'exposure-1' }]);
  assert.deepEqual(state.transactions, [
    {
      id: 'paid-1',
      offerId: 'offer-1',
      amountUsd: 12.5,
      currency: 'USD',
      status: 'paid',
      createdAt: '2026-11-01T00:00:00.000Z',
    },
    {
      id: 'accepted-1',
      offerId: 'offer-2',
      amountUsd: 4,
      currency: 'USD',
      status: 'accepted',
      createdAt: '2026-11-02T00:00:00.000Z',
    },
  ]);
  assert.equal(state.stats.totalEarnedUsd, 25);
  assert.equal(state.stats.pendingSettlementUsd, 4);
  assert.equal(state.stats.activeDataStreamsCount, 1);
  assert.equal(state.stats.totalDataPointsGoverned, 12);
  assert.ok(calls.some(call => call.sql === 'BEGIN READ ONLY'));
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
  assert.equal(calls.some(call => /\bCREATE\s+TABLE\b/i.test(call.sql)), false,
    'the Worker role must not need DDL privileges');
});

test('Cloudflare app-state writes use only allowlisted tables and bind the authenticated UID', async () => {
  const calls: QueryCall[] = [];
  const payload = {
    userReference: 'attacker-selected-user',
    policy: { mode: 'strict' },
    offers: [{ id: 'offer-1', title: 'Offer' }, { title: 'ignored-without-id' }],
    grants: [{ id: 'grant-1' }],
    telemetryEvents: [{ id: 'event-1' }],
    transactions: [{ id: 'transaction-1' }],
    footprints: [{ id: 'footprint-1' }],
    exposures: [{ id: 'exposure-1' }],
  };
  await upsertWorkerAppState(binding, 'verified-owner-uid', payload, factoryFor(calls));

  const inserts = calls.filter(call => /^INSERT INTO public\./i.test(call.sql));
  assert.equal(inserts.length, 7, 'policy and six app-state collections are upserted; entries without IDs are ignored');
  assert.ok(inserts.every(call => call.values[0] === 'verified-owner-uid'),
    'client-provided userReference must never select the database row scope');
  assert.ok(inserts.every(call => /^INSERT INTO public\.(app_policies|app_offers|app_grants|app_telemetry|app_transactions|app_footprints|app_exposures)\b/i.test(call.sql)),
    'writes must be constrained to the seven user-state tables');
  assert.equal(calls.some(call => /\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+/i.test(call.sql)), false);
  assert.equal(calls.some(call => /\bCREATE\s+TABLE\b/i.test(call.sql)), false);
  assert.ok(calls.some(call => call.sql === 'BEGIN'));
  assert.ok(calls.some(call => call.sql === 'COMMIT'));
});

test('Cloudflare session probe verifies app-state write grants and all read grants required by the API', async () => {
  const calls: QueryCall[] = [];
  const result = await getWorkerDatabaseSession(binding, factoryFor(calls, sql => {
    if (!sql.includes('has_table_privilege')) return [];
    return [{
      database_name: 'glorifier',
      database_role: 'glorifier_worker_app_rw',
      database_time: '2026-11-08T14:00:00.000Z',
      app_state_read_allowed: true,
      finance_read_allowed: true,
      app_state_insert_allowed: true,
      app_state_update_allowed: true,
    }];
  }));
  assert.equal(result.connected, true);
  assert.equal(result.databaseName, 'glorifier');
  assert.equal(result.databaseRole, 'glorifier_worker_app_rw');
  assert.equal(result.readCapabilityVerified, true);
  assert.equal(result.writeCapabilityVerified, true);
  assert.ok(calls.some(call => call.sql.includes("has_table_privilege(current_user, 'public.app_policies', 'INSERT')")));
  assert.ok(calls.some(call => call.sql.includes("has_table_privilege(current_user, 'public.app_exposures', 'UPDATE')")));
  assert.ok(calls.some(call => call.sql.includes("has_table_privilege(current_user, 'public.marketplace_transactions', 'SELECT')")));
  assert.ok(calls.some(call => call.sql.includes("has_table_privilege(current_user, 'public.payout_requests', 'SELECT')")));
});

test('Cloudflare session probe does not claim write capability when any app-state table lacks UPDATE', async () => {
  const result = await getWorkerDatabaseSession(binding, factoryFor([], sql => {
    if (!sql.includes('has_table_privilege')) return [];
    return [{
      app_state_read_allowed: true,
      finance_read_allowed: true,
      app_state_insert_allowed: true,
      app_state_update_allowed: false,
    }];
  }));
  assert.equal(result.readCapabilityVerified, true);
  assert.equal(result.writeCapabilityVerified, false);
});

test('Cloudflare session probe does not claim read capability when a finance table lacks SELECT', async () => {
  const result = await getWorkerDatabaseSession(binding, factoryFor([], sql => {
    if (!sql.includes('has_table_privilege')) return [];
    return [{
      app_state_read_allowed: true,
      finance_read_allowed: false,
      app_state_insert_allowed: true,
      app_state_update_allowed: true,
    }];
  }));
  assert.equal(result.readCapabilityVerified, false);
  assert.equal(result.writeCapabilityVerified, true);
});

test('Cloudflare app-state rejects missing or blank authenticated identity before connecting', async () => {
  let factoryCalls = 0;
  const factory: AppStatePgClientFactory = () => {
    factoryCalls += 1;
    return makeClient([]);
  };
  await assert.rejects(readWorkerAppState(binding, '', factory), /authenticated user/i);
  await assert.rejects(upsertWorkerAppState(binding, '   ', {}, factory), /authenticated user/i);
  assert.equal(factoryCalls, 0);
});

test('Cloudflare app-state refuses missing Hyperdrive connection strings', async () => {
  let factoryCalls = 0;
  const factory: AppStatePgClientFactory = () => {
    factoryCalls += 1;
    return makeClient([]);
  };
  await assert.rejects(readWorkerAppState({ connectionString: '' }, 'user-1', factory), /Hyperdrive/i);
  assert.equal(factoryCalls, 0);
});
