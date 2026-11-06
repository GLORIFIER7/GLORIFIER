-- PROPOSAL ONLY: do not apply to a live database without separate approval.
-- Neon application data only. Do not mirror this table to the Supabase audit sink.
BEGIN;

CREATE SCHEMA IF NOT EXISTS glorifier;

CREATE TABLE glorifier.task_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL,
    action_class text NOT NULL CHECK (action_class ~ '^[a-z][a-z0-9_.:-]{0,79}$'),
    status text NOT NULL CHECK (status IN (
        'FULLY VERIFIED', 'VERIFIED', 'PARTIALLY VERIFIED',
        'NOT VERIFIED', 'DEGRADED', 'NOT OBSERVABLE'
    )),
    provider text NULL CHECK (
        provider IS NULL OR provider ~ '^[a-z][a-z0-9_.:-]{0,79}$'
    ),
    evidence jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
        jsonb_typeof(evidence) = 'array' AND jsonb_array_length(evidence) <= 20
    ),
    created_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
    CONSTRAINT task_runs_retention_window CHECK (expires_at <= created_at + interval '720 hours')
);

CREATE INDEX task_runs_request_id_idx ON glorifier.task_runs (request_id);
CREATE INDEX task_runs_expires_at_idx ON glorifier.task_runs (expires_at);

-- Evidence values are code-only at the application boundary. This DB check prevents
-- non-array or oversized evidence lists; application validation enforces each item.
COMMENT ON TABLE glorifier.task_runs IS
  'Minimal lifecycle metadata only; no prompts, outputs, secrets, wallet or payment data.';

COMMIT;
