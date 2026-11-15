-- GLORIFIER Autopilot durable mission store for Cloudflare Workers.
-- Apply only after review using the Neon owner role. CI and Worker startup never run DDL.
-- The Worker connects through APP_STATE_HYPERDRIVE as glorifier_worker_app_rw.
-- Every Worker transaction sets transaction-local glorifier.requester and glorifier.allow_all values.

BEGIN;

CREATE TABLE IF NOT EXISTS public.glorifier_autopilot_missions (
  id TEXT PRIMARY KEY,
  requester TEXT NOT NULL CHECK (length(requester) BETWEEN 1 AND 256),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  status TEXT NOT NULL CHECK (status IN (
    'queued',
    'planning',
    'executing',
    'blocked',
    'completed',
    'failed',
    'cancelled',
    'reconciliation-required'
  )),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  next_run_at TIMESTAMPTZ,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT glorifier_autopilot_missions_requester_idempotency_unique
    UNIQUE (requester, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_glorifier_autopilot_missions_status_due
  ON public.glorifier_autopilot_missions(status, next_run_at, created_at);

CREATE INDEX IF NOT EXISTS idx_glorifier_autopilot_missions_requester_updated
  ON public.glorifier_autopilot_missions(requester, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_glorifier_autopilot_missions_lease
  ON public.glorifier_autopilot_missions(status, lease_expires_at);

ALTER TABLE public.glorifier_autopilot_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS glorifier_autopilot_missions_worker_scope
  ON public.glorifier_autopilot_missions;

CREATE POLICY glorifier_autopilot_missions_worker_scope
  ON public.glorifier_autopilot_missions
  FOR ALL
  TO glorifier_worker_app_rw
  USING (
    requester = NULLIF(current_setting('glorifier.requester', true), '')
    OR current_setting('glorifier.allow_all', true) = 'true'
  )
  WITH CHECK (
    requester = NULLIF(current_setting('glorifier.requester', true), '')
    OR current_setting('glorifier.allow_all', true) = 'true'
  );

REVOKE ALL PRIVILEGES ON TABLE public.glorifier_autopilot_missions FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.glorifier_autopilot_missions
  TO glorifier_worker_app_rw;

COMMENT ON TABLE public.glorifier_autopilot_missions IS
  'Durable GLORIFIER Autopilot mission queue; requester partition and internal-owner access enforced by RLS.';

COMMIT;
