import assert from 'node:assert/strict';
import { getOptionalPostgresPool, getPostgresPool } from './postgres';

const originalEnvironment = {
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL,
  nodeEnv: process.env.NODE_ENV,
};

function restoreEnvironment(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

let pool: ReturnType<typeof getPostgresPool> | null = null;

try {
  delete process.env.DATABASE_URL;
  assert.equal(
    getOptionalPostgresPool(),
    null,
    'optional PostgreSQL access must remain unavailable when DATABASE_URL is not configured',
  );

  process.env.NODE_ENV = 'test';
  delete process.env.DATABASE_SSL;
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/glorifier_test';

  pool = getOptionalPostgresPool();
  assert.ok(pool, 'configured optional PostgreSQL access must return a pool');
  assert.equal(
    pool,
    getPostgresPool(),
    'optional database consumers must reuse the shared PostgreSQL pool and its centralized TLS policy',
  );
} finally {
  if (pool) await pool.end();
  restoreEnvironment('DATABASE_URL', originalEnvironment.databaseUrl);
  restoreEnvironment('DATABASE_SSL', originalEnvironment.databaseSsl);
  restoreEnvironment('NODE_ENV', originalEnvironment.nodeEnv);
}

console.log('shared PostgreSQL pool regression tests passed');
