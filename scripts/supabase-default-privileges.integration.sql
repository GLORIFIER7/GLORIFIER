-- Fixture for scripts/supabase-default-privileges.integration.test.mjs.
-- The runner starts a transaction before executing this file and inserts the
-- production migration at the explicit marker below.

DO $role$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
DO $role$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
DO $role$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
DO $role$ BEGIN CREATE ROLE supabase_admin NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;

-- Reproduce the risky defaults observed in the connected Supabase project.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO anon, authenticated, service_role, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated, service_role, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  GRANT EXECUTE ON FUNCTIONS TO PUBLIC;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Preserve exact owner, namespace, object type, and ACL for platform defaults.
CREATE TEMP TABLE glorifier_supabase_admin_acl_before ON COMMIT DROP AS
SELECT defaclnamespace, defaclobjtype, defaclacl::text AS acl
FROM pg_default_acl
WHERE defaclrole = 'supabase_admin'::regrole;

-- Snapshot every service_role grant independently of the client grants that
-- the migration is expected to revoke.
CREATE TEMP TABLE glorifier_service_role_acl_before ON COMMIT DROP AS
SELECT d.defaclnamespace,
       d.defaclobjtype,
       acl.grantor,
       acl.grantee,
       acl.privilege_type,
       acl.is_grantable
FROM pg_default_acl d
CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
JOIN pg_roles grantee ON grantee.oid = acl.grantee
WHERE d.defaclrole = 'postgres'::regrole
  AND grantee.rolname = 'service_role';

CREATE TABLE public.connection_approvals (id bigint PRIMARY KEY);
CREATE TABLE public.connection_events (id bigint PRIMARY KEY);
CREATE TABLE public.connection_registry (id bigint PRIMARY KEY);
CREATE TABLE public.intelligence_analyses (id bigint PRIMARY KEY);
CREATE TABLE public.intelligence_evidence (id bigint PRIMARY KEY);
CREATE TABLE public.intelligence_reports (id bigint PRIMARY KEY);

-- APPLY_MIGRATION_HERE

DO $verify$
DECLARE
  service_role_object_type_count integer;
BEGIN
  IF EXISTS (
    SELECT defaclnamespace, defaclobjtype, defaclacl::text
    FROM pg_default_acl
    WHERE defaclrole = 'supabase_admin'::regrole
    EXCEPT
    SELECT defaclnamespace, defaclobjtype, acl
    FROM glorifier_supabase_admin_acl_before
  ) OR EXISTS (
    SELECT defaclnamespace, defaclobjtype, acl
    FROM glorifier_supabase_admin_acl_before
    EXCEPT
    SELECT defaclnamespace, defaclobjtype, defaclacl::text
    FROM pg_default_acl
    WHERE defaclrole = 'supabase_admin'::regrole
  ) THEN
    RAISE EXCEPTION 'platform-managed supabase_admin default ACLs changed';
  END IF;

  IF EXISTS (
    SELECT d.defaclnamespace,
           d.defaclobjtype,
           acl.grantor,
           acl.grantee,
           acl.privilege_type,
           acl.is_grantable
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE d.defaclrole = 'postgres'::regrole
      AND grantee.rolname = 'service_role'
    EXCEPT
    SELECT defaclnamespace,
           defaclobjtype,
           grantor,
           grantee,
           privilege_type,
           is_grantable
    FROM glorifier_service_role_acl_before
  ) OR EXISTS (
    SELECT defaclnamespace,
           defaclobjtype,
           grantor,
           grantee,
           privilege_type,
           is_grantable
    FROM glorifier_service_role_acl_before
    EXCEPT
    SELECT d.defaclnamespace,
           d.defaclobjtype,
           acl.grantor,
           acl.grantee,
           acl.privilege_type,
           acl.is_grantable
    FROM pg_default_acl d
    CROSS JOIN LATERAL aclexplode(d.defaclacl) AS acl
    JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE d.defaclrole = 'postgres'::regrole
      AND grantee.rolname = 'service_role'
  ) THEN
    RAISE EXCEPTION 'service_role default ACL grants changed';
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

  SELECT count(DISTINCT d.defaclobjtype)
  INTO service_role_object_type_count
  FROM pg_default_acl d
  CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
  JOIN pg_roles grantee ON grantee.oid = acl.grantee
  WHERE d.defaclrole = 'postgres'::regrole
    AND d.defaclnamespace = 'public'::regnamespace
    AND d.defaclobjtype IN ('r', 'S', 'f')
    AND grantee.rolname = 'service_role';

  IF service_role_object_type_count <> 3 THEN
    RAISE EXCEPTION 'service_role default grants missing for one or more object types; found %',
      service_role_object_type_count;
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
    SELECT tablename::text
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname = 'glorifier_deny_client_roles'
      AND permissive = 'RESTRICTIVE'
      AND roles @> ARRAY['anon', 'authenticated']::name[]
      AND cardinality(roles) = 2
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
    RAISE EXCEPTION 'one or more operational tables lack the exact restrictive client-denial policy';
  END IF;

  CREATE TABLE public.glorifier_default_acl_probe (id bigint);
  CREATE SEQUENCE public.glorifier_default_acl_probe_seq;
  CREATE FUNCTION public.glorifier_default_acl_probe_fn() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;

  IF has_table_privilege('anon', 'public.glorifier_default_acl_probe', 'SELECT')
    OR has_table_privilege('anon', 'public.glorifier_default_acl_probe', 'INSERT')
    OR has_table_privilege('anon', 'public.glorifier_default_acl_probe', 'UPDATE')
    OR has_table_privilege('anon', 'public.glorifier_default_acl_probe', 'DELETE')
    OR has_table_privilege('anon', 'public.glorifier_default_acl_probe', 'TRUNCATE')
    OR has_table_privilege('anon', 'public.glorifier_default_acl_probe', 'REFERENCES')
    OR has_table_privilege('anon', 'public.glorifier_default_acl_probe', 'TRIGGER')
    OR has_table_privilege('authenticated', 'public.glorifier_default_acl_probe', 'SELECT')
    OR has_table_privilege('authenticated', 'public.glorifier_default_acl_probe', 'INSERT')
    OR has_table_privilege('authenticated', 'public.glorifier_default_acl_probe', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.glorifier_default_acl_probe', 'DELETE')
    OR has_table_privilege('authenticated', 'public.glorifier_default_acl_probe', 'TRUNCATE')
    OR has_table_privilege('authenticated', 'public.glorifier_default_acl_probe', 'REFERENCES')
    OR has_table_privilege('authenticated', 'public.glorifier_default_acl_probe', 'TRIGGER')
    OR NOT has_table_privilege('service_role', 'public.glorifier_default_acl_probe', 'SELECT')
    OR NOT has_table_privilege('service_role', 'public.glorifier_default_acl_probe', 'INSERT')
    OR NOT has_table_privilege('service_role', 'public.glorifier_default_acl_probe', 'UPDATE')
    OR NOT has_table_privilege('service_role', 'public.glorifier_default_acl_probe', 'DELETE')
    OR NOT has_table_privilege('service_role', 'public.glorifier_default_acl_probe', 'TRUNCATE')
    OR NOT has_table_privilege('service_role', 'public.glorifier_default_acl_probe', 'REFERENCES')
    OR NOT has_table_privilege('service_role', 'public.glorifier_default_acl_probe', 'TRIGGER')
    OR NOT has_table_privilege('service_role', 'public.glorifier_default_acl_probe', 'MAINTAIN')
    OR has_sequence_privilege('anon', 'public.glorifier_default_acl_probe_seq', 'USAGE')
    OR has_sequence_privilege('anon', 'public.glorifier_default_acl_probe_seq', 'SELECT')
    OR has_sequence_privilege('anon', 'public.glorifier_default_acl_probe_seq', 'UPDATE')
    OR has_sequence_privilege('authenticated', 'public.glorifier_default_acl_probe_seq', 'USAGE')
    OR has_sequence_privilege('authenticated', 'public.glorifier_default_acl_probe_seq', 'SELECT')
    OR has_sequence_privilege('authenticated', 'public.glorifier_default_acl_probe_seq', 'UPDATE')
    OR NOT has_sequence_privilege('service_role', 'public.glorifier_default_acl_probe_seq', 'USAGE')
    OR NOT has_sequence_privilege('service_role', 'public.glorifier_default_acl_probe_seq', 'SELECT')
    OR NOT has_sequence_privilege('service_role', 'public.glorifier_default_acl_probe_seq', 'UPDATE')
    OR has_function_privilege('anon', 'public.glorifier_default_acl_probe_fn()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.glorifier_default_acl_probe_fn()', 'EXECUTE')
    OR NOT has_function_privilege('service_role', 'public.glorifier_default_acl_probe_fn()', 'EXECUTE') THEN
    RAISE EXCEPTION 'future objects do not enforce full client denial and preserve all service_role privileges';
  END IF;
END
$verify$;
