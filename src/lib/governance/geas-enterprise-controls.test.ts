import { strict as assert } from 'node:assert';
import { assertNoIrreversibleExecutionWithoutApproval,bindApproval,calculateCostPerVerifiedOutcome,createGovernedAction,createProblemDetails,deriveVerificationStatus,assertProductionProvenanceMatches } from './geas-enterprise-controls';

const action=createGovernedAction({contextId:'ctx-test',capability:'deployment:write',resource:'production',payload:{commit:'abc123'},authorityEnvelopeId:'env-1',policyVersion:'GEAS-POLICY-1',risk:'high',irreversible:true,humanApprovalRequired:true,status:'AUTHORIZED'});
assert.throws(()=>assertNoIrreversibleExecutionWithoutApproval(action));
const approval=bindApproval(action,'human-owner');
assert.equal(assertNoIrreversibleExecutionWithoutApproval(action,approval),undefined);
assert.deepEqual(assertProductionProvenanceMatches('abc123',{contextId:'ctx-test',commitSha:'abc123',environment:'production',deployedAt:new Date().toISOString()}),{verified:true,reason:'deployment commit matches expected commit'});
assert.equal(deriveVerificationStatus({deployment:{verified:true},authentication:{verified:true},authorization:{verified:true},evidence:{authoritative:true,fresh:true,contradicted:false},e2e:{passed:false}}),'PARTIALLY_VERIFIED');
const economics=calculateCostPerVerifiedOutcome({contextId:'ctx-test',workload:'test',computeCost:2,infrastructureCost:1,humanReviewCost:1,currency:'USD',verifiedOutcomeValue:20,verifiedOutcome:true});
assert.equal(economics.totalCost,4); assert.equal(economics.costPerVerifiedOutcome,0.2);
const problem=createProblemDetails({title:'Provider unavailable',status:503,detail:'No authorized provider is currently available.',code:'PROVIDER_UNAVAILABLE',retryable:true,evidenceState:'observed'});
assert.equal(problem.type,'https://glorifier.local/problems/provider_unavailable');
console.log('GEAS enterprise control tests passed');
