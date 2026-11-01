import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const loadDatabaseCa = (path: string): string => {
  try {
    const ca = readFileSync(path, 'utf8');
    if (!ca.trim()) throw new Error('CA bundle is empty');
    return ca;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown file-read error';
    throw new Error(`DATABASE_SSL_CA is configured but its CA bundle could not be read at "${path}": ${detail}`);
  }
};

let pool: Pool | null = null;

const getDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured');
  // pg-connection-string v3 warns that legacy sslmode values change semantics.
  // The application supplies the TLS policy explicitly via the Pool `ssl` option,
  // so remove sslmode from the connection string to avoid conflicting settings.
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch {
    return url.replace(/([?&])sslmode=[^&]*&?/i, '$1').replace(/[?&]$/, '');
  }
};

const getDatabaseSslMode = (): 'disabled' | 'required' | 'invalid' => {
  // The disable switch is permitted only for isolated non-production databases.
  if (process.env.NODE_ENV !== 'production') return 'disabled';
  if (process.env.DATABASE_SSL === 'disable') return 'invalid';
  return 'required';
};

const getDatabaseCaOptions = (): { ca?: string } => {
  const caPath = process.env.DATABASE_SSL_CA;
  if (!caPath) return {};
  return { ca: loadDatabaseCa(caPath) };
};

const getDatabaseSsl = () => {
  const mode = getDatabaseSslMode();
  if (mode === 'invalid') {
    throw new Error('DATABASE_SSL=disable is not permitted in production');
  }
  if (mode === 'disabled') return undefined;

  // Production TLS must validate the server certificate to prevent MITM attacks.
  // DATABASE_SSL_CA may point to a trusted CA bundle for private database certificates.
  return {
    rejectUnauthorized: true,
    ...getDatabaseCaOptions(),
  };
};

const createPostgresPool = (): Pool => new Pool({
  connectionString: getDatabaseUrl(),
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: getDatabaseSsl(),
});

export const getPostgresPool = (): Pool => {
  if (!pool) pool = createPostgresPool();
  return pool;
};

/**
 * Return the shared PostgreSQL pool when DATABASE_URL is configured.
 * Optional persistence modules can preserve memory-only behavior without
 * creating a separate pool or weakening the central TLS policy.
 */
export const getOptionalPostgresPool = (): Pool | null =>
  process.env.DATABASE_URL ? getPostgresPool() : null;

export const checkPostgres = async (): Promise<{ ok: boolean; database?: string; latencyMs?: number; error?: string }> => {
  const started = Date.now();
  try {
    const result = await getPostgresPool().query('SELECT current_database() AS database');
    return { ok: true, database: result.rows[0]?.database, latencyMs: Date.now() - started };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - started, error: error instanceof Error ? error.message : 'PostgreSQL connection failed' };
  }
};
