import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// These Git blob identifiers were captured after comparing the restored SQL
// byte-for-byte with the statements already recorded in the applied Supabase
// migration history. This test guards against accidental edits or drift.
const restoredMigrations = [
  {
    path: 'supabase/migrations/20261021051653_bootstrap_basic_operations_schema.sql',
    gitBlobSha: '8719aff9c65da5f7481105a0bfff7efb167b85ea',
  },
  {
    path: 'supabase/migrations/20261021062230_secure_public_tables_and_index_foreign_keys.sql',
    gitBlobSha: '31efc95444e01f6d5f2f9a583469019fcd4cfcd9',
  },
];

const gitBlobSha = (content) => {
  const header = Buffer.from(`blob ${content.length}\0`, 'utf8');
  return createHash('sha1').update(header).update(content).digest('hex');
};

for (const migration of restoredMigrations) {
  test(`preserves the verified applied source: ${migration.path}`, () => {
    const content = readFileSync(join(root, migration.path));
    assert.equal(gitBlobSha(content), migration.gitBlobSha);
  });
}
