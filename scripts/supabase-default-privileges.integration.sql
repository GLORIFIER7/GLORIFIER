-- Fixture for scripts/supabase-default-privileges.integration.test.mjs.
-- The runner starts a transaction before executing this file and inserts the
-- production migration at the explicit marker below.

DO $role$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
DO $role$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
DO $role$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
DO $role$ BEGIN CREATE ROLE supabase_admin NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;

-- Reproduce the risky defaults observed in the connected Supabase project.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO anon, authenticated, service_role, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO anon, authenticated, service_role, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON FUNCTIONS TO anon, authenticated, service_role, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL PRIVILEGES ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TEMP TABLE glorifier_supabase_admin_acl_before ON COMMIT DROP AS
SELECT defaclobjtype, defaclacl::text AS acl
FROM pg_default_acl
WHERE defaclrole = 'supabase_admin'::regrole
ORDER BY defaclobjtype;

CREATE TABLE public.connection_approvals (id bigint PRIMARY KEY);
CREATE TABLE public.connection_events (id bigint PRIMARY KEY);
CREATE TABLE public.connection_registry (id bigint PRIMARY KEY);
CREATE TABLE public.intelligence_analyses (id bigint PRIMARY KEY);
CREATE TABLE public.intelligence_evidence (id bigint PRIMARY KEY);
CREATE TABLE public.intelligence_reports (id bigint PRIMARY KEY);

-- APPLY_MIGRATION_HERE

DO $verify$
DECLARE
  service_role_object_types text[];
BEGIN
  IF EXISTS (
    SELECT defaclobjtype, defaclacl::text
    FROM pg_default_acl
    WHERE defaclrole = 'supabase_admin'::regrole
    EXCEPT
    SELECT defaclobjtype, acl
    FROM glorifier_supabase_admin_acl_before
  ) OR EXISTS (
    SELECT defaclobjtype, acl
    FROM glorifier_supabase_admin_acl_before
    EXCEPT
    SELECT defaclobjtype, defaclacl::text
    FROM pg_default_acl
    WHERE defaclrole = 'supabase_admin'::regrole
  ) THEN
    RAISE EXCEPTION 'platform-managed supabase_admin default ACLs changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE d.defaclrole = 'postgres'::regrole
      AND d.defaclnamespace = 'public'::regnamespace
      AND d.defaclobjtype IN ('r', 'S', 'f')
      AND (grantee.rolname IN ('anon', 'authenticated') OR acl.grantee = 0)
  ) THEN
    RAISE EXCEPTION 'anon, authenticated, or PUBLIC retained future public-schema default grants';
  END IF;

  SELECT array_agg(DISTINCT d.defaclobjtype::text ORDER BY d.defaclobjtype::text)
  INTO service_role_object_types
  FROM pg_default_acl d
  CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE d.defaclrole = 'postgres'::regrole
    AND d.defaclnamespace = 'public'::regnamespace
    AND d.defaclobjtype IN ('r', 'S', 'f')
    AND grantee.rolname = 'service_role';

  IF service_role_object_types IS DISTINCT FROM ARRAY['S', 'f', 'r']::text[] THEN
    RAISE EXCEPTION 'service_role default grants missing; found %', service_role_object_types;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
    WHERE d.defaclrole = 'postgres'::regrole
      AND d.defaclnamespace = 0
      AND d.defaclobjtype = 'f'
      AND acl.grantee = 0
  ) THEN
    RAISE EXCEPTION 'PUBLIC retained global EXECUTE on future postgres-owned functions';
  END IF;

  IF ARRAY(
    SELECT tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname = 'glorifier_deny_client_roles'
      AND permissive = 'RESTRICTIVE'
      AND roles @> ARRAY['anon', 'authenticated']::name[]
      AND cmd = 'ALL'
      AND regexp_replace(coalesce(qual, ''), '[()[:space:]]', '', 'g') = 'false'
      AND regexp_replace(coalesce(with_check, ''), '[()[:space:]]', '', 'g') = 'false'
    ORDER BY tablename
  ) IS DISTINCT FROM ARRAY[
    'connection_approvals',
    'connection_events',
    'connection_registry',
    'intelligence_analyses',
    'intelligence_evidence',
    'intelligence_reports'
  ]::text[] THEN
    RAISE EXCEPTION 'one or more operational tables lack the restrictive client-denial policy';
  END IF;

  CREATE TABLE public.glorifier_default_acl_probe (id bigint);
  CREATE SEQUENCE public.glorifier_default_acl_probe_seq;
  CREATE FUNCTION public.glorifier_default_acl_probe_fn() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;

  IF has_table_privilege('anon', 'public.glorifier_default_acl_probe', 'SELECT')
    OR has_table_privilege('authenticated', 'public.glorifier_default_acl_probe', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.glorifier_default_acl_probe', 'SELECT')
    OR has_sequence_privilege('anon', 'public.glorifier_default_acl_probe_seq', 'USAGE')
    OR has_sequence_privilege('authenticated', 'public.glorifier_default_acl_probe_seq', 'USAGE')
    OR NOT has_sequence_privilege('service_role', 'public.glorifier_default_acl_probe_seq', 'USAGE')
    OR has_function_privilege('anon', 'public.glorifier_default_acl_probe_fn()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.glorifier_default_acl_probe_fn()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.glorifier_default_acl_probe_fn()', 'EXECUTE') THEN
    RAISE EXCEPTION 'future objects do not enforce the expected client-denial and service_role grants';
  END IF;
END
$verify$;
