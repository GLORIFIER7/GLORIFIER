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

const parsePostgresConnectionUrl = (value: string): URL | null => {
  if (!value || value !== value.trim() || /\s/.test(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isValidPostgresConnectionString = (value: string): boolean => {
  const url = parsePostgresConnectionUrl(value);
  if (!url) return false;
  const supportedProtocol = url.protocol === 'postgres:' || url.protocol === 'postgresql:';
  return supportedProtocol && Boolean(url.hostname) && !url.hash;
};

const defaultNeonPgClientFactory: NeonPgClientFactory = (connectionString) =>
  new Client({
    connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
  }) as unknown as NeonPgClient;

const isOperationalTable = (value: unknown): value is NeonOperationalTable =>
  typeof value === 'string' && OPERATIONAL_TABLES.includes(value as NeonOperationalTable);

const parseSafeNonNegativeCount = (value: unknown): number | null => {
  const normalized = typeof value === 'number'
    ? String(value)
    : typeof value === 'string'
      ? value
      : null;
  if (normalized === null || !/^(0|[1-9][0-9]*)$/.test(normalized)) return null;
  const count = Number(normalized);
  return Number.isSafeInteger(count) ? count : null;
};

const parseOperationalCountRow = (
  row: NeonPgQueryResult['rows'][number],
): { table: NeonOperationalTable; count: number } | null => {
  if (!row || !isOperationalTable(row.table_name)) return null;
  const count = parseSafeNonNegativeCount(row.row_count);
  return count === null ? null : { table: row.table_name, count };
};

const parseOperationalCounts = (rows: NeonPgQueryResult['rows']): NeonOperationalCounts => {
  if (!Array.isArray(rows) || rows.length !== OPERATIONAL_TABLES.length) {
    throw new Error('Neon did not return exactly six operational table counts.');
  }

  const counts: Partial<NeonOperationalCounts> = {};
  for (const row of rows) {
    const parsed = parseOperationalCountRow(row);
    if (!parsed || Object.hasOwn(counts, parsed.table)) {
      throw new Error('Neon returned an invalid, duplicate, or unexpected operational table count.');
    }
    counts[parsed.table] = parsed.count;
  }

  const hasMissingTable = OPERATIONAL_TABLES.some((table) => !Object.hasOwn(counts, table));
  if (hasMissingTable) throw new Error('Neon omitted one or more operational table counts.');
  return counts as NeonOperationalCounts;
};

const executeNeonCountQuery = async (client: NeonPgClient): Promise<NeonOperationalCounts> => {
  let connected = false;
  let operationFailed = false;
  let operationError: unknown;
  let counts: NeonOperationalCounts | undefined;

  try {
    await client.connect();
    connected = true;
    const result = await client.query(OPERATIONAL_COUNTS_SQL);
    counts = parseOperationalCounts(result.rows);
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }

  if (connected) {
    try {
      await client.end();
    } catch (closeError) {
      if (!operationFailed) {
        operationFailed = true;
        operationError = closeError;
      }
    }
  }

  if (operationFailed) throw operationError;
  if (!counts) throw new Error('Neon operational row counts were not returned.');
  return counts;
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
  return executeNeonCountQuery(client);
};
