import assert from 'node:assert/strict';
import {
  authorizeAgentAction,
  quarantineAgent,
  registerAgent,
  type AgentActionRisk,
  type AgentLifecycle,
} from './agent-control-plane';

function registerTestAgent(
  agentId: string,
  options: { riskLevel?: AgentActionRisk; humanApprovalRequired?: boolean; lifecycle?: AgentLifecycle } = {},
) {
  return registerAgent({
    agentId,
    role: 'test-agent',
    capabilities: ['read.repository', 'tool.invoke', 'deploy.production', 'move.funds', 'custom.unregistered'],
    allowedTools: ['browser'],
    allowedDataScopes: ['public'],
    riskLevel: options.riskLevel ?? 'low',
    lifecycle: options.lifecycle ?? 'active',
    humanApprovalRequired: options.humanApprovalRequired ?? false,
  });
}

registerTestAgent('agent-policy-low');
assert.equal(
  authorizeAgentAction('agent-policy-low', { capability: 'read.repository' }).allowed,
  true,
  'low-risk, policy-approved read capability should remain available',
);

const productionDeploy = authorizeAgentAction('agent-policy-low', {
  capability: 'deploy.production',
  risk: 'low',
  externallyIrreversible: false,
});
assert.equal(productionDeploy.allowed, false, 'client-supplied low risk must not override critical capability policy');
assert.equal(productionDeploy.reason, 'human_authorization_required');

const toolInvoke = authorizeAgentAction('agent-policy-low', {
  capability: 'tool.invoke',
  tool: 'browser',
  dataScope: 'public',
});
assert.equal(toolInvoke.allowed, false, 'policy-required tool approval must not be bypassed by an agent flag');
assert.equal(toolInvoke.reason, 'human_authorization_required');
assert.equal(authorizeAgentAction('agent-policy-low', {
  capability: 'tool.invoke',
  tool: 'browser',
  dataScope: 'public',
  humanAuthorized: true,
}).allowed, true, 'the trusted server-side owner-approval path may authorize a policy-gated action');

const irreversibleRead = authorizeAgentAction('agent-policy-low', {
  capability: 'read.repository',
  externallyIrreversible: true,
});
assert.equal(irreversibleRead.allowed, false, 'externally irreversible actions require approval even for low-risk capabilities');

const unknownPolicy = authorizeAgentAction('agent-policy-low', { capability: 'custom.unregistered' });
assert.equal(unknownPolicy.allowed, false, 'an agent allowlist must not replace the central capability policy');
assert.equal(unknownPolicy.reason, 'capability_policy_missing');

const invalidRisk = authorizeAgentAction('agent-policy-low', {
  capability: 'read.repository',
  risk: 'emergency' as AgentActionRisk,
});
assert.equal(invalidRisk.allowed, false);
assert.equal(invalidRisk.reason, 'invalid_action_risk');

registerTestAgent('agent-always-approval', { humanApprovalRequired: true });
assert.equal(authorizeAgentAction('agent-always-approval', { capability: 'read.repository' }).allowed, false,
  'humanApprovalRequired must apply even to low-risk actions');
assert.equal(authorizeAgentAction('agent-always-approval', {
  capability: 'read.repository',
  humanAuthorized: true,
}).allowed, true);

registerTestAgent('agent-critical', { riskLevel: 'critical' });
assert.equal(authorizeAgentAction('agent-critical', { capability: 'read.repository' }).allowed, false,
  'critical-risk agent identity must not downgrade itself to a low-risk action');

assert.equal(authorizeAgentAction('agent-policy-low', {
  capability: 'read.repository',
  tool: 'shell',
}).reason, 'tool_denied');
assert.equal(authorizeAgentAction('agent-policy-low', {
  capability: 'read.repository',
  dataScope: 'secrets',
}).reason, 'data_scope_denied');

registerTestAgent('agent-paused', { lifecycle: 'paused' });
assert.equal(authorizeAgentAction('agent-paused', { capability: 'read.repository' }).reason, 'agent_paused');
quarantineAgent('agent-policy-low');
assert.equal(authorizeAgentAction('agent-policy-low', { capability: 'read.repository' }).reason, 'agent_quarantined');

assert.equal(authorizeAgentAction('missing-agent', { capability: 'read.repository' }).reason, 'agent_not_registered');

process.stdout.write('Agent control-plane authorization regression tests passed.\n');
