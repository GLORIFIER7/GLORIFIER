import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import pg from 'pg';

const connectionString = process.env.SUPABASE_DEFAULT_PRIVILEGES_TEST_DATABASE_URL;
const migrationPath = 'supabase/migrations/20261029040200_harden_client_role_denials.sql';

assert.ok(
  connectionString,
  'SUPABASE_DEFAULT_PRIVILEGES_TEST_DATABASE_URL is required; this integration test must not be skipped.',
);

test('hardens future postgres-owned public defaults without changing service_role or supabase_admin', async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();

    try {
      await client.query('BEGIN');

      await client.query(`
        DO $role$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
        DO $role$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
        DO $role$ BEGIN CREATE ROLE service_role NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
        DO $role$ BEGIN CREATE ROLE supabase_admin NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
      `);

      // Reproduce the risky default grants observed in the connected Supabase
      // project. service_role is intentionally retained for server-side access.
      await client.query(`
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
      `);

      const supabaseAdminBefore = await client.query(`
        SELECT defaclobjtype, defaclacl::text AS acl
        FROM pg_default_acl
        WHERE defaclrole = 'supabase_admin'::regrole
        ORDER BY defaclobjtype
      `);

      const protectedTables = [
        'connection_approvals',
        'connection_events',
        'connection_registry',
        'intelligence_analyses',
        'intelligence_evidence',
        'intelligence_reports',
      ];
      await client.query(`
        CREATE TABLE public.connection_approvals (id bigint PRIMARY KEY);
        CREATE TABLE public.connection_events (id bigint PRIMARY KEY);
        CREATE TABLE public.connection_registry (id bigint PRIMARY KEY);
        CREATE TABLE public.intelligence_analyses (id bigint PRIMARY KEY);
        CREATE TABLE public.intelligence_evidence (id bigint PRIMARY KEY);
        CREATE TABLE public.intelligence_reports (id bigint PRIMARY KEY);
      `);

      const migration = readFileSync(migrationPath, 'utf8');
      await client.query(migration);

      const supabaseAdminAfter = await client.query(`
        SELECT defaclobjtype, defaclacl::text AS acl
        FROM pg_default_acl
        WHERE defaclrole = 'supabase_admin'::regrole
        ORDER BY defaclobjtype
      `);
      assert.deepEqual(
        supabaseAdminAfter.rows,
        supabaseAdminBefore.rows,
        'the platform-managed supabase_admin default ACLs must remain unchanged',
      );

      const clientDefaultGrants = await client.query(`
        SELECT d.defaclobjtype AS object_type, grantee.rolname AS grantee
        FROM pg_default_acl d
        CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
        LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE d.defaclrole = 'postgres'::regrole
          AND d.defaclnamespace = 'public'::regnamespace
          AND d.defaclobjtype IN ('r', 'S', 'f')
          AND (grantee.rolname IN ('anon', 'authenticated') OR acl.grantee = 0)
      `);
      assert.deepEqual(clientDefaultGrants.rows, [], 'anon/authenticated must not inherit future public object grants');

      const serviceRoleDefaults = await client.query(`
        SELECT d.defaclobjtype AS object_type
        FROM pg_default_acl d
        CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
        JOIN pg_roles grantee ON grantee.oid = acl.grantee
        WHERE d.defaclrole = 'postgres'::regrole
          AND d.defaclnamespace = 'public'::regnamespace
          AND d.defaclobjtype IN ('r', 'S', 'f')
          AND grantee.rolname = 'service_role'
        GROUP BY d.defaclobjtype
        ORDER BY d.defaclobjtype
      `);
      assert.deepEqual(
        serviceRoleDefaults.rows.map((row) => row.object_type).sort(),
        ['S', 'f', 'r'].sort(),
        'service_role must retain its explicit defaults for tables, sequences, and functions',
      );

      const publicFunctionDefault = await client.query(`
        SELECT 1
        FROM pg_default_acl d
        CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
        WHERE d.defaclrole = 'postgres'::regrole
          AND d.defaclnamespace = 0
          AND d.defaclobjtype = 'f'
          AND acl.grantee = 0
        LIMIT 1
      `);
      assert.equal(publicFunctionDefault.rowCount, 0, 'PUBLIC must not retain global EXECUTE on future postgres-owned functions');

      const policyRows = await client.query(`
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
      `);
      assert.deepEqual(
        policyRows.rows.map((row) => row.tablename).sort(),
        [...protectedTables].sort(),
        'all six operational tables must retain the restrictive deny policy',
      );

      await client.query('CREATE TABLE public.glorifier_default_acl_probe (id bigint)');
      await client.query('CREATE SEQUENCE public.glorifier_default_acl_probe_seq');
      await client.query('CREATE FUNCTION public.glorifier_default_acl_probe_fn() RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$');

      const probe = await client.query(`
        SELECT
          has_table_privilege('anon', 'public.glorifier_default_acl_probe', 'SELECT') AS anon_table,
          has_table_privilege('authenticated', 'public.glorifier_default_acl_probe', 'INSERT') AS authenticated_table,
          has_table_privilege('service_role', 'public.glorifier_default_acl_probe', 'SELECT') AS service_table,
          has_sequence_privilege('anon', 'public.glorifier_default_acl_probe_seq', 'USAGE') AS anon_sequence,
          has_sequence_privilege('authenticated', 'public.glorifier_default_acl_probe_seq', 'USAGE') AS authenticated_sequence,
          has_sequence_privilege('service_role', 'public.glorifier_default_acl_probe_seq', 'USAGE') AS service_sequence,
          has_function_privilege('anon', 'public.glorifier_default_acl_probe_fn()', 'EXECUTE') AS anon_function,
          has_function_privilege('authenticated', 'public.glorifier_default_acl_probe_fn()', 'EXECUTE') AS authenticated_function,
          has_function_privilege('service_role', 'public.glorifier_default_acl_probe_fn()', 'EXECUTE') AS service_function
      `);
      assert.deepEqual(probe.rows[0], {
        anon_table: false,
        authenticated_table: false,
        service_table: true,
        anon_sequence: false,
        authenticated_sequence: false,
        service_sequence: true,
        anon_function: false,
        authenticated_function: false,
        service_function: true,
      }, 'objects created after the migration must deny client roles and preserve service_role');
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      await client.end();
    }
  });
