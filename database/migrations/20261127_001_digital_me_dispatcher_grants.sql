-- Apply as the reviewed Neon schema owner. Provision the dispatcher login
-- separately and grant it membership in the read-only grant reader role.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'glorifier_dispatcher_grant_reader') THEN
    CREATE ROLE glorifier_dispatcher_grant_reader NOLOGIN;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.digital_me_dispatcher_grants (
  mission_id text NOT NULL REFERENCES public.glorifier_autopilot_missions(id),
  base_sha text NOT NULL CHECK (base_sha ~ '^[a-f0-9]{40}$'),
  envelope jsonb NOT NULL CHECK (jsonb_typeof(envelope) = 'object'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  PRIMARY KEY (mission_id, base_sha),
  CHECK (mission_id ~ '^mission-coding-[a-f0-9]{64}$')
);

REVOKE ALL ON public.digital_me_dispatcher_grants FROM PUBLIC, glorifier_dispatcher_grant_reader;

CREATE OR REPLACE FUNCTION public.read_digital_me_dispatcher_grant(target_mission text, target_base text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT g.envelope
  FROM public.digital_me_dispatcher_grants AS g
  JOIN public.glorifier_autopilot_missions AS m ON m.id = g.mission_id
  WHERE g.mission_id = target_mission AND g.base_sha = target_base
    AND m.requester = 'github:32674233'
    AND m.status IN ('blocked', 'executing')
    AND g.revoked_at IS NULL AND g.expires_at > statement_timestamp()
$$;

REVOKE ALL ON FUNCTION public.read_digital_me_dispatcher_grant(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.read_digital_me_dispatcher_grant(text, text) TO glorifier_dispatcher_grant_reader;

COMMIT;
