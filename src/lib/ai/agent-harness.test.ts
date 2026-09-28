import { strict as assert } from 'node:assert';
import {
  authorizeToolRequest,
  executeAgentTurn,
  createAgentSession,
  getAgentSession,
  type AgentToolRequest,
  type HumanToolApproval,
} from './agent-harness.ts';

const capability = new Set(['mcp-tool']);
const lowRisk: AgentToolRequest = { id: 'read-1', name: 'read', risk: 'low', capability: 'mcp-tool' };
const dangerous: AgentToolRequest = { id: 'delete-1', name: 'delete', risk: 'irreversible', capability: 'mcp-tool' };

const normal = authorizeToolRequest(lowRisk, capability);
assert.equal(normal.allowed, true);

const blocked = authorizeToolRequest(dangerous, capability);
assert.equal(blocked.allowed, false);
assert.equal(blocked.requiresHumanApproval, true);

const approval: HumanToolApproval = {
  toolId: dangerous.id,
  approved: true,
  approvedBy: 'human',
  approvedAt: new Date().toISOString(),
};

const approved = authorizeToolRequest(dangerous, capability, approval);
assert.equal(approved.allowed, true);
assert.equal(approved.requiresHumanApproval, false);

const missingCapability = authorizeToolRequest(dangerous, new Set(), approval);
assert.equal(missingCapability.allowed, false);
assert.equal(missingCapability.requiresHumanApproval, false);

const session = createAgentSession('harness-test');
await assert.rejects(
  () => executeAgentTurn({ session, contextTokens: 100, tools: [dangerous], approvedCapabilities: capability, run: async () => 'must-not-run' }),
  /Tool approval required/,
);
assert.equal(getAgentSession(session.id)?.status, 'waiting-approval');

const approvedSession = createAgentSession('harness-test-approved');
let executed = false;
const result = await executeAgentTurn({
  session: approvedSession,
  contextTokens: 100,
  tools: [dangerous],
  approvedCapabilities: capability,
  humanApproval: approval,
  run: async () => {
    executed = true;
    return 'executed';
  },
});
assert.equal(executed, true);
assert.equal(result.result, 'executed');
assert.equal(result.session.lastHumanApproval?.toolId, dangerous.id);

console.log('agent-harness approval state-machine tests: PASS');
