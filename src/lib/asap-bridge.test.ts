import { prepareAsapHandoff } from './asap-bridge';

const base = {
  taskId: 'task-1',
  correlationId: 'trace-1',
  requesterAgentId: 'glorifier-ceo',
  targetAgentId: 'research-agent',
  capability: 'research',
  objective: 'Summarize public protocol documentation',
  risk: 'low' as const,
};

const envEnabled = process.env.GLORIFIER_ASAP_ENABLED;
process.env.GLORIFIER_ASAP_ENABLED = 'true';

try {
  const disabled = prepareAsapHandoff(base, {
    featureEnabled: false, authenticated: true, geasAuthorized: true,
  });
  if (disabled.allowed || disabled.status !== 'DISABLED') throw new Error('feature-off must deny handoff');

  const unauthenticated = prepareAsapHandoff(base, {
    featureEnabled: true, authenticated: false, geasAuthorized: true,
  });
  if (unauthenticated.allowed || unauthenticated.status !== 'BLOCKED') throw new Error('missing identity must deny handoff');

  const unauthorized = prepareAsapHandoff(base, {
    featureEnabled: true, authenticated: true, geasAuthorized: false,
  });
  if (unauthorized.allowed) throw new Error('missing GEAS authorization must deny handoff');

  const missingTaskId = prepareAsapHandoff({ ...base, taskId: '  ' }, {
    featureEnabled: true, authenticated: true, geasAuthorized: true,
  });
  if (missingTaskId.allowed) throw new Error('missing required task fields must deny handoff');

  const unsafeIdentifier = prepareAsapHandoff({ ...base, targetAgentId: 'agent\\nforged' }, {
    featureEnabled: true, authenticated: true, geasAuthorized: true, humanApproved: true,
  });
  if (unsafeIdentifier.allowed) throw new Error('control characters in identifiers must deny handoff');

  const oversizedObjective = prepareAsapHandoff({ ...base, objective: 'x'.repeat(4_001) }, {
    featureEnabled: true, authenticated: true, geasAuthorized: true, humanApproved: true,
  });
  if (oversizedObjective.allowed) throw new Error('oversized objectives must deny handoff');

  const missingRisk = prepareAsapHandoff({ ...base, risk: undefined }, {
    featureEnabled: true, authenticated: true, geasAuthorized: true,
  });
  if (missingRisk.allowed) throw new Error('missing risk must require human approval');

  const unknownCapability = prepareAsapHandoff({ ...base, capability: 'custom-admin-action' }, {
    featureEnabled: true, authenticated: true, geasAuthorized: true,
  });
  if (unknownCapability.allowed) throw new Error('unknown capabilities must require human approval');

  const sensitive = prepareAsapHandoff({ ...base, capability: 'asset-transfer', risk: 'irreversible' }, {
    featureEnabled: true, authenticated: true, geasAuthorized: true,
  });
  if (sensitive.allowed) throw new Error('sensitive action must require human approval');

  const approvedSensitive = prepareAsapHandoff({ ...base, capability: 'asset-transfer', risk: 'irreversible' }, {
    featureEnabled: true, authenticated: true, geasAuthorized: true, humanApproved: true,
  });
  if (!approvedSensitive.allowed || !approvedSensitive.intent?.requiresHumanApproval) {
    throw new Error('approved sensitive intent should be prepared but not executed');
  }

  const allowed = prepareAsapHandoff(base, {
    featureEnabled: true, authenticated: true, geasAuthorized: true,
  });
  if (!allowed.allowed || allowed.intent?.conformance !== 'NOT_VERIFIED') throw new Error('safe intent must preserve unverified status');
  if (allowed.intent?.status !== 'READY_FOR_TRANSPORT') throw new Error('unexpected intent status');

  console.log('ASAP_BRIDGE_TEST_OK', JSON.stringify({ cases: 11, liveTransport: false, conformance: 'NOT_VERIFIED' }));
} finally {
  if (envEnabled === undefined) delete process.env.GLORIFIER_ASAP_ENABLED;
  else process.env.GLORIFIER_ASAP_ENABLED = envEnabled;
}
