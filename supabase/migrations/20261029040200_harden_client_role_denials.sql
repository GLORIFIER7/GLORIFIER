-- Follow-up hardening for the already-applied explicit_client_role_denials policy.
-- This migration has not been applied to production as part of this PR.
-- Enforce RLS even if a target table was accidentally left with RLS disabled,
-- then recreate the migration-owned restrictive policy to eliminate drift.
-- Do not add grants or public access policies.

DO $$
DECLARE
  table_name text;
  policy_count integer;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'connection_approvals',
    'connection_events',
    'connection_registry',
    'intelligence_analyses',
    'intelligence_evidence',
    'intelligence_reports'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS glorifier_deny_client_roles ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY glorifier_deny_client_roles ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      table_name
    );

    SELECT count(*) INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = table_name
      AND policyname = 'glorifier_deny_client_roles'
      AND permissive = 'RESTRICTIVE'
      AND roles @> ARRAY['anon', 'authenticated']::name[]
      AND cmd = 'ALL'
      AND regexp_replace(coalesce(qual, ''), '[()[:space:]]', '', 'g') = 'false'
      AND regexp_replace(coalesce(with_check, ''), '[()[:space:]]', '', 'g') = 'false';

    IF policy_count <> 1 THEN
      RAISE EXCEPTION 'RLS deny policy postcondition failed for public.%', table_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = table_name
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'RLS is not enabled for public.%', table_name;
    END IF;
  END LOOP;
END
$$;
