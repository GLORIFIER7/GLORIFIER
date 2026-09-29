import { getAgentMinerSnapshot, runAgentMinerCycle, setAgentMinerRunning, setComputeWorkerAuthorization } from './agent-miner';

setAgentMinerRunning(true, 'intelligence');
const before = getAgentMinerSnapshot();
if (before.cadence !== 'continuous-24x7') throw new Error('24x7 cadence missing');
if (before.safety.automaticFundMovement) throw new Error('fund movement must remain disabled');
const cycle = await runAgentMinerCycle();
if (!cycle.id || !cycle.completedAt) throw new Error('cycle did not complete');
setComputeWorkerAuthorization(false);
console.log('agent-miner tests passed');
