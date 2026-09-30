export type NVIDIAArchitectureMode = 'provider-edge' | 'self-hosted-factory' | 'hybrid-factory';

export interface NVIDIAArchitectureSnapshot {
  architecture: 'GLORIFIER_NVIDIA_GOVERNED_AI_FACTORY';
  sourcePrinciples: string[];
  selectedMode: NVIDIAArchitectureMode;
  planes: {
    governance: string[];
    intelligence: string[];
    inference: string[];
    orchestration: string[];
    observability: string[];
    execution: string[];
    evidence: string[];
  };
  components: {
    nim: { role: string; configured: boolean; verified: boolean };
    nemotron: { role: string; configured: boolean; verified: boolean };
    dynamo: { role: string; configured: boolean; verified: boolean };
    nemoAgentToolkit: { role: string; configured: boolean; verified: boolean };
    runai: { role: string; configured: boolean; verified: boolean };
    missionControl: { role: string; configured: boolean; verified: boolean };
    prometheus: { role: string; configured: boolean; verified: boolean };
    grafana: { role: string; configured: boolean; verified: boolean };
  };
  boundaries: {
    glorifierRemainsSystemBrain: true;
    nvidiaIsProviderAndComputeFabric: true;
    providerNeutralityPreserved: true;
    noCredentialBypass: true;
    noSyntheticEvidence: true;
    noAutonomousFinancialMovement: true;
    mutationRequiresHumanApproval: true;
  };
}

const configured = (name: string) => Boolean((process.env[name] || '').trim());

export function getNVIDIAArchitectureSnapshot(): NVIDIAArchitectureSnapshot {
  const nimConfigured = configured('NVIDIA_API_KEY') || configured('NVIDIA_NIM_BASE_URL');
  const nemotronConfigured = configured('NVIDIA_API_KEY') || configured('NVIDIA_MODEL');
  const dynamoConfigured = configured('NVIDIA_DYNAMO_URL');
  const agentToolkitConfigured = configured('NVIDIA_AGENT_TOOLKIT_URL');
  const runaiConfigured = configured('NVIDIA_RUNAI_URL');
  const missionControlConfigured = configured('NVIDIA_MISSION_CONTROL_URL');
  const prometheusConfigured = configured('FACTORY_PROMETHEUS_URL');
  const grafanaConfigured = configured('FACTORY_GRAFANA_URL');

  return {
    architecture: 'GLORIFIER_NVIDIA_GOVERNED_AI_FACTORY',
    sourcePrinciples: [
      'OpenAI-compatible inference boundary',
      'Kubernetes-native deployment and orchestration',
      'GPU-aware workload scheduling',
      'separate inference, control, observability and evidence concerns',
      'health/readiness driven operations',
      'enterprise observability with Prometheus/Grafana-compatible telemetry',
      'hybrid cloud and on-premises deployment flexibility'
    ],
    // Most suitable for GLORIFIER now: provider-edge. Self-hosted factory components
    // become optional execution capacity rather than hard dependencies.
    selectedMode: 'provider-edge',
    planes: {
      governance: ['GLORIFIER Governance Kernel', 'GEAS', 'Identity/Authority', 'Policy'],
      intelligence: ['AI CEO', 'Permanent Orchestrator', 'Specialist Council', 'Provider Registry'],
      inference: ['NVIDIA NIM', 'Nemotron', 'other authorized GLORIFIER providers'],
      orchestration: ['GLORIFIER execution control', 'Kubernetes when authorized', 'NVIDIA Dynamo when scale requires it', 'Run:ai when GPU scheduling is required'],
      observability: ['Prometheus', 'Grafana', 'GPU telemetry', 'application telemetry'],
      execution: ['governed tools', 'agents', 'workloads', 'human-approved mutations'],
      evidence: ['GLORIFIER evidence ledger', 'audit events', 'verification state', 'outcome records']
    },
    components: {
      nim: { role: 'production inference serving boundary', configured: nimConfigured, verified: false },
      nemotron: { role: 'NVIDIA reasoning/model capability behind the inference boundary', configured: nemotronConfigured, verified: false },
      dynamo: { role: 'optional high-scale distributed inference runtime', configured: dynamoConfigured, verified: false },
      nemoAgentToolkit: { role: 'optional agent development/runtime integration; not the GLORIFIER governance brain', configured: agentToolkitConfigured, verified: false },
      runai: { role: 'optional GPU workload scheduling and utilization layer', configured: runaiConfigured, verified: false },
      missionControl: { role: 'optional AI factory infrastructure/workload operations layer', configured: missionControlConfigured, verified: false },
      prometheus: { role: 'telemetry source for governed verification', configured: prometheusConfigured, verified: false },
      grafana: { role: 'dashboard/context source for governed operations', configured: grafanaConfigured, verified: false }
    },
    boundaries: {
      glorifierRemainsSystemBrain: true,
      nvidiaIsProviderAndComputeFabric: true,
      providerNeutralityPreserved: true,
      noCredentialBypass: true,
      noSyntheticEvidence: true,
      noAutonomousFinancialMovement: true,
      mutationRequiresHumanApproval: true
    }
  };
}

export function getNVIDIAArchitecturePolicy() {
  return {
    architecture: 'NVIDIA_REFERENCE_PRINCIPLES_REFINED_FOR_GLORIFIER',
    selectedDeployment: 'provider-edge-first',
    rationale: [
      'Use NVIDIA immediately as a governed intelligence provider without requiring GLORIFIER to own a GPU cluster.',
      'Keep NVIDIA infrastructure components optional and attach them only when authorized infrastructure exists.',
      'Use the same evidence, identity, policy and audit boundary for NVIDIA as every other provider.',
      'Promote components from configured to verified only after successful authenticated observation.'
    ],
    promotionRule: 'configured -> connected -> authenticated -> observed -> verified',
    failoverRule: 'NVIDIA failure must produce a truthful degraded state and may route only through an explicitly authorized eligible provider.',
    executionRule: 'NVIDIA inference may generate decisions or tool plans, but GLORIFIER governance determines whether execution is authorized.',
    dependencyRule: 'No NVIDIA component is a hard dependency for the GLORIFIER control plane.'
  } as const;
}
