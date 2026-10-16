import { randomUUID } from 'node:crypto';

type TraceSummary = Record<string, unknown>;
type LangSmithEndpoint = 'https://api.smith.langchain.com' | 'https://eu.api.smith.langchain.com';
type LangSmithConfig = { apiKey: string; endpoint: LangSmithEndpoint; project: string; workspaceId?: string };

function getConfig(): LangSmithConfig | null {
  if (process.env.LANGSMITH_TRACING !== 'true') return null;
  const apiKey = process.env.LANGSMITH_API_KEY?.trim();
  if (!apiKey) return null;

  const configuredEndpoint = (process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com').trim().replace(/\/+$/, '');
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(configuredEndpoint);
  } catch {
    return null;
  }
  const allowedHosts = new Set(['api.smith.langchain.com', 'eu.api.smith.langchain.com']);
  if (
    parsedEndpoint.protocol !== 'https:' ||
    !allowedHosts.has(parsedEndpoint.hostname) ||
    (parsedEndpoint.pathname !== '' && parsedEndpoint.pathname !== '/') ||
    parsedEndpoint.username !== '' ||
    parsedEndpoint.password !== '' ||
    parsedEndpoint.search !== '' ||
    parsedEndpoint.hash !== '' ||
    (parsedEndpoint.port !== '' && parsedEndpoint.port !== '443')
  ) {
    return null;
  }

  return {
    apiKey,
    // Map validated hosts to fixed origins so no caller-controlled URL reaches fetch().
    endpoint: parsedEndpoint.hostname === 'eu.api.smith.langchain.com'
      ? 'https://eu.api.smith.langchain.com'
      : 'https://api.smith.langchain.com',
    project: (process.env.LANGSMITH_PROJECT || 'GLORIFIER').trim() || 'GLORIFIER',
    workspaceId: process.env.LANGSMITH_WORKSPACE_ID?.trim() || undefined,
  };
}

function isoNow(date: Date): string {
  return date.toISOString();
}

async function submitTrace(config: LangSmithConfig, payload: Record<string, unknown>): Promise<void> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': config.apiKey,
  };
  if (config.workspaceId) headers['x-tenant-id'] = config.workspaceId;

  try {
    const runsUrl = config.endpoint === 'https://eu.api.smith.langchain.com'
      ? 'https://eu.api.smith.langchain.com/runs'
      : 'https://api.smith.langchain.com/runs';
    await fetch(runsUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(1200),
    });
  } catch {
    // Observability is best-effort and must never break GLORIFIER inference.
  }
}

/**
 * Records metadata-only LangSmith spans. Prompt text, model output, raw errors,
 * credentials, and request bodies are deliberately never sent to LangSmith.
 */
export async function withLangSmithTrace<T>(
  name: string,
  inputs: TraceSummary,
  operation: () => Promise<T>,
  summarize: (result: T) => TraceSummary = () => ({ completed: true }),
): Promise<T> {
  const config = getConfig();
  if (!config) return operation();

  const id = randomUUID();
  const startedAt = new Date();
  let outputs: TraceSummary | undefined;
  let error: string | undefined;

  try {
    const result = await operation();
    try {
      outputs = summarize(result);
    } catch {
      // Telemetry summarization must never turn a successful inference into a failure.
      outputs = { completed: true };
    }
    return result;
  } catch (cause) {
    error = 'operation_failed';
    throw cause;
  } finally {
    const endedAt = new Date();
    const payload: Record<string, unknown> = {
      id,
      name,
      run_type: 'chain',
      session_name: config.project,
      start_time: isoNow(startedAt),
      end_time: isoNow(endedAt),
      inputs,
      tags: ['glorifier', 'metadata-only'],
      extra: { metadata: { service: 'GLORIFIER', telemetry_mode: 'metadata-only' } },
    };
    if (outputs) payload.outputs = outputs;
    if (error) payload.error = error;
    // Never block inference on telemetry; submitTrace is bounded and self-contained.
    void submitTrace(config, payload).catch(() => undefined);
  }
}
