import { getModelNetworkPolicy } from './model-network';

const policy = getModelNetworkPolicy();

if (policy.architecture !== 'GLORIFIER_MODEL_NETWORK') throw new Error('wrong model network architecture');
if (!policy.providerNeutral) throw new Error('provider neutrality missing');
if (!policy.identityRequired) throw new Error('identity requirement missing');
if (!policy.provenanceRequired) throw new Error('provenance requirement missing');
if (!policy.evidenceRequiredForVerification) throw new Error('evidence gate missing');
if (!policy.authorizationRequiredForExecution) throw new Error('authorization gate missing');
if (!policy.humanAuthorityRemainsHighest) throw new Error('human authority invariant missing');
if (policy.automaticFinancialTransfers) throw new Error('financial transfers must remain disabled');
if (policy.automaticCredentialRotation) throw new Error('credential rotation must remain disabled');
if (policy.universalInternetControlClaim) throw new Error('universal Internet control claim must remain disabled');

console.log('GLORIFIER Model Network policy invariants: PASS');
