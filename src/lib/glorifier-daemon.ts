import { discoverGlobalProviders } from './ai/provider-discovery';
import { reconcileIntegrationControlPlane } from './integration-control-plane';
import { runAutonomousAuthenticationVerification } from './autonomous-auth-verification';
import { runGlobalVerificationFabricNow } from './global-verification-fabric';
import { runGeasArchitectureScan } from './governance/geas-architecture-scientist';
import { runAgentMinerCycle } from './agent-miner';

type DaemonState = 'STOPPED' | 'RUNNING' | 'DEGRADED';
type ComponentStatus = { name: string; lastRunAt: string | null; lastSuccessAt: string | null; failures: number; lastError: string | null };
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> | null = null;
let state: DaemonState = 'STOPPED';
let cycleCount = 0;
let lastRunAt: string | null = null;
let lastSuccessAt: string | null = null;
let nextRunAt: string | null = null;
let lastErrors: string[] = [];
const components = new Map<string, ComponentStatus>();

function component(name: string): ComponentStatus {
  const existing = components.get(name);
  if (existing) return existing;
  const created: ComponentStatus = { name, lastRunAt: null, lastSuccessAt: null, failures: 0, lastError: null };
  components.set(name, created);
  return created;
}

async function runComponent(name: string, operation: () => Promise<unknown>) {
  const status = component(name);
  status.lastRunAt = new Date().toISOString();
  try { await operation(); status.lastSuccessAt = new Date().toISOString(); status.lastError = null; }
  catch (error) { status.failures += 1; status.lastError = error instanceof Error ? error.message : String(error); throw error; }
}

function getIntervalMs() { return Math.max(60_000, Number(process.env.GLORIFIER_DAEMON_INTERVAL_MS) || DEFAULT_INTERVAL_MS); }

export async function runGlorifierDaemonCycle(reason = 'scheduled') {
  if (inFlight) { await inFlight; return getGlorifierDaemonSnapshot(); }
  inFlight = (async () => {
    cycleCount += 1; lastRunAt = new Date().toISOString();
    const errors: string[] = [];
    const stages: Array<[string, () => Promise<unknown>]> = [
      ['integration-control', () => reconcileIntegrationControlPlane('glorifier-daemon')],
      ['provider-discovery', () => discoverGlobalProviders('glorifier-daemon')],
      ['authentication-verification', () => runAutonomousAuthenticationVerification('glorifier-daemon')],
      ['global-verification', () => runGlobalVerificationFabricNow('glorifier-daemon')],
      ['architecture-scientist', () => runGeasArchitectureScan()],
      ['agent-miner-observation', () => runAgentMinerCycle()]
    ];
    for (const [name, operation] of stages) { try { await runComponent(name, operation); } catch (error) { errors.push(name + ': ' + (error instanceof Error ? error.message : String(error))); } }
    lastErrors = errors;
    if (!errors.length) lastSuccessAt = new Date().toISOString();
    state = errors.length ? 'DEGRADED' : 'RUNNING';
    nextRunAt = new Date(Date.now() + getIntervalMs()).toISOString();
    console.log('[GLORIFIERDaemon] cycle complete', { reason, cycleCount, errors: errors.length, nextRunAt });
  })().finally(() => { inFlight = null; });
  await inFlight;
  return getGlorifierDaemonSnapshot();
}

export function startGlorifierDaemon() {
  if (timer) return getGlorifierDaemonSnapshot();
  if (String(process.env.GLORIFIER_DAEMON_ENABLED || 'true').toLowerCase() === 'false') return getGlorifierDaemonSnapshot();
  state = 'RUNNING';
  void runGlorifierDaemonCycle('startup').catch(error => { state = 'DEGRADED'; console.warn('[GLORIFIERDaemon] startup cycle deferred:', error); });
  timer = setInterval(() => { if (state !== 'STOPPED' && !inFlight) void runGlorifierDaemonCycle('scheduled').catch(error => { state = 'DEGRADED'; console.warn('[GLORIFIERDaemon] scheduled cycle deferred:', error); }); }, getIntervalMs());
  timer.unref?.();
  nextRunAt = new Date(Date.now() + getIntervalMs()).toISOString();
  console.log('[GLORIFIERDaemon] system daemon initialized.');
  return getGlorifierDaemonSnapshot();
}

export function stopGlorifierDaemon() {
  if (timer) clearInterval(timer); timer = null; state = 'STOPPED'; nextRunAt = null;
  return getGlorifierDaemonSnapshot();
}

export function getGlorifierDaemonSnapshot() {
  return { ok: true, name: 'GLORIFIER System Daemon', state, mode: 'continuous-governed-orchestration', cadenceMs: getIntervalMs(), cycleCount, lastRunAt, lastSuccessAt, nextRunAt, inFlight: Boolean(inFlight),
    components: [...components.values()].map(item => ({ ...item })),
    safety: { humanAuthorityRemainsHighest: true, automaticIrreversibleProductionChanges: false, automaticFinancialTransfers: false, automaticCredentialRotation: false, externalSystemScope: 'authorized integrations only', truthRule: 'No qualifying external evidence means UNKNOWN or NOT VERIFIED.', degradedMode: 'Fail independently by component, preserve service and surface evidence gaps.' },
    architecture: ['Governance Kernel / GEAS', 'AI CEO', 'Permanent Orchestrator', 'Provider Registry', 'AI Agent / A2A Network', 'Execution Fabric', 'Verification and Evidence Spine', 'Revenue Control Plane', 'Audit and Economic Truth']
  };
}
