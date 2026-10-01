import assert from 'node:assert/strict';
import { getAIWebNetworkPolicy } from './ai-web-network';

const policy = getAIWebNetworkPolicy();
assert.equal(policy.architecture, 'GLORIFIER_AI_WEB_NETWORK');
assert.equal(policy.version, 'G-AI-WEB-2.0');
assert.equal(policy.humanAuthorityRemainsHighest, true);
assert.equal(policy.automaticFinancialTransfers, false);
assert.equal(policy.automaticIrreversibleProductionChanges, false);
assert.equal(policy.automaticCredentialRotation, false);
assert.equal(policy.universalInternetControlClaim, false);
assert.ok(policy.lifecycle.includes('EXECUTABLE'));
assert.ok(policy.lifecycle.includes('SETTLED'));
console.log('AI Web Network v2 governance invariants: PASS');
