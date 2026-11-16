import { getPostgresPool } from '../db/postgres';

export interface RepositoryProviderUsageLimits {
  requestsPerMinute: number;
  requestsPerDay: number;
  maxTokensPerDay: number;
  maxInputTokens: number;
  maxOutputTokens: number;
}

interface QueryResult {
  rowCount?: number | null;
  rows?: unknown[];
}

interface RepositoryProviderBudgetClient {
  query(text: string, values?: unknown[]): Promise<QueryResult>;
  release(): void;
}

interface RepositoryProviderBudgetPool {
  connect(): Promise<RepositoryProviderBudgetClient>;
}

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Create a durable local counter. Vendor-side free caps and disabled billing remain mandatory. */
export async function initializeRepositoryProviderBudget(): Promise<void> {
  const db = getPostgresPool();
  await db.query("CREATE TABLE IF NOT EXISTS glorifier_repository_provider_usage (provider_id TEXT NOT NULL, window_kind TEXT NOT NULL CHECK (window_kind IN ('minute', 'day')), window_started_at TIMESTAMPTZ NOT NULL, requests_used INTEGER NOT NULL DEFAULT 0 CHECK (requests_used >= 0), tokens_reserved BIGINT NOT NULL DEFAULT 0 CHECK (tokens_reserved >= 0), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (provider_id, window_kind, window_started_at))");
  await db.query('CREATE INDEX IF NOT EXISTS glorifier_repository_provider_usage_window_idx ON glorifier_repository_provider_usage (window_started_at)');
  await db.query("DELETE FROM glorifier_repository_provider_usage WHERE window_started_at < NOW() - INTERVAL '3 days'");
}

function validateLimits(limits: RepositoryProviderUsageLimits): void {
  const requiredLimits: Array<keyof RepositoryProviderUsageLimits> = [
    'requestsPerMinute',
    'requestsPerDay',
    'maxTokensPerDay',
    'maxInputTokens',
    'maxOutputTokens',
  ];
  for (const key of requiredLimits) {
    if (!isPositiveInteger(limits[key])) {
      throw new Error('Repository provider usage limit ' + key + ' must be a positive integer.');
    }
  }
  if (limits.maxTokensPerDay < limits.maxOutputTokens) {
    throw new Error('Daily token allowance must cover at least one maximum-output reservation.');
  }
}

/**
 * Atomically reserve one provider request against minute/day ceilings before
 * the provider call. This is a conservative reservation: estimated input bytes
 * plus the full requested output-token ceiling are charged to the local daily
 * token counter. Failed requests remain counted, avoiding quota-reset abuse.
 */
export async function reserveRepositoryProviderRequest({
  providerId,
  limits,
  inputTokenUpperBound,
  now = new Date(),
  pool = getPostgresPool() as unknown as RepositoryProviderBudgetPool
}: {
  providerId: string;
  limits: RepositoryProviderUsageLimits;
  inputTokenUpperBound: number;
  now?: Date;
  pool?: RepositoryProviderBudgetPool;
}): Promise<{ providerId: string; inputTokenUpperBound: number; maxOutputTokens: number; reservedTokens: number }> {
  if (typeof providerId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(providerId)) {
    throw new Error('Repository provider ID is invalid.');
  }
  validateLimits(limits);
  if (!isPositiveInteger(inputTokenUpperBound) || inputTokenUpperBound > limits.maxInputTokens) {
    throw new Error('Repository contribution exceeds the owner-attested maximum input-token limit.');
  }
  const reservedTokens = inputTokenUpperBound + limits.maxOutputTokens;
  if (!Number.isSafeInteger(reservedTokens) || reservedTokens > limits.maxTokensPerDay) {
    throw new Error('One repository contribution exceeds the owner-attested daily token budget.');
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error('Repository provider quota clock is invalid.');
  }

  const minuteStart = new Date(now);
  minuteStart.setUTCSeconds(0, 0);
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query('BEGIN');
    inTransaction = true;
    // Periodic-on-write cleanup keeps long-lived workers from retaining expired
    // minute/day quota windows indefinitely after their one-time startup pass.
    await client.query("DELETE FROM glorifier_repository_provider_usage WHERE window_started_at < NOW() - INTERVAL '3 days'");

    const reserveWindow = async (
      kind: 'minute' | 'day',
      windowStart: Date,
      maxRequests: number,
      maxTokens: number | null
    ): Promise<void> => {
      const result = await client.query(
        'INSERT INTO glorifier_repository_provider_usage (provider_id, window_kind, window_started_at, requests_used, tokens_reserved, updated_at) VALUES ($1, $2, $3, 1, $4, NOW()) ON CONFLICT (provider_id, window_kind, window_started_at) DO UPDATE SET requests_used = glorifier_repository_provider_usage.requests_used + 1, tokens_reserved = glorifier_repository_provider_usage.tokens_reserved + $4, updated_at = NOW() WHERE glorifier_repository_provider_usage.requests_used < $5 AND ($6::BIGINT IS NULL OR glorifier_repository_provider_usage.tokens_reserved + $4 <= $6) RETURNING requests_used',
        [providerId, kind, windowStart.toISOString(), reservedTokens, maxRequests, maxTokens]
      );
      if ((result.rowCount ?? result.rows?.length ?? 0) !== 1) {
        throw new Error('Repository provider ' + providerId + ' free ' + kind + ' quota is exhausted; provider execution was blocked.');
      }
    };

    await reserveWindow('minute', minuteStart, limits.requestsPerMinute, null);
    await reserveWindow('day', dayStart, limits.requestsPerDay, limits.maxTokensPerDay);
    await client.query('COMMIT');
    inTransaction = false;
    return { providerId, inputTokenUpperBound, maxOutputTokens: limits.maxOutputTokens, reservedTokens };
  } catch (error) {
    if (inTransaction) {
      try { await client.query('ROLLBACK'); } catch { /* retain the original reservation error */ }
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Conservative byte-based upper bound prevents large prompts from bypassing a token cap. */
export function estimateRepositoryInputTokenUpperBound(messages: readonly { role: string; content: string }[]): number {
  if (!Array.isArray(messages) || messages.length === 0) throw new Error('Repository contribution messages are required.');
  const bytes = messages.reduce((total, message) => {
    if (!message || typeof message.role !== 'string' || !message.role.trim() ||
        typeof message.content !== 'string') {
      throw new Error('Repository contribution messages must contain a valid role and text.');
    }
    // UTF-8 byte count is a conservative content estimate. Add explicit per-
    // message role/framing overhead plus fixed conversation framing because
    // providers count their own message boundaries and role tokens too.
    return total + Buffer.byteLength(message.role, 'utf8')
      + Buffer.byteLength(message.content, 'utf8') + 32;
  }, 16);
  if (!Number.isSafeInteger(bytes) || bytes <= 0) throw new Error('Repository contribution input size is invalid.');
  return bytes;
}
