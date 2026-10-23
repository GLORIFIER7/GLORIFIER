import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorizeCapability, getCapabilityPolicy, listCapabilityPolicies } from './capability-authorization';

const manifest = JSON.parse(readFileSync('config/glorifier-capabilities.json', 'utf8'));
const runtime = new Map(listCapabilityPolicies().map((policy) => [policy.id, policy]));

assert.equal(manifest.default, 'deny');
assert.equal(new Set(manifest.capabilities.map((item: { id: string }) => item.id)).size, manifest.capabilities.length,
  'manifest capability IDs must be unique');
assert.deepEqual(
  manifest.capabilities.map((item: { id: string }) => item.id).sort(),
  [...runtime.keys()].sort(),
  'manifest and runtime capability IDs must match',
);

for (const item of manifest.capabilities as Array<{ id: string; risk: string; approval: boolean }>) {
  const policy = getCapabilityPolicy(item.id);
  assert.ok(policy, `missing runtime policy for ${item.id}`);
  assert.equal(policy.risk, item.risk, `risk mismatch for ${item.id}`);
  assert.equal(policy.requiresHumanApproval, item.approval, `approval mismatch for ${item.id}`);
}

for (const id of ['utility.web_search', 'utility.calculate', 'knowledge.search', 'knowledge.ask', 'agent.discover']) {
  assert.equal(authorizeCapability({ capability: id }).allowed, true, `${id} should be policy-authorized`);
}
for (const id of ['tool.invoke', 'knowledge.accept_answer', 'service.publish', 'package.publish', 'deploy.production', 'move.funds', 'wallet.broadcast']) {
  assert.equal(authorizeCapability({ capability: id }).allowed, false, `${id} must require human approval`);
  assert.equal(authorizeCapability({ capability: id, humanApproved: true }).allowed, true);
}
for (const id of ['not.registered', 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
  assert.equal(getCapabilityPolicy(id), null, `${id} must not resolve through Object.prototype`);
  assert.equal(authorizeCapability({ capability: id }).allowed, false, `${id} must fail closed`);
}
console.log('Capability authorization regression tests: PASS');
