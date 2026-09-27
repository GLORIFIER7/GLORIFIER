export const LINUX_PHILOSOPHY_ARCHITECTURE = {
  roleModel: 'Linux / Unix philosophy',
  ecosystemRoleModel: 'The Internet',
  application: 'intelligence orchestration',
  ecosystemApplication: 'distributed interoperability, discovery, routing, redundancy, and substitution',
  identity: 'Human-governed, provider-neutral intelligence operating architecture.',
  principles: [
    'small, modular components',
    'stable interfaces',
    'replaceable providers and infrastructure',
    'least-privilege capabilities',
    'process and data isolation',
    'event-driven coordination',
    'observability and auditability',
    'durable authoritative state',
    'graceful failure with truthful availability',
    'human authority above consequential execution'
  ],
  mappings: {
    kernel: 'GLORIFIER Control Plane + GEAS',
    processes: 'AI agents, scientists, workers',
    scheduler: 'AI provider, agent, and compute orchestration',
    drivers: 'provider and integration adapters',
    systemCalls: 'governed GLORIFIER APIs',
    capabilities: 'agent capabilities, tools, and data scopes',
    ipc: 'structured agent collaboration and evidence events',
    filesystem: 'Neon/PostgreSQL authoritative state and registries',
    daemons: '24/7 monitoring, discovery, coding, and recovery workers',
    signals: 'event and evidence triggers',
    tracing: 'agent observability and cryptographic provenance',
    hardwareAbstraction: 'compute registry',
    userAuthority: 'human owner final authority'
  },
  invariants: [
    'No single AI provider is the system brain.',
    'Provider failure must produce a truthful unavailable state.',
    'Authentication does not imply authorization.',
    'Authorization is scoped by capability, tool, data scope, and risk.',
    'Irreversible external actions require human authorization.',
    'Estimated value is never verified revenue.',
    'Blockchain is optional trust anchoring, not the primary private-data or revenue store.',
    'Neon remains authoritative for application and economic state.'
  ]
} as const;
