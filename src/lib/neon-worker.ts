import { Client } from 'pg';

const OPERATIONAL_TABLES = [
  'connection_approvals',
  'connection_events',
  'connection_registry',
  'intelligence_analyses',
  'intelligence_evidence',
  'intelligence_reports',
] as const;

export type NeonOperationalTable = (typeof OPERATIONAL_TABLES)[number];

export type NeonOperationalCounts = Record<NeonOperationalTable, number>;

export type NeonHyperdriveBinding = {
  connectionString: string;
};

export type NeonPgQueryResult = {
  rows: Array<{
    table_name: unknown;
    row_count: unknown;
  }>;
};

export type NeonPgClient = {
  connect(): Promise<unknown>;
  query(sql: string): Promise<NeonPgQueryResult>;
  end(): Promise<void>;
};

export type NeonPgClientFactory = (connectionString: string) => NeonPgClient;

const OPERATIONAL_COUNTS_SQL = `
SELECT table_name, row_count
FROM (
  SELECT 'connection_approvals'::text AS table_name, COUNT(*)::text AS row_count FROM public.connection_approvals
  UNION ALL
  SELECT 'connection_events'::text AS table_name, COUNT(*)::text AS row_count FROM public.connection_events
  UNION ALL
  SELECT 'connection_registry'::text AS table_name, COUNT(*)::text AS row_count FROM public.connection_registry
  UNION ALL
  SELECT 'intelligence_analyses'::text AS table_name, COUNT(*)::text AS row_count FROM public.intelligence_analyses
  UNION ALL
  SELECT 'intelligence_evidence'::text AS table_name, COUNT(*)::text AS row_count FROM public.intelligence_evidence
  UNION ALL
  SELECT 'intelligence_reports'::text AS table_name, COUNT(*)::text AS row_count FROM public.intelligence_reports
) AS operational_counts
ORDER BY table_name
`;

const isValidPostgresConnectionString = (value: string): boolean => {
  if (!value || value !== value.trim() || /\\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'postgres:' || url.protocol === 'postgresql:')
      && Boolean(url.hostname)
      && !url.hash;
  } catch {
    return false;
  }
};

const defaultNeonPgClientFactory: NeonPgClientFactory = (connectionString) =>
  new Client({
    connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
  }) as unknown as NeonPgClient;

const parseOperationalCounts = (rows: NeonPgQueryResult['rows']): NeonOperationalCounts => {
  if (!Array.isArray(rows) || rows.length !== OPERATIONAL_TABLES.length) {
    throw new Error('Neon did not return exactly six operational table counts.');
  }

  const allowed = new Set<string>(OPERATIONAL_TABLES);
  const counts: Partial<NeonOperationalCounts> = {};

  for (const row of rows) {
    if (!row || typeof row.table_name !== 'string' || !allowed.has(row.table_name)) {
      throw new Error('Neon returned an unknown operational table count.');
    }
    if (Object.hasOwn(counts, row.table_name)) {
      throw new Error('Neon returned a duplicate operational table count.');
    }

    const rawCount = row.row_count;
    const normalizedCount = typeof rawCount === 'number'
      ? String(rawCount)
      : typeof rawCount === 'string'
        ? rawCount
        : '';

    if (!/^(0|[1-9][0-9]*)$/.test(normalizedCount)) {
      throw new Error('Neon returned a non-integer operational row count.');
    }

    const count = Number(normalizedCount);
    if (!Number.isSafeInteger(count)) {
      throw new Error('Neon operational row count exceeds the safe integer range.');
    }

    counts[row.table_name as NeonOperationalTable] = count;
  }

  for (const table of OPERATIONAL_TABLES) {
    if (!Object.hasOwn(counts, table)) {
      throw new Error(`Neon omitted the operational table count for ${table}.`);
    }
  }

  return counts as NeonOperationalCounts;
};

/**
 * Read exact counts for the fixed operational table allowlist through a
 * Cloudflare Hyperdrive binding. This adapter deliberately exposes no
 * arbitrary SQL input and performs no writes.
 */
export const readNeonOperationalCounts = async (
  binding: NeonHyperdriveBinding,
  clientFactory: NeonPgClientFactory = defaultNeonPgClientFactory,
): Promise<NeonOperationalCounts> => {
  const connectionString = typeof binding?.connectionString === 'string'
    ? binding.connectionString
    : '';

  if (!isValidPostgresConnectionString(connectionString)) {
    throw new Error('A valid PostgreSQL Hyperdrive connection string is required.');
  }

  const client = clientFactory(connectionString);
  let connected = false;
  let operationError: unknown;

  try {
    await client.connect();
    connected = true;
    const result = await client.query(OPERATIONAL_COUNTS_SQL);
    return parseOperationalCounts(result.rows);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    if (connected) {
      try {
        await client.end();
      } catch (closeError) {
        if (operationError === undefined) throw closeError;
      }
    }
  }
};
