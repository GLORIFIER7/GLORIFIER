import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

type ClosablePool = { end: () => Promise<void> };

const postgresModule = await import('./postgres') as unknown as {
  getOptionalPostgresPool: () => ClosablePool | null;
  getPostgresPool: () => ClosablePool;
};

const restoreEnvironment = (name: string, value: string | undefined): void => {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

test('intelligence persistence uses the centralized TLS-verified PostgreSQL pool', () => {
  const intelligenceSource = readFileSync(new URL('../intelligence.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(
    intelligenceSource,
    /rejectUnauthorized\s*:\s*false/,
    'intelligence persistence must never disable PostgreSQL TLS certificate validation',
  );
  assert.match(
    intelligenceSource,
    /getOptionalPostgresPool/,
    'intelligence persistence must reuse the centralized PostgreSQL pool policy',
  );
});

test('optional PostgreSQL access preserves memory-only mode without DATABASE_URL', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  try {
    delete process.env.DATABASE_URL;
    assert.equal(
      postgresModule.getOptionalPostgresPool(),
      null,
      'optional PostgreSQL access must remain unavailable when DATABASE_URL is not configured',
    );
  } finally {
    restoreEnvironment('DATABASE_URL', originalDatabaseUrl);
  }
});

test('optional PostgreSQL access reuses the shared pool when DATABASE_URL is configured', async () => {
  const originalEnvironment = {
    databaseUrl: process.env.DATABASE_URL,
    databaseSsl: process.env.DATABASE_SSL,
    nodeEnv: process.env.NODE_ENV,
  };
  let optionalPool: ClosablePool | null = null;
  let sharedPool: ClosablePool | null = null;

  try {
    process.env.NODE_ENV = 'test';
    delete process.env.DATABASE_SSL;
    process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/glorifier_test';

    optionalPool = postgresModule.getOptionalPostgresPool();
    assert.ok(optionalPool, 'configured optional PostgreSQL access must return a pool');
    sharedPool = postgresModule.getPostgresPool();
    assert.equal(
      optionalPool,
      sharedPool,
      'optional database consumers must reuse the shared PostgreSQL pool and its centralized TLS policy',
    );
  } finally {
    if (optionalPool) await optionalPool.end();
    if (sharedPool && sharedPool !== optionalPool) await sharedPool.end();
    restoreEnvironment('DATABASE_URL', originalEnvironment.databaseUrl);
    restoreEnvironment('DATABASE_SSL', originalEnvironment.databaseSsl);
    restoreEnvironment('NODE_ENV', originalEnvironment.nodeEnv);
  }
});
