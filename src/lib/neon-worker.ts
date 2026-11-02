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
FROM public.glorifier_worker_operational_counts
ORDER BY table_name
`;

const hasWhitespace = (value: string): boolean => /\s/.test(value);

const parsePostgresConnectionUrl = (value: string): URL | null => {
  if (!value || value !== value.trim() || hasWhitespace(value)) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const isSupportedPostgresUrl = (url: URL): boolean =>
  url.protocol === 'postgres:' || url.protocol === 'postgresql:';

const isValidPostgresConnectionString = (value: string): boolean => {
  const url = parsePostgresConnectionUrl(value);
  return Boolean(url && isSupportedPostgresUrl(url) && url.hostname && !url.hash);
};

const defaultNeonPgClientFactory: NeonPgClientFactory = (connectionString) =>
  new Client({
    connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 5_000,
  }) as unknown as NeonPgClient;

const isOperationalTable = (value: unknown): value is NeonOperationalTable =>
  typeof value === 'string' && OPERATIONAL_TABLES.includes(value as NeonOperationalTable);

const normalizeCountValue = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

const parseNonNegativeCountText = (value: string): number | null => {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
};

const parseSafeNonNegativeCount = (value: unknown): number | null => {
  const normalized = normalizeCountValue(value);
  return normalized === null ? null : parseNonNegativeCountText(normalized);
};

const parseOperationalCountRow = (
  row: NeonPgQueryResult['rows'][number],
): { table: NeonOperationalTable; count: number } | null => {
  if (!row || !isOperationalTable(row.table_name)) return null;
  const count = parseSafeNonNegativeCount(row.row_count);
  return count === null ? null : { table: row.table_name, count };
};

const hasMissingOperationalTable = (counts: Partial<NeonOperationalCounts>): boolean =>
  OPERATIONAL_TABLES.some((table) => !Object.hasOwn(counts, table));

const addOperationalCount = (
  counts: Partial<NeonOperationalCounts>,
  row: NeonPgQueryResult['rows'][number],
): void => {
  const parsed = parseOperationalCountRow(row);
  if (!parsed || Object.hasOwn(counts, parsed.table)) {
    throw new Error('Neon returned an invalid, duplicate, or unexpected operational table count.');
  }
  counts[parsed.table] = parsed.count;
};

const parseOperationalCounts = (rows: NeonPgQueryResult['rows']): NeonOperationalCounts => {
  if (!Array.isArray(rows) || rows.length !== OPERATIONAL_TABLES.length) {
    throw new Error('Neon did not return exactly six operational table counts.');
  }

  const counts: Partial<NeonOperationalCounts> = {};
  rows.forEach((row) => addOperationalCount(counts, row));
  if (hasMissingOperationalTable(counts)) {
    throw new Error('Neon omitted one or more operational table counts.');
  }
  return counts as NeonOperationalCounts;
};

type AsyncResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

const captureAsyncResult = async <T>(
  operation: () => Promise<T>,
): Promise<AsyncResult<T>> => {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error };
  }
};

const executeNeonCountQuery = async (client: NeonPgClient): Promise<NeonOperationalCounts> => {
  let query: AsyncResult<NeonOperationalCounts> = {
    ok: false,
    error: new Error('Neon count query did not execute.'),
  };
  let rollback: AsyncResult<void> | null = null;
  let close: AsyncResult<void> = { ok: true, value: undefined };

  try {
    query = await captureAsyncResult(async () => {
      await client.connect();
      let transactionStarted = false;

      try {
        await client.query('BEGIN READ ONLY');
        transactionStarted = true;
        const result = await client.query(OPERATIONAL_COUNTS_SQL);
        const counts = parseOperationalCounts(result.rows);
        await client.query('COMMIT');
        transactionStarted = false;
        return counts;
      } catch (error) {
        if (transactionStarted) {
          rollback = await captureAsyncResult(async () => {
            await client.query('ROLLBACK');
          });
        }
        throw error;
      }
    });
  } finally {
    close = await captureAsyncResult(() => client.end());
  }

  const errors: unknown[] = [];
  if (!query.ok) errors.push(query.error);
  if (rollback && !rollback.ok) errors.push(rollback.error);
  if (!close.ok) errors.push(close.error);

  if (errors.length > 1) {
    throw new AggregateError(
      errors,
      'Neon count query, rollback, or client cleanup failed.',
    );
  }
  if (errors.length === 1) throw errors[0];
  if (!query.ok) throw query.error;
  return query.value;
};

/**
 * Read exact counts for the fixed operational table allowlist through a
 * Cloudflare Hyperdrive binding. This adapter deliberately exposes no
 * arbitrary SQL input and performs no writes.
 */
export const readNeonOperationalCounts = (
  binding: NeonHyperdriveBinding,
  clientFactory: NeonPgClientFactory = defaultNeonPgClientFactory,
): Promise<NeonOperationalCounts> => {
  const connectionString = typeof binding?.connectionString === 'string'
    ? binding.connectionString
    : '';
  if (!isValidPostgresConnectionString(connectionString)) {
    return Promise.reject(new Error('A valid PostgreSQL Hyperdrive connection string is required.'));
  }

  const client = clientFactory(connectionString);
  return executeNeonCountQuery(client);
};
