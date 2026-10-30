import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import pg from 'pg';

const connectionString = process.env.SUPABASE_DEFAULT_PRIVILEGES_TEST_DATABASE_URL;
const migrationPath = 'supabase/migrations/20261029040200_harden_client_role_denials.sql';
const fixturePath = 'scripts/supabase-default-privileges.integration.sql';
const migrationMarker = '-- APPLY_MIGRATION_HERE';

assert.ok(
  connectionString,
  'SUPABASE_DEFAULT_PRIVILEGES_TEST_DATABASE_URL is required; this integration test must not be skipped.',
);

test('hardens future postgres-owned public defaults without changing service_role or supabase_admin', async (t) => {
  const client = new pg.Client({ connectionString });
  await client.connect();

  t.after(async () => client.query('ROLLBACK').finally(() => client.end()));

  await client.query('BEGIN');
  const fixture = readFileSync(fixturePath, 'utf8').split(migrationMarker);
  assert.equal(fixture.length, 2, 'integration SQL must include exactly one migration insertion marker');

  await client.query(fixture[0]);
  await client.query(readFileSync(migrationPath, 'utf8'));
  await client.query(fixture[1]);
});
