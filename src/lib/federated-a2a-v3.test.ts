import { FEDERATED_A2A_V3_LIFECYCLE, FEDERATED_A2A_V3_VERSION, getFederatedA2AV3Policy, createFederatedA2ATask, listFederatedA2ATasks } from './federated-a2a-v3';
const p=getFederatedA2AV3Policy();
if(FEDERATED_A2A_V3_VERSION!=='G-A2A-TASK-3.0') throw new Error('version');
if(JSON.stringify(p.lifecycle)!==JSON.stringify(FEDERATED_A2A_V3_LIFECYCLE)) throw new Error('lifecycle');
if(!p.humanAuthorityRemainsHighest||p.automaticFinancialTransfers||p.automaticIrreversibleProductionChanges||p.automaticCredentialRotation) throw new Error('governance');
const t=createFederatedA2ATask({requesterAgentId:'ai-ceo',capability:'research',objective:'test'});
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
console.log('FEDERATED_A2A_V3_TEST_OK',JSON.stringify({version:FEDERATED_A2A_V3_VERSION,lifecycle:p.lifecycle}));
