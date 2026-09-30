import { getGlobalProviderDiscoverySnapshot } from './ai/provider-discovery';
import { getNVIDIAArchitectureSnapshot, getNVIDIAArchitecturePolicy } from './nvidia-architecture';

export type FactorySignalStatus = 'verified' | 'configured' | 'unavailable' | 'not-configured';

export interface FactorySignal {
  id: 'kubernetes' | 'prometheus' | 'grafana' | 'slurm' | 'nvidia-mission-control' | 'nvidia-base-command-manager';
  name: string;
  status: FactorySignalStatus;
  endpoint: string | null;
  readOnly: true;
  evidence: boolean;
  reason: string;
}

export interface FactoryOperationsSnapshot {
  blueprint: 'NVIDIA_AI_FACTORY_OPERATIONS_AGENT';
  runtime: 'GLORIFIER_GOVERNED_FACTORY_OPERATIONS';
  mode: 'read-only';
  governed: true;
  auditable: true;
  nvidiaArchitecture: ReturnType<typeof getNVIDIAArchitectureSnapshot>;
  agentRuntime: {
    provider: string | null;
    model: string | null;
    status: 'available' | 'unavailable';
  };
  signals: FactorySignal[];
  capabilities: string[];
  safety: {
    noClusterMutation: true;
    noCredentialBypass: true;
    noSyntheticEvidence: true;
    humanApprovalRequiredForMutation: true;
  };
  lastCheckedAt: string;
}

const endpoint = (name: string) => (process.env[name] || '').trim().replace(/\/$/, '');

function configuredSignal(
  id: FactorySignal['id'],
  name: string,
  envName: string,
  reasonWhenMissing: string,
): FactorySignal {
  const value = endpoint(envName);
  return {
    id,
    name,
    status: value ? 'configured' : 'not-configured',
    endpoint: value || null,
    readOnly: true,
    evidence: false,
    reason: value
      ? 'Endpoint configured; live external evidence has not yet been collected.'
      : reasonWhenMissing,
  };
}

export function getAIFactoryOperationsSnapshot(): FactoryOperationsSnapshot {
  const providers = getGlobalProviderDiscoverySnapshot()
    .filter((p) => p.authenticated && p.availability === 'available');
  const preferred =
    providers.find((p) => p.id === 'nvidia') ||
    providers.find((p) => p.capabilities.includes('agent')) ||
    providers[0];

  return {
    blueprint: 'NVIDIA_AI_FACTORY_OPERATIONS_AGENT',
    runtime: 'GLORIFIER_GOVERNED_FACTORY_OPERATIONS',
    mode: 'read-only',
    governed: true,
    auditable: true,
    nvidiaArchitecture: getNVIDIAArchitectureSnapshot(),
    agentRuntime: {
      provider: preferred?.name || null,
      model: preferred?.models?.[0] || null,
      status: preferred ? 'available' : 'unavailable',
    },
    signals: [
      configuredSignal('kubernetes', 'Kubernetes API', 'FACTORY_KUBERNETES_URL', 'No Kubernetes API endpoint configured.'),
      configuredSignal('prometheus', 'Prometheus', 'FACTORY_PROMETHEUS_URL', 'No Prometheus endpoint configured.'),
      configuredSignal('grafana', 'Grafana', 'FACTORY_GRAFANA_URL', 'No Grafana endpoint configured.'),
      configuredSignal('slurm', 'Slurm', 'FACTORY_SLURM_URL', 'No Slurm evidence endpoint configured.'),
      configuredSignal('nvidia-mission-control', 'NVIDIA Mission Control', 'NVIDIA_MISSION_CONTROL_URL', 'Mission Control integration is optional and not configured.'),
      configuredSignal('nvidia-base-command-manager', 'NVIDIA Base Command Manager', 'NVIDIA_BCM_URL', 'Base Command Manager integration is optional and not configured.'),
    ],
    capabilities: [
      'cluster-health-summary',
      'kubernetes-read-only-inspection',
      'prometheus-observability',
      'grafana-dashboard-context',
      'slurm-job-root-cause-analysis',
      'gpu-telemetry-correlation',
      'runbook-assisted-root-cause-analysis',
      'governed-agent-chat',
      'auditable-evidence-correlation',
      'nvidia-nim-inference',
      'nemotron-reasoning',
      'optional-dynamo-inference-scaling',
      'optional-runai-gpu-scheduling',
    ],
    safety: {
      noClusterMutation: true,
      noCredentialBypass: true,
      noSyntheticEvidence: true,
      humanApprovalRequiredForMutation: true,
    },
    lastCheckedAt: new Date().toISOString(),
  };
}

export function getAIFactoryOperationsPolicy() {
  return {
    architecture: 'NVIDIA_BLUEPRINT_ADAPTED_TO_GLORIFIER_GOVERNANCE',
    sourceBlueprint: 'NVIDIA AI Factory Operations Agent',
    providerNeutral: true,
    supportedInference: 'NVIDIA Nemotron/NIM or another authorized provider-neutral model endpoint',
    executionBoundary: 'Only explicitly configured, authorized, read-only factory endpoints may be inspected.',
    evidenceRule: 'Configuration is not evidence. A signal becomes verified only after a successful authenticated read-only observation is recorded.',
    mutationRule: 'Cluster changes, workload changes, credential changes, or infrastructure mutations require an explicitly authorized execution path and human approval.',
    failClosed: true,
    nvidiaArchitecture: getNVIDIAArchitecturePolicy(),
  } as const;
}
