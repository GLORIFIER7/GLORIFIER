import { randomUUID } from 'node:crypto';
import { getProviderCircuitStatus } from './ai/registry';
import { loadAgentMinerState, persistAgentMinerCycle, persistAgentMinerState } from './agent-miner-state';

export type MinerMode = 'intelligence' | 'authorized-compute';
export type MinerStatus = 'RUNNING' | 'PAUSED' | 'DEGRADED' | 'STOPPED';

export interface MiningProvider {
  id: string;
  name: string;
  kind: 'ai-model' | 'compute-worker' | 'mining-pool' | 'market-data';
  enabled: boolean;
  healthy: boolean;
  capabilities: string[];
  lastSeenAt: string | null;
}

export interface MinerCycle {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: 'completed' | 'degraded';
  providersUsed: string[];
  observations: number;
  workQueued: number;
  estimatedRevenueUsd: number | null;
  verifiedRevenueUsd: number | null;
  evidence: string[];
}

const providers: MiningProvider[] = [
  { id: 'openai', name: 'OpenAI', kind: 'ai-model', enabled: true, healthy: false, capabilities: ['analysis', 'planning', 'verification'], lastSeenAt: null },
  { id: 'gemini', name: 'Google Gemini', kind: 'ai-model', enabled: true, healthy: false, capabilities: ['analysis', 'planning', 'verification'], lastSeenAt: null },
  { id: 'anthropic', name: 'Anthropic', kind: 'ai-model', enabled: true, healthy: false, capabilities: ['analysis', 'planning', 'verification'], lastSeenAt: null },
  { id: 'openrouter', name: 'OpenRouter', kind: 'ai-model', enabled: true, healthy: false, capabilities: ['routing', 'analysis', 'provider-discovery'], lastSeenAt: null },
  { id: 'local', name: 'Authorized local model', kind: 'ai-model', enabled: true, healthy: false, capabilities: ['private-analysis', 'planning'], lastSeenAt: null },
  { id: 'compute-worker', name: 'Authorized compute worker', kind: 'compute-worker', enabled: false, healthy: false, capabilities: ['proof-of-work', 'benchmarking'], lastSeenAt: null },
  { id: 'market-data', name: 'Public market data', kind: 'market-data', enabled: true, healthy: false, capabilities: ['network-metrics', 'market-observation'], lastSeenAt: null }
];

let status: MinerStatus = 'PAUSED';
let mode: MinerMode = 'intelligence';
let lastCycle: MinerCycle | null = null;
let cyclesCompleted = 0;
let computeAuthorized = false;

export async function restoreAgentMinerState() {
  try {
    const saved = await loadAgentMinerState();
    if (!saved) return getAgentMinerSnapshot();
    status = saved.status === 'RUNNING' ? 'PAUSED' : saved.status as MinerStatus;
    mode = saved.mode as MinerMode;
    computeAuthorized = Boolean(saved.compute_authorized);
    const worker = providers.find((p) => p.id === 'compute-worker');
    if (worker) worker.enabled = computeAuthorized;
  } catch (error) {
    // Fail closed in memory, then propagate the persistence failure so the
    // backend readiness gate cannot mistake an unsuccessful state restore for success.
    computeAuthorized = false;
    const worker = providers.find((p) => p.id === 'compute-worker');
    if (worker) worker.enabled = false;
    throw error;
  }
  return getAgentMinerSnapshot();
}

export function getAgentMinerSnapshot() {
  return {
    ok: true,
    name: 'GLORIFIER Agent Miner',
    status,
    mode,
    cadence: daemonTimer ? 'Daemon timer configured; execution is runtime-reported' : 'NOT CONFIGURED — no active daemon timer',
    cyclesCompleted,
    lastCycle,
    providers: providers.map((p) => ({ ...p })),
    safety: {
      humanAuthorizationRequiredForCompute: true,
      custody: 'none',
      automaticFundMovement: false,
      guaranteedReturns: false,
      verificationRule: 'No qualifying external evidence means revenue remains unverified.'
    }
  };
}

export function setAgentMinerRunning(running: boolean, requestedMode?: MinerMode) {
  if (requestedMode) mode = requestedMode;
  if (running && !daemonTimer) {
    status = 'PAUSED';
    void persistAgentMinerState(status, mode, computeAuthorized).catch(() => undefined);
    return { ...getAgentMinerSnapshot(), actionError: 'The background daemon is not configured or running; Agent Miner cannot be marked RUNNING.' };
  }
  status = running ? 'RUNNING' : 'PAUSED';
  void persistAgentMinerState(status, mode, computeAuthorized).catch(() => undefined);
  return getAgentMinerSnapshot();
}

export function setComputeWorkerAuthorization(enabled: boolean) {
  const worker = providers.find((p) => p.id === 'compute-worker');
  if (worker) {
    worker.enabled = enabled;
    if (!enabled) worker.healthy = false;
    computeAuthorized = enabled;
  }
  if (enabled && mode === 'intelligence') mode = 'authorized-compute';
  if (!enabled && mode === 'authorized-compute') mode = 'intelligence';
  void persistAgentMinerState(status, mode, computeAuthorized).catch(() => undefined);
  return getAgentMinerSnapshot();
}

export async function runAgentMinerCycle(): Promise<MinerCycle> {
  const startedAt = new Date().toISOString();
  const id = randomUUID();
  // Provider Registry is authoritative for AI-provider availability. The miner never
  // claims a provider is healthy merely because a configuration entry exists.
  const registry = new Map(getProviderCircuitStatus().map((p) => [p.id, p]));
  const enabledProviders = providers.filter((p) => p.enabled && (p.kind !== 'compute-worker' || mode === 'authorized-compute'));
  const healthyProviders = enabledProviders.filter((p) => {
    if (p.kind === 'market-data') return p.healthy;
    if (p.kind !== 'ai-model') return p.healthy;
    const state = registry.get(p.id);
    return state?.configured === true && state.circuit === 'available';
  });

  const cycle: MinerCycle = {
    id,
    startedAt,
    completedAt: new Date().toISOString(),
    status: healthyProviders.length ? 'completed' : 'degraded',
    providersUsed: [],
    observations: healthyProviders.length ? 1 : 0,
    workQueued: 0,
    estimatedRevenueUsd: null,
    verifiedRevenueUsd: null,
    evidence: [
      'This cycle inspected the local provider-circuit registry; it did not invoke an AI provider or compute worker.',
      'AI models are orchestration/intelligence providers, not sources of physical mining hashrate.',
      'No work item was queued, no proof-of-work was executed, and no revenue was generated by this cycle.'
    ]
  };

  lastCycle = cycle;
  cyclesCompleted += 1;
  if (!healthyProviders.length) status = 'DEGRADED';
  void persistAgentMinerCycle(cycle).catch(() => undefined);
  void persistAgentMinerState(status, mode, computeAuthorized).catch(() => undefined);
  return cycle;
}

let daemonTimer: ReturnType<typeof setInterval> | null = null;

export function startAgentMinerDaemon() {
  if (process.env.AGENT_MINER_DAEMON !== 'true' || daemonTimer) return;
  if (status === 'STOPPED') return;
  status = 'RUNNING';
  const intervalMs = Math.max(60_000, Number(process.env.AGENT_MINER_INTERVAL_MS) || 300_000);
  void runAgentMinerCycle().catch(() => { status = 'DEGRADED'; });
  daemonTimer = setInterval(() => {
    if (status !== 'RUNNING') return;
    void runAgentMinerCycle().catch(() => { status = 'DEGRADED'; });
  }, intervalMs);
}

