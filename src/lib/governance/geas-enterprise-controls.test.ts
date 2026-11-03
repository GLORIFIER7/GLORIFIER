import { strict as assert } from 'node:assert';
import {
  assertNoIrreversibleExecutionWithoutApproval,
  assessProductionCommitMatch,
  bindApproval,
  verifyApprovalBinding,
  calculateCostPerVerifiedOutcome,
  createGovernedAction,
  createProblemDetails,
  deriveVerificationStatus,
} from './geas-enterprise-controls';
import { before, test } from 'node:test';

let assertionsCompleted = false;

before(async () => {
const action=createGovernedAction({contextId:'ctx-test',capability:'deployment:write',resource:'production',payload:{commit:'abc123'},authorityEnvelopeId:'env-1',policyVersion:'GEAS-POLICY-1',risk:'high',irreversible:true,humanApprovalRequired:true,status:'AUTHORIZED'});
assert.throws(()=>assertNoIrreversibleExecutionWithoutApproval(action));
const approval=bindApproval(action,'human-owner');
assert.equal(assertNoIrreversibleExecutionWithoutApproval(action,approval),undefined);
assert.equal(verifyApprovalBinding(action,approval),true);
assert.throws(()=>bindApproval(action,'   '),/non-empty human approver ID/);
assert.throws(()=>bindApproval(action,'human-owner',0),/positive integer/);
assert.throws(()=>bindApproval(action,'human-owner',-1),/positive integer/);
assert.throws(()=>bindApproval(action,'human-owner',24*60*60_000+1),/no greater than 24 hours/);
assert.equal(verifyApprovalBinding(action,{...approval,expiresAt:new Date(Date.now()-1_000).toISOString()}),false);
assert.equal(verifyApprovalBinding(action,{...approval,revokedAt:new Date().toISOString()}),false);
assert.equal(verifyApprovalBinding(action,{...approval,actionHash:'0'.repeat(64)}),false);
const expectedCommitSha = 'a'.repeat(40);
const matchingCommit = assessProductionCommitMatch(expectedCommitSha, {
  contextId: 'ctx-test',
  commitSha: expectedCommitSha,
  environment: 'production',
  deployedAt: new Date().toISOString(),
});
assert.deepEqual(matchingCommit, {
  status: 'MATCH',
  commitMatches: true,
  deploymentAuthenticity: 'NOT_VERIFIED',
  runtimeHealth: 'NOT_VERIFIED',
  reason: 'commit identifiers match; deployment authenticity and runtime health remain not verified',
});
assert.equal('verified' in matchingCommit, false,
  'a matching commit identifier must never be exposed as deployment verification');

const mismatchedCommit = assessProductionCommitMatch(expectedCommitSha, {
  contextId: 'ctx-test',
  commitSha: 'b'.repeat(40),
  environment: 'production',
  deployedAt: new Date().toISOString(),
});
assert.equal(mismatchedCommit.status, 'MISMATCH');
assert.equal(mismatchedCommit.commitMatches, false);
assert.equal(mismatchedCommit.deploymentAuthenticity, 'NOT_VERIFIED');

const nonProductionCommit = assessProductionCommitMatch(expectedCommitSha, {
  contextId: 'ctx-test',
  commitSha: expectedCommitSha,
  environment: 'staging',
  deployedAt: new Date().toISOString(),
});
assert.equal(nonProductionCommit.status, 'UNKNOWN');
assert.equal(nonProductionCommit.commitMatches, null);

const incompleteCommitDigest = assessProductionCommitMatch('abc123', {
  contextId: 'ctx-test',
  commitSha: 'abc123',
  environment: 'production',
  deployedAt: new Date().toISOString(),
});
assert.equal(incompleteCommitDigest.status, 'UNKNOWN');
assert.equal(incompleteCommitDigest.commitMatches, null);
assert.equal(deriveVerificationStatus({deployment:{verified:true},authentication:{verified:true},authorization:{verified:true},evidence:{authoritative:true,fresh:true,contradicted:false},e2e:{passed:false}}),'PARTIALLY_VERIFIED');
const economics=calculateCostPerVerifiedOutcome({contextId:'ctx-test',workload:'test',computeCost:2,infrastructureCost:1,humanReviewCost:1,currency:'USD',verifiedOutcomeValue:20,verifiedOutcome:true});
assert.equal(economics.totalCost,4); assert.equal(economics.costPerVerifiedOutcome,0.2);
const problem=createProblemDetails({title:'Provider unavailable',status:503,detail:'No authorized provider is currently available.',code:'PROVIDER_UNAVAILABLE',retryable:true,evidenceState:'observed'});
assert.equal(problem.type,'https://glorifier.local/problems/provider_unavailable');
console.log('GEAS enterprise control tests passed');
  assertionsCompleted = true;
});

test('existing assertions completed in setup hook', () => {
  assert.ok(assertionsCompleted, 'existing assertions completed before the test case');
});
