import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const connectionString = process.env.SUPABASE_DEFAULT_PRIVILEGES_TEST_DATABASE_URL;
assert.ok(
  connectionString,
  'SUPABASE_DEFAULT_PRIVILEGES_TEST_DATABASE_URL is required; this integration test must not be skipped.',
);

const fixture = readFileSync('scripts/supabase-default-privileges.integration.sql', 'utf8')
  .split('-- APPLY_MIGRATION_HERE');
assert.equal(fixture.length, 2, 'integration SQL must contain exactly one migration marker');

const migration = readFileSync(
  'supabase/migrations/20261029040200_harden_client_role_denials.sql',
  'utf8',
);
const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query('BEGIN');
  await client.query(fixture[0]);
  await client.query(migration);
  await client.query(fixture[1]);
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
}
