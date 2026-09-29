import { getPostgresPool } from './postgres';

export type AppState = {
  policy?: unknown;
  offers: unknown[];
  grants: unknown[];
  telemetryEvents: unknown[];
  transactions: unknown[];
  footprints: unknown[];
  exposures: unknown[];
  stats: Record<string, number>;
};

export async function initializeAppState() {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_policies (
      user_reference TEXT PRIMARY KEY,
      policy JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS app_offers (
      user_reference TEXT NOT NULL, offer_id TEXT NOT NULL, offer JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_reference, offer_id)
    );
    CREATE TABLE IF NOT EXISTS app_grants (
      user_reference TEXT NOT NULL, grant_id TEXT NOT NULL, grant_data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_reference, grant_id)
    );
    CREATE TABLE IF NOT EXISTS app_telemetry (
      user_reference TEXT NOT NULL, event_id TEXT NOT NULL, event_data JSONB NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_reference, event_id)
    );
    CREATE TABLE IF NOT EXISTS app_transactions (
      user_reference TEXT NOT NULL, transaction_id TEXT NOT NULL, transaction_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_reference, transaction_id)
    );
    CREATE TABLE IF NOT EXISTS app_footprints (
      user_reference TEXT NOT NULL, footprint_id TEXT NOT NULL, footprint_data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_reference, footprint_id)
    );
    CREATE TABLE IF NOT EXISTS app_exposures (
      user_reference TEXT NOT NULL, exposure_id TEXT NOT NULL, exposure_data JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (user_reference, exposure_id)
    );
  `);
}

const TABLES = {
  offers: 'app_offers',
  grants: 'app_grants',
  telemetry: 'app_telemetry',
  transactions: 'app_transactions',
  telemetryEvents: 'app_telemetry',
  footprints: 'app_footprints',
  exposures: 'app_exposures',
} as const;

function user(value: string | undefined) {
  return String(value || 'anonymous').slice(0, 200);
}

export async function readAppState(userReference?: string): Promise<AppState> {
  const u = user(userReference);
  const db = getPostgresPool();
  const [policy, offers, grants, telemetry, transactions, footprints, exposures] = await Promise.all([
    db.query('SELECT policy FROM app_policies WHERE user_reference=$1', [u]),
    db.query('SELECT offer FROM app_offers WHERE user_reference=$1 ORDER BY updated_at DESC', [u]),
    db.query('SELECT grant_data FROM app_grants WHERE user_reference=$1 ORDER BY updated_at DESC', [u]),
    db.query('SELECT event_data FROM app_telemetry WHERE user_reference=$1 ORDER BY occurred_at DESC LIMIT 100', [u]),
    db.query('SELECT transaction_data FROM app_transactions WHERE user_reference=$1 ORDER BY created_at DESC LIMIT 100', [u]),
    db.query('SELECT footprint_data FROM app_footprints WHERE user_reference=$1 ORDER BY updated_at DESC', [u]),
    db.query('SELECT exposure_data FROM app_exposures WHERE user_reference=$1 ORDER BY updated_at DESC', [u]),
  ]);

  const txResult = await db.query('SELECT id, offer_id, amount_minor, currency, status, created_at FROM marketplace_transactions WHERE user_reference=$1 ORDER BY created_at DESC LIMIT 100', [u]);
  const tx = txResult.rows.map((r: any) => ({ id: r.id, offerId: r.offer_id, amountUsd: Number(r.amount_minor) / 100, currency: r.currency, status: r.status, createdAt: r.created_at }));
  const revenue = await db.query(`SELECT COALESCE(SUM(CASE WHEN status='paid' THEN amount_minor ELSE 0 END),0)::bigint AS paid_minor, COALESCE(SUM(CASE WHEN status='refunded' THEN amount_minor ELSE 0 END),0)::bigint AS refunded_minor, COALESCE(SUM(CASE WHEN status='disputed' THEN amount_minor ELSE 0 END),0)::bigint AS disputed_minor FROM revenue_ledger WHERE user_reference=$1`, [u]);
  const payouts = await db.query(`SELECT COALESCE(SUM(CASE WHEN status IN ('pending','processing','paid') THEN amount_minor ELSE 0 END),0)::bigint AS reserved_minor FROM payout_requests WHERE user_reference=$1`, [u]);
  const grossLedgerUsd = (Number(revenue.rows[0]?.paid_minor || 0) - Number(revenue.rows[0]?.refunded_minor || 0) - Number(revenue.rows[0]?.disputed_minor || 0)) / 100;
  const reservedPayoutUsd = Number(payouts.rows[0]?.reserved_minor || 0) / 100;
  const ledgerBalanceUsd = Math.max(0, grossLedgerUsd - reservedPayoutUsd);
  const telemetryEvents = telemetry.rows.map(r => r.event_data);
  const earned = ledgerBalanceUsd;
  const pending = tx.reduce((n: number, t: any) => n + (t.status === 'accepted' ? Number(t.amountUsd || 0) : 0), 0);
  const activeDataStreamsCount = footprints.rows.filter((r: any) => Boolean(r.footprint_data?.isMonetized)).length;
  const totalDataPointsGoverned = footprints.rows.reduce((n: number, r: any) => n + Number(r.footprint_data?.dataPointsMonthly || 0), 0);

  return {
    policy: policy.rows[0]?.policy,
    offers: offers.rows.map(r => r.offer),
    grants: grants.rows.map(r => r.grant_data),
    telemetryEvents,
    transactions: tx,
    footprints: footprints.rows.map(r => r.footprint_data),
    exposures: exposures.rows.map(r => r.exposure_data),
    stats: {
      totalEarnedUsd: earned,
      pendingSettlementUsd: pending,
      activeDataStreamsCount,
      monthlyPacingUsd: earned,
      totalDataPointsGoverned,
      privacyShieldIndex: 0,
      brokerBidsProcessedToday: offers.rows.length,
    },
  };
}

export async function upsertState(userReference: string | undefined, payload: Partial<AppState>) {
  const u = user(userReference);
  const db = getPostgresPool();
  await initializeAppState();
  if (payload.policy !== undefined) {
    await db.query('INSERT INTO app_policies(user_reference,policy) VALUES($1,$2) ON CONFLICT(user_reference) DO UPDATE SET policy=EXCLUDED.policy,updated_at=now()', [u, payload.policy]);
  }
  const jobs: Promise<unknown>[] = [];
  for (const [key, table] of Object.entries(TABLES)) {
    const value = (payload as any)[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const id = String(item?.id || '');
      if (!id) continue;
      if (key === 'offers') jobs.push(db.query('INSERT INTO app_offers(user_reference,offer_id,offer) VALUES($1,$2,$3) ON CONFLICT(user_reference,offer_id) DO UPDATE SET offer=EXCLUDED.offer,updated_at=now()', [u,id,item]));
      if (key === 'grants') jobs.push(db.query('INSERT INTO app_grants(user_reference,grant_id,grant_data) VALUES($1,$2,$3) ON CONFLICT(user_reference,grant_id) DO UPDATE SET grant_data=EXCLUDED.grant_data,updated_at=now()', [u,id,item]));
      if (key === 'telemetryEvents') jobs.push(db.query('INSERT INTO app_telemetry(user_reference,event_id,event_data) VALUES($1,$2,$3) ON CONFLICT(user_reference,event_id) DO UPDATE SET event_data=EXCLUDED.event_data,occurred_at=now()', [u,id,item]));
      if (key === 'transactions') jobs.push(db.query('INSERT INTO app_transactions(user_reference,transaction_id,transaction_data) VALUES($1,$2,$3) ON CONFLICT(user_reference,transaction_id) DO UPDATE SET transaction_data=EXCLUDED.transaction_data,created_at=now()', [u,id,item]));
      if (key === 'footprints') jobs.push(db.query('INSERT INTO app_footprints(user_reference,footprint_id,footprint_data) VALUES($1,$2,$3) ON CONFLICT(user_reference,footprint_id) DO UPDATE SET footprint_data=EXCLUDED.footprint_data,updated_at=now()', [u,id,item]));
      if (key === 'exposures') jobs.push(db.query('INSERT INTO app_exposures(user_reference,exposure_id,exposure_data) VALUES($1,$2,$3) ON CONFLICT(user_reference,exposure_id) DO UPDATE SET exposure_data=EXCLUDED.exposure_data,updated_at=now()', [u,id,item]));
    }
  }
  await Promise.all(jobs);
  return readAppState(u);
}

export async function updateOffer(userReference: string | undefined, offerId: string, patch: Record<string, unknown>) {
  const u=user(userReference); const db=getPostgresPool();
  const r=await db.query('SELECT offer FROM app_offers WHERE user_reference=$1 AND offer_id=$2',[u,offerId]);
  if (!r.rows[0]) throw new Error('Offer not found');
  const offer={...r.rows[0].offer,...patch};
  await db.query('UPDATE app_offers SET offer=$3,updated_at=now() WHERE user_reference=$1 AND offer_id=$2',[u,offerId,offer]);
  return readAppState(u);
}

export async function updateGrant(userReference: string | undefined, grantId: string, patch: Record<string, unknown>) {
  const u=user(userReference); const db=getPostgresPool();
  const r=await db.query('SELECT grant_data FROM app_grants WHERE user_reference=$1 AND grant_id=$2',[u,grantId]);
  if (!r.rows[0]) throw new Error('Grant not found');
  const grant={...r.rows[0].grant_data,...patch};
  await db.query('UPDATE app_grants SET grant_data=$3,updated_at=now() WHERE user_reference=$1 AND grant_id=$2',[u,grantId,grant]);
  return readAppState(u);
}

export async function addTransaction(userReference: string | undefined, transaction: Record<string, unknown>) {
  return upsertState(userReference,{transactions:[transaction]});
}

export async function addTelemetry(userReference: string | undefined, event: Record<string, unknown>) {
  return upsertState(userReference,{telemetryEvents:[event]});
}
