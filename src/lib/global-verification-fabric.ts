import { discoverGlobalProviders, getGlobalProviderDiscoverySnapshot } from './ai/provider-discovery';
import { reconcileIntegrationControlPlane, getIntegrationControlSnapshot } from './integration-control-plane';
import { getAutonomousAuthenticationVerificationSnapshot, runAutonomousAuthenticationVerification } from './autonomous-auth-verification';
import { getAIFactoryOperationsSnapshot, getAIFactoryOperationsPolicy } from './ai-factory-operations';

const INTERVAL_MS = 10 * 60 * 1000;
let timer: NodeJS.Timeout | null = null;
let running = false;
let inFlight: Promise<void> | null = null;
let cycleCount = 0;
let lastRunAt: string | null = null;
let nextRunAt: string | null = null;
let lastErrors: string[] = [];

async function runCycle(reason: string) {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    cycleCount += 1;
    lastRunAt = new Date().toISOString();
    const errors: string[] = [];

    try { await reconcileIntegrationControlPlane('autonomous-global-verification'); }
    catch (error) { errors.push(`integration-control: ${error instanceof Error ? error.message : String(error)}`); }

    try { await discoverGlobalProviders('autonomous-global-verification'); }
    catch (error) { errors.push(`provider-discovery: ${error instanceof Error ? error.message : String(error)}`); }

    try { await runAutonomousAuthenticationVerification('global-fabric'); }
    catch (error) { errors.push(`authentication-verification: ${error instanceof Error ? error.message : String(error)}`); }

    lastErrors = errors;
    nextRunAt = new Date(Date.now() + INTERVAL_MS).toISOString();
    console.log('[GlobalVerificationFabric] cycle complete', { reason, cycleCount, errors: errors.length, lastRunAt, nextRunAt });
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export function startGlobalVerificationFabric() {
  if (running) return getGlobalVerificationFabricSnapshot();
  running = true;
  void runCycle('startup').catch(error => console.warn('[GlobalVerificationFabric] startup cycle deferred:', error));
  timer = setInterval(() => {
    void runCycle('scheduled').catch(error => console.warn('[GlobalVerificationFabric] scheduled cycle deferred:', error));
  }, INTERVAL_MS);
  nextRunAt = new Date(Date.now() + INTERVAL_MS).toISOString();
  console.log('[GlobalVerificationFabric] 24/7 authorized-system verification fabric initialized.');
  return getGlobalVerificationFabricSnapshot();
}

export function getGlobalVerificationFabricSnapshot() {
  return {
    running,
    cycleCount,
    lastRunAt,
    nextRunAt,
    scope: 'authorized integrations, providers, infrastructure, and connected assets only',
    authenticationVerification: getAutonomousAuthenticationVerificationSnapshot(),
    providerDiscovery: getGlobalProviderDiscoverySnapshot(),
    integrationControl: getIntegrationControlSnapshot(),
    aiFactoryOperations: getAIFactoryOperationsSnapshot(),
    lastErrors,
    policy: {
      automatic: [
        'retry transient provider and integration reconciliation',
        're-run authenticated read-only verification',
        'refresh provider capability discovery',
        'evaluate pre-authorized LOW-risk credential rotations only when the provider-native rotation path preserves permissions and rollback safety',
        'preserve evidence and truthful degraded states'
      ],
      prohibited: [
        'scan or modify unrelated third-party systems',
        'bypass authentication, MFA, OAuth consent, IP restrictions, or access controls',
        'create credentials or rotate credentials outside a pre-authorized LOW-risk rotation policy',
        'trade, withdraw, transfer, or move funds',
        'declare verification without external evidence'
      ],
      aiFactoryOperations: getAIFactoryOperationsPolicy(),
      humanRequired: [
        'new OAuth consent or account linking',
        'new or missing credentials',
        'high-risk credential rotation or permission changes',
        'financial actions',
        'production code changes that require review or deployment approval'
      ]
    }
  };
}

export async function runGlobalVerificationFabricNow(reason = 'authorized-request') {
  await runCycle(reason);
  return getGlobalVerificationFabricSnapshot();
}
