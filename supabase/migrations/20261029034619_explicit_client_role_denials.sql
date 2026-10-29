-- Applied to Supabase project ymbhbxrobfpqlxhyulbt as migration
-- 20261029034619_explicit_client_role_denials.
-- Keep RLS enabled and deny all direct client-role access to operational tables.
-- Cloudflare's server-side service-role access is unchanged; no public policies
-- or table grants are introduced by this migration.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'connection_approvals',
    'connection_events',
    'connection_registry',
    'intelligence_analyses',
    'intelligence_evidence',
    'intelligence_reports'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = 'glorifier_deny_client_roles'
    ) THEN
      EXECUTE format(
        'CREATE POLICY glorifier_deny_client_roles ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        table_name
      );
    END IF;
  END LOOP;
END
$$;
