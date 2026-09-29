import { randomUUID } from 'node:crypto';
import { getProviderCircuitStatus } from './ai/registry';

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
  { id: 'market-data', name: 'Public market data', kind: 'market-data', enabled: true, healthy: true, capabilities: ['network-metrics', 'market-observation'], lastSeenAt: new Date().toISOString() }
];

let status: MinerStatus = 'PAUSED';
let mode: MinerMode = 'intelligence';
let lastCycle: MinerCycle | null = null;
let cyclesCompleted = 0;

export function getAgentMinerSnapshot() {
  return {
    ok: true,
    name: 'GLORIFIER Agent Miner',
    status,
    mode,
    cadence: 'continuous-24x7',
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
  status = running ? 'RUNNING' : 'PAUSED';
  return getAgentMinerSnapshot();
}

export function setComputeWorkerAuthorization(enabled: boolean) {
  const worker = providers.find((p) => p.id === 'compute-worker');
  if (worker) {
    worker.enabled = enabled;
    if (!enabled) worker.healthy = false;
  }
  if (enabled && mode === 'intelligence') mode = 'authorized-compute';
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
    providersUsed: healthyProviders.map((p) => p.id),
    observations: healthyProviders.length ? 1 : 0,
    workQueued: mode === 'authorized-compute' && providers.some((p) => p.id === 'compute-worker' && p.enabled) ? 1 : 0,
    estimatedRevenueUsd: null,
    verifiedRevenueUsd: null,
    evidence: [
      'Agent Miner records observations and execution evidence; it does not fabricate mining rewards.',
      'AI models are orchestration/intelligence providers, not interchangeable sources of physical mining hashrate.',
      'Actual proof-of-work execution requires an explicitly authorized compute worker.'
    ]
  };

  lastCycle = cycle;
  cyclesCompleted += 1;
  if (!healthyProviders.length) status = 'DEGRADED';
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

