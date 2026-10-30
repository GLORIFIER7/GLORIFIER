import { FEDERATED_A2A_V3_LIFECYCLE, FEDERATED_A2A_V3_VERSION, getFederatedA2AV3Policy, createFederatedA2ATask, listFederatedA2ATasks } from './federated-a2a-v3';
const p=getFederatedA2AV3Policy();
if(FEDERATED_A2A_V3_VERSION!=='G-A2A-TASK-3.0') throw new Error('version');
if(JSON.stringify(p.lifecycle)!==JSON.stringify(FEDERATED_A2A_V3_LIFECYCLE)) throw new Error('lifecycle');
if(!p.humanAuthorityRemainsHighest||p.automaticFinancialTransfers||p.automaticIrreversibleProductionChanges||p.automaticCredentialRotation) throw new Error('governance');
const t=createFederatedA2ATask({requesterAgentId:'ai-ceo',capability:'research',objective:'test'});
if (listFederatedA2ATasks(100).length !== 0) throw new Error('missing requester must fail closed unless all-task access is explicit');
if (listFederatedA2ATasks(100, '').length !== 0) throw new Error('blank requester must fail closed');
const initialAdminPage = listFederatedA2ATasks(100, undefined, true);
if (initialAdminPage.length !== 1 || initialAdminPage[0].id !== t.id) {
  throw new Error('explicit all-task access must include the seeded task');
}
if(t.state!=='DISCOVERED'||t.attempt!==0||t.evidenceRefs.length!==0) throw new Error('task');

const aliceTask = createFederatedA2ATask({ requesterAgentId: 'alice-uid', capability: 'research', objective: 'older private task' });
await new Promise((resolve) => setTimeout(resolve, 2));
for (let index = 0; index < 55; index += 1) {
  createFederatedA2ATask({ requesterAgentId: 'bob-uid', capability: 'research', objective: 'newer task ' + index });
}
const alicePage = listFederatedA2ATasks(1, 'alice-uid');
if (alicePage.length !== 1 || alicePage[0].id !== aliceTask.id) {
  throw new Error('requester filtering must run before Federated A2A list pagination');
}
const adminPage = listFederatedA2ATasks(100, undefined, true);
if (adminPage.length !== 57) throw new Error('explicit all-task access must include all seeded tasks');
console.log('FEDERATED_A2A_V3_TEST_OK',JSON.stringify({version:FEDERATED_A2A_V3_VERSION,lifecycle:p.lifecycle}));
