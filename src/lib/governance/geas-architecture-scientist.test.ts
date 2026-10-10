import { createGovernedActionEvidencePackage, createAgentIdentityContract, createTokenLifecycleContract, getGeasArchitectureModel, isClaimSupportedEvidence, isSourceObservationDue, stripHtml } from './geas-architecture-scientist';

const model = getGeasArchitectureModel();

if (isClaimSupportedEvidence('content-matched')) throw new Error('keyword match must not count as claim verification');
if (!isClaimSupportedEvidence('claim-supported')) throw new Error('claim-supported evidence state missing');
if (isSourceObservationDue(24, new Date(0).toISOString(), 24 * 60 * 60 * 1000 - 1)) throw new Error('source cadence should reuse fresh observations');
if (!isSourceObservationDue(24, new Date(0).toISOString(), 24 * 60 * 60 * 1000)) throw new Error('source cadence should refresh expired observations');
if (stripHtml('<main>  alpha &amp; beta </main>') !== 'alpha and beta') throw new Error('HTML normalization failed');

if (model.version !== 'GEAS-ARCHITECTURE-SCIENTIST-2.0') throw new Error('GEAS version mismatch');
if (model.drift.some((finding) => finding.status !== 'unknown' || finding.evidenceRefs.length !== 0)) throw new Error('baseline drift must remain UNKNOWN without runtime evidence');
if (!model.domains.includes('blockchain') || !model.domains.includes('iot') || !model.domains.includes('emerging-technology')) throw new Error('domain coverage missing');
if (!model.architectureStateModel.join(',').includes('desired,declared,deployed,observed,verified')) throw new Error('five-state architecture model missing');

const identity = createAgentIdentityContract({
  subject: 'test-agent',
  scope: ['read:architecture'],
  delegatedFrom: 'human-owner',
  audience: 'geas'
});
if (identity.identityType !== 'agent' || identity.scope.length !== 1) throw new Error('agent identity contract invalid');

const token = createTokenLifecycleContract({
  issuer: 'test',
  audience: 'geas',
  scope: ['read'],
  issuedAt: new Date(0).toISOString(),
  expiresAt: new Date(60000).toISOString()
});
if (!token.verificationRequired || !token.replayProtectionRequired) throw new Error('token lifecycle controls missing');

const pkg = createGovernedActionEvidencePackage({
  actorIdentity: 'test-agent',
  authorityRef: 'human-owner',
  capability: 'architecture-review',
  policyDecisionRef: 'policy-1',
  executionIdentity: 'execution-1',
  evidenceRefs: ['evidence-1']
});
if (!/^[a-f0-9]{64}$/.test(pkg.actionHash)) throw new Error('action hash invalid');
if (pkg.verificationStatus !== 'UNKNOWN') throw new Error('unverified action must remain UNKNOWN');
if (model.operatingRule.includes('autonomously apply irreversible production changes') === false) throw new Error('irreversible-change guard missing');

console.log('GEAS architecture scientist refinement tests passed');
