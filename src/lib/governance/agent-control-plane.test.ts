import assert from 'node:assert/strict';
import {
  authorizeAgentAction,
  getAgent,
  listControlledAgents,
  quarantineAgent,
  registerAgent,
  type AgentActionRisk,
  type AgentLifecycle,
} from './agent-control-plane';
import test from 'node:test';

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

test('low-risk read access is allowed but critical capabilities remain gated', () => {
  registerTestAgent('agent-policy-low');
  assert.equal(authorizeAgentAction('agent-policy-low', { capability: 'read.repository' }).allowed, true);
  const productionDeploy = authorizeAgentAction('agent-policy-low', {
    capability: 'deploy.production', risk: 'low', externallyIrreversible: false,
  });
  assert.equal(productionDeploy.allowed, false);
  assert.equal(productionDeploy.reason, 'human_authorization_required');
  const unknownPolicy = authorizeAgentAction('agent-policy-low', { capability: 'custom.unregistered' });
  assert.equal(unknownPolicy.allowed, false);
  assert.equal(unknownPolicy.reason, 'capability_policy_missing');
});

test('tool and irreversible actions require trusted human authorization', () => {
  const toolInvoke = authorizeAgentAction('agent-policy-low', {
    capability: 'tool.invoke', tool: 'browser', dataScope: 'public',
  });
  assert.equal(toolInvoke.allowed, false);
  assert.equal(toolInvoke.reason, 'human_authorization_required');
  assert.equal(authorizeAgentAction('agent-policy-low', {
    capability: 'tool.invoke', tool: 'browser', dataScope: 'public', humanAuthorized: true,
  }).allowed, true);
  const irreversibleRead = authorizeAgentAction('agent-policy-low', {
    capability: 'read.repository', externallyIrreversible: true,
  });
  assert.equal(irreversibleRead.allowed, false);
});

test('invalid risk and agent-level approval requirements fail closed', () => {
  const invalidRisk = authorizeAgentAction('agent-policy-low', {
    capability: 'read.repository', risk: 'emergency' as AgentActionRisk,
  });
  assert.equal(invalidRisk.allowed, false);
  assert.equal(invalidRisk.reason, 'invalid_action_risk');
  registerTestAgent('agent-always-approval', { humanApprovalRequired: true });
  assert.equal(authorizeAgentAction('agent-always-approval', { capability: 'read.repository' }).allowed, false);
  assert.equal(authorizeAgentAction('agent-always-approval', {
    capability: 'read.repository', humanAuthorized: true,
  }).allowed, true);
});

test('critical lifecycle, tool and data-scope restrictions cannot be bypassed', () => {
  registerTestAgent('agent-critical', { riskLevel: 'critical' });
  assert.equal(authorizeAgentAction('agent-critical', { capability: 'read.repository' }).allowed, false);
  assert.equal(authorizeAgentAction('agent-policy-low', { capability: 'read.repository', tool: 'shell' }).reason, 'tool_denied');
  assert.equal(authorizeAgentAction('agent-policy-low', { capability: 'read.repository', dataScope: 'secrets' }).reason, 'data_scope_denied');
  registerTestAgent('agent-paused', { lifecycle: 'paused' });
  assert.equal(authorizeAgentAction('agent-paused', { capability: 'read.repository' }).reason, 'agent_paused');
  quarantineAgent('agent-policy-low');
  assert.equal(authorizeAgentAction('agent-policy-low', { capability: 'read.repository' }).reason, 'agent_quarantined');
  assert.equal(authorizeAgentAction('missing-agent', { capability: 'read.repository' }).reason, 'agent_not_registered');
});


test('agent registration copies caller-owned policy arrays', () => {
  const input = {
    agentId: 'agent-input-array-isolation',
    role: 'test-agent',
    capabilities: ['read.repository'],
    allowedTools: ['browser'],
    allowedDataScopes: ['public'],
    riskLevel: 'low' as AgentActionRisk,
    lifecycle: 'active' as AgentLifecycle,
    humanApprovalRequired: true,
  };
  registerAgent(input);

  input.capabilities.push('tool.invoke');
  input.allowedTools.push('shell');
  input.allowedDataScopes.push('secrets');

  assert.equal(
    authorizeAgentAction(input.agentId, {
      capability: 'tool.invoke',
      tool: 'shell',
      dataScope: 'secrets',
      humanAuthorized: true,
    }).reason,
    'capability_denied',
  );
  assert.equal(
    authorizeAgentAction(input.agentId, {
      capability: 'read.repository',
      tool: 'shell',
      humanAuthorized: true,
    }).reason,
    'tool_denied',
  );
  assert.equal(
    authorizeAgentAction(input.agentId, {
      capability: 'read.repository',
      dataScope: 'secrets',
      humanAuthorized: true,
    }).reason,
    'data_scope_denied',
  );
});

test('registerAgent returns a defensive copy of authorization policy', () => {
  const registered = registerTestAgent('agent-register-result-isolation', { humanApprovalRequired: true });
  registered.humanApprovalRequired = false;
  registered.lifecycle = 'revoked';
  registered.capabilities.push('capability.injected');
  registered.allowedTools.push('shell');
  registered.allowedDataScopes.push('secrets');

  assert.equal(
    authorizeAgentAction('agent-register-result-isolation', { capability: 'read.repository' }).reason,
    'human_authorization_required',
  );
  assert.equal(
    authorizeAgentAction('agent-register-result-isolation', {
      capability: 'capability.injected',
      tool: 'shell',
      dataScope: 'secrets',
      humanAuthorized: true,
    }).reason,
    'capability_denied',
  );
  assert.equal(
    authorizeAgentAction('agent-register-result-isolation', {
      capability: 'tool.invoke',
      tool: 'shell',
      dataScope: 'public',
      humanAuthorized: true,
    }).reason,
    'tool_denied',
  );
  assert.equal(
    authorizeAgentAction('agent-register-result-isolation', {
      capability: 'tool.invoke',
      tool: 'browser',
      dataScope: 'secrets',
      humanAuthorized: true,
    }).reason,
    'data_scope_denied',
  );
});

test('getAgent and listControlledAgents never expose mutable registry entries', () => {
  registerTestAgent('agent-read-result-isolation', { humanApprovalRequired: true });

  const fetched = getAgent('agent-read-result-isolation');
  assert.ok(fetched);
  fetched.humanApprovalRequired = false;
  fetched.lifecycle = 'revoked';
  fetched.capabilities.push('capability.injected');
  fetched.allowedTools.push('shell');
  fetched.allowedDataScopes.push('secrets');

  const listed = listControlledAgents().find((agent) => agent.agentId === 'agent-read-result-isolation');
  assert.ok(listed);
  listed.humanApprovalRequired = false;
  listed.lifecycle = 'paused';
  listed.capabilities.push('capability.injected');
  listed.allowedTools.push('shell');
  listed.allowedDataScopes.push('secrets');

  assert.equal(
    authorizeAgentAction('agent-read-result-isolation', { capability: 'read.repository' }).reason,
    'human_authorization_required',
  );
  assert.equal(
    authorizeAgentAction('agent-read-result-isolation', {
      capability: 'capability.injected',
      tool: 'shell',
      dataScope: 'secrets',
      humanAuthorized: true,
    }).reason,
    'capability_denied',
  );
  assert.equal(
    authorizeAgentAction('agent-read-result-isolation', { capability: 'read.repository' }).reason,
    'human_authorization_required',
  );
});

test('quarantineAgent returns a deep defensive copy without changing stored policy', () => {
  registerTestAgent('agent-quarantine-result-isolation', { humanApprovalRequired: true });
  const quarantined = quarantineAgent('agent-quarantine-result-isolation');
  assert.ok(quarantined);

  quarantined.lifecycle = 'active';
  quarantined.humanApprovalRequired = false;
  quarantined.capabilities.push('capability.injected');
  quarantined.allowedTools.push('shell');
  quarantined.allowedDataScopes.push('secrets');

  const stored = getAgent('agent-quarantine-result-isolation');
  assert.ok(stored);
  assert.equal(stored.lifecycle, 'quarantined');
  assert.equal(stored.humanApprovalRequired, true);
  assert.deepEqual(stored.capabilities, [
    'read.repository', 'tool.invoke', 'deploy.production', 'move.funds', 'custom.unregistered',
  ]);
  assert.deepEqual(stored.allowedTools, ['browser']);
  assert.deepEqual(stored.allowedDataScopes, ['public']);
  assert.equal(
    authorizeAgentAction('agent-quarantine-result-isolation', { capability: 'read.repository' }).reason,
    'agent_quarantined',
  );
});
