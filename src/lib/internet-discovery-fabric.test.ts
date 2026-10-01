import { getInternetDiscoveryFabricPolicy } from './internet-discovery-fabric';

const policy = getInternetDiscoveryFabricPolicy();

if (policy.architecture !== 'INTERNET_DISCOVERY_FABRIC_WORLD_GRAPH') throw new Error('wrong architecture');
if (!policy.internetIsEnvironment) throw new Error('internet must remain environment');
if (!policy.daemonIsPersistentNervousSystem) throw new Error('daemon role missing');
if (!policy.identityResolutionRequired) throw new Error('identity resolution must be required');
if (!policy.provenanceRequired) throw new Error('provenance must be required');
if (!policy.evidenceRequiredForVerification) throw new Error('evidence gate missing');
if (!policy.authorizationRequiredForExecution) throw new Error('execution authorization gate missing');
if (!policy.humanAuthorityRemainsHighest) throw new Error('human authority invariant missing');
if (policy.automaticIrreversibleProductionChanges) throw new Error('irreversible automation must be disabled');
if (policy.automaticFinancialTransfers) throw new Error('financial transfer automation must be disabled');
if (policy.automaticCredentialRotation) throw new Error('credential rotation automation must be disabled');
if (!policy.noUniversalInternetCoverageClaim) throw new Error('universal coverage claim guard missing');
console.log('Internet Discovery Fabric policy invariants: PASS');
