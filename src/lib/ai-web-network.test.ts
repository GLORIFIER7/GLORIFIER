import assert from 'node:assert/strict';
import { getAIWebNetworkPolicy } from './ai-web-network';

const policy = getAIWebNetworkPolicy();
assert.equal(policy.architecture, 'GLORIFIER_AI_WEB_NETWORK');
assert.equal(policy.version, 'G-AI-WEB-1.0');
assert.equal(policy.humanAuthorityRemainsHighest, true);
assert.equal(policy.automaticIrreversibleProductionChanges, false);
assert.equal(policy.automaticFinancialTransfers, false);
assert.equal(policy.automaticCredentialRotation, false);
assert.equal(policy.universalInternetControlClaim, false);
assert.ok(policy.lifecycle.includes('EXECUTABLE'));
assert.ok(policy.lifecycle.includes('SETTLED'));
assert.ok(policy.truthStates.includes('UNKNOWN'));
assert.match(policy.collaboration, /GLORIFIER-A2A-v1/);
console.log('AI Web Network policy invariants: PASS');
