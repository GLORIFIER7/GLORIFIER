-- Follow-up hardening for the already-applied explicit_client_role_denials policy.
-- Production application is recorded in Supabase migration history as version 20261030125059.
-- It also hardens defaults for future postgres-owned objects; see the postconditions below.
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

-- Prevent future postgres-owned public objects from inheriting client access.
-- Preserve service_role for the Cloudflare server-side application path.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated, PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON FUNCTIONS FROM anon, authenticated, PUBLIC;

-- PostgreSQL grants EXECUTE to PUBLIC globally by default. A schema-scoped
-- REVOKE cannot remove that global default, so revoke it at the role level.
-- This applies only to future postgres-owned functions in any schema; callers
-- must receive explicit EXECUTE grants in the migration that creates a function.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Verify the resulting defaults without touching the platform-managed
-- supabase_admin defaults or removing service_role's explicit public defaults.
DO $$
DECLARE
  object_type "char";
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE d.defaclrole = 'postgres'::regrole
      AND d.defaclnamespace = 'public'::regnamespace
      AND d.defaclobjtype IN ('r', 'S', 'f')
      AND (grantee.rolname IN ('anon', 'authenticated') OR acl.grantee = 0)
  ) THEN
    RAISE EXCEPTION 'Client roles or PUBLIC retain postgres public-schema default privileges';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
    WHERE d.defaclrole = 'postgres'::regrole
      AND d.defaclnamespace = 0
      AND d.defaclobjtype = 'f'
      AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'PUBLIC retains the global EXECUTE default for postgres-owned functions';
  END IF;

  FOREACH object_type IN ARRAY ARRAY['r'::"char", 'S'::"char", 'f'::"char"] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_default_acl d
      CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
      JOIN pg_roles grantee ON grantee.oid = acl.grantee
      WHERE d.defaclrole = 'postgres'::regrole
        AND d.defaclnamespace = 'public'::regnamespace
        AND d.defaclobjtype = object_type
        AND grantee.rolname = 'service_role'
    ) THEN
      RAISE EXCEPTION 'service_role default privileges were not preserved for object type %', object_type;
    END IF;
  END LOOP;
END
$$;
