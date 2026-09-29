import { getPostgresPool } from './db/postgres';

export async function initializeAgentMinerState() {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS agent_miner_state (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      compute_authorized BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS agent_miner_cycles (
      id TEXT PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      status TEXT NOT NULL,
      providers_used JSONB NOT NULL DEFAULT '[]'::jsonb,
      observations INTEGER NOT NULL DEFAULT 0,
      work_queued INTEGER NOT NULL DEFAULT 0,
      estimated_revenue_usd NUMERIC,
      verified_revenue_usd NUMERIC,
      evidence JSONB NOT NULL DEFAULT '[]'::jsonb
    );
    INSERT INTO agent_miner_state(id,status,mode,compute_authorized)
    VALUES ('default','PAUSED','intelligence',FALSE)
    ON CONFLICT (id) DO NOTHING;
  `);
}

export async function loadAgentMinerState() {
  const db = getPostgresPool();
  const r = await db.query('SELECT status, mode, compute_authorized FROM agent_miner_state WHERE id=$1', ['default']);
  return r.rows[0] || null;
}

export async function persistAgentMinerState(status: string, mode: string, computeAuthorized: boolean) {
  const db = getPostgresPool();
  await db.query(
    'UPDATE agent_miner_state SET status=$2, mode=$3, compute_authorized=$4, updated_at=NOW() WHERE id=$1',
    ['default', status, mode, computeAuthorized]
  );
}

export async function persistAgentMinerCycle(cycle: {
  id: string; startedAt: string; completedAt: string | null; status: string; providersUsed: string[];
  observations: number; workQueued: number; estimatedRevenueUsd: number | null; verifiedRevenueUsd: number | null; evidence: string[];
}) {
  const db = getPostgresPool();
  await db.query(
    `INSERT INTO agent_miner_cycles
      (id,started_at,completed_at,status,providers_used,observations,work_queued,estimated_revenue_usd,verified_revenue_usd,evidence)
     VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb)
     ON CONFLICT(id) DO NOTHING`,
    [cycle.id, cycle.startedAt, cycle.completedAt, cycle.status, JSON.stringify(cycle.providersUsed), cycle.observations,
      cycle.workQueued, cycle.estimatedRevenueUsd, cycle.verifiedRevenueUsd, JSON.stringify(cycle.evidence)]
  );
}
