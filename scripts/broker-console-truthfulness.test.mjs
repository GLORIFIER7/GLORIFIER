import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resetDisplayWeights } from '../src/lib/ai/model-council-display-preferences.mjs';

const repositoryRoot = new URL('../', import.meta.url);
const readSource = (path) => readFile(new URL(path, repositoryRoot), 'utf8');

test('broker inference failure is reported as a failure, never synthetic success', async () => {
  const server = await readSource('server.ts');
  const routeStart = server.indexOf("app.post('/api/ai/broker-chat'");
  const routeEnd = server.indexOf('// 3. AI Offer Evaluator endpoint', routeStart);
  assert.notEqual(routeStart, -1, 'broker chat route must exist');
  assert.notEqual(routeEnd, -1, 'broker chat route boundary must exist');

  const route = server.slice(routeStart, routeEnd);
  assert.match(route, /AI broker execution failed; no inference response was produced and no external action was executed/);
  assert.doesNotMatch(route, /I am enforcing your current privacy parameters/);
  assert.doesNotMatch(route, /Local Enclave/);
  assert.equal(route.includes('*/'), false, 'broker route must not contain a stray block-comment terminator');
  assert.doesNotMatch(route, /let suggestedAction\s*=/);
  assert.doesNotMatch(route, /footprintsSummary|Browsing, E-Commerce, Developer, Health telemetry active/);
  assert.match(route, /minimumMonthlyFloorUsd\s*\?\?/);
  assert.match(route, /globalEpsilon\s*\?\?/);
});

test('broker system prompt limits the model to analysis and draft text', async () => {
  const server = await readSource('server.ts');
  const routeStart = server.indexOf("app.post('/api/ai/broker-chat'");
  const routeEnd = server.indexOf('// 3. AI Offer Evaluator endpoint', routeStart);
  const route = server.slice(routeStart, routeEnd);

  assert.match(route, /text-only AI assistant/i);
  assert.match(route, /does not execute privacy transformations/i);
  assert.match(route, /does not accept or reject buyer bids, contact buyers/i);
  assert.match(route, /submit statutory notices/i);
  assert.match(route, /verify legal compliance/i);
});

test('broker console labels controls as local preferences and does not imply execution', async () => {
  const consoleSource = await readSource('src/components/AiBrokerConsole.tsx');

  assert.match(consoleSource, /Configured Policy Preferences/);
  assert.match(consoleSource, /not a server-side authorization boundary/i);
  assert.match(consoleSource, /configured maximum ε target \(not enforcement\)/i);
  assert.match(consoleSource, /does not transform data, enforce a privacy budget, or reject buyer requests/i);
  assert.doesNotMatch(consoleSource, /footprintsSummary/);
  assert.match(consoleSource, /policyContext:\s*\{/);
  assert.doesNotMatch(consoleSource, /currentPolicy:\s*\{\s*\.\.\.policy/);
  assert.match(consoleSource, /does not contact buyers or send a counter-offer/i);
  assert.match(consoleSource, /Model not reported/);
  assert.match(consoleSource, /Execution boundary: this endpoint returns AI-generated text only/i);
  assert.match(consoleSource, /four policy preferences/);
  assert.match(consoleSource, /does not send source names, footprint records, wallet details, or payment settings/);
  assert.match(consoleSource, /provider's retention and training terms are NOT VERIFIED/);
  assert.match(consoleSource, /Ask about:/);
  assert.doesNotMatch(consoleSource, /automatically applies these governing thresholds/i);
  assert.doesNotMatch(consoleSource, /Action applied:/);
  assert.doesNotMatch(consoleSource, /Evaluating data valuation & privacy proofs/);
  assert.match(consoleSource, /min="0"/);
});

test('policy preset panel does not imply AI optimization or enclave execution', async () => {
  const modal = await readSource('src/components/AiPolicyOptimizerModal.tsx');

  assert.match(modal, /Policy Preset Comparator/);
  assert.match(modal, /Apply Local Preferences/);
  assert.match(modal, /LOCAL PRESET · NO MODEL CALL/);
  assert.doesNotMatch(modal, /Calibrating Enclave/);
  assert.doesNotMatch(modal, /setTimeout\(/);
  assert.match(modal, /autoNegotiateHighBids: false/);
});


test('council provider prompt receives only allowlisted policy values and a record count', async () => {
  const server = await readSource('server.ts');
  const helperStart = server.indexOf('function buildModelCouncilMessages');
  const helperEnd = server.indexOf("app.post('/api/ai/council'", helperStart);
  assert.notEqual(helperStart, -1);
  assert.notEqual(helperEnd, -1);
  const helper = server.slice(helperStart, helperEnd);
  assert.match(helper, /body\.policyContext/);
  assert.match(helper, /body\.footprintCount/);
  assert.match(helper, /record contents are not forwarded to providers/);
  assert.doesNotMatch(helper, /body\.currentPolicy|body\.footprints/);

  const component = await readSource('src/components/AllAiCollaborationModal.tsx');
  assert.match(component, /policyContext:\s*\{/);
  assert.match(component, /footprintCount:\s*footprints\.length/);
  assert.doesNotMatch(component, /currentPolicy:\s*policy/);
  assert.doesNotMatch(component, /footprints:\s*footprints\.map/);
});

test('council panel describes a request to configured providers, not all AI or live enforcement', async () => {
  const council = await readSource('src/components/AllAiCollaborationModal.tsx');

  assert.match(council, /Configured-Provider AI Council/);
  assert.match(council, /Request Council Responses/);
  assert.doesNotMatch(council, /Convening All AI Models/);
  assert.match(council, /Requesting council responses from configured providers/);
  assert.match(council, /This is advisory discussion only/i);
  assert.match(council, /up to eight/);
  assert.match(council, /source names, records, wallet details, and payment settings are not sent/i);
  assert.doesNotMatch(council, /All-AI Model Collaboration Council/);
  assert.doesNotMatch(council, /tracker quarantine\./i);
  assert.doesNotMatch(council, /Statutory Broker Clawback & Shadow Tracker Eradication/);

  const client = await readSource('src/lib/ai/model-council-client.ts');
  assert.match(client, /policyContext: input\.policyContext/);
  assert.match(client, /footprintCount: input\.footprintCount/);
  assert.doesNotMatch(client, /currentPolicy: input\.currentPolicy/);
  const forbiddenFootprintForwarding = /footprints: input\.footprints/;
  assert.match('footprints: input.footprints', forbiddenFootprintForwarding);
  assert.doesNotMatch(client, forbiddenFootprintForwarding);

  const management = await readSource('src/components/AiModelsCollaborationManagement.tsx');
  assert.equal(management.includes('Convene All-AI Council'), false);
  assert.equal(management.includes('Enact Directives to Live Policy'), false);
  assert.equal(management.includes('CIPP / Privacy Ph.D.'), false);
  assert.equal(management.includes('currentPolicy: policy'), false);
  assert.equal(management.includes('footprints: footprints.map'), false);
  assert.equal(management.includes("aiModel: 'all-models'"), false);
  assert.equal(management.includes('autoNegotiateHighBids: true'), false);
  assert.equal(management.includes('Zero-Knowledge Enclave'), false);
  assert.equal(management.includes('Statutory PII Redaction'), false);
  assert.equal(management.includes('Cryptographic Perturbation'), false);
  assert.equal(management.includes('Sovereign Core Arbitrator'), false);
  assert.match(management, /Display Weight · Not Used by API/);
  assert.match(management, /Intended Boundary Target · NOT VERIFIED/);
  assert.match(management, /not sent to the council API/);
});


test('reset display weights preserves enabled state and provider configuration', async () => {
  const current = [
    { id: 'openai', weight: 10, enabled: false, provider: 'OpenAI custom' },
    { id: 'gemini', weight: 90, enabled: true, provider: 'Google custom' },
    { id: 'local', weight: 5, enabled: true, provider: 'Local' },
  ];
  const initial = [
    { id: 'openai', weight: 35 },
    { id: 'gemini', weight: 35 },
  ];
  assert.deepEqual(resetDisplayWeights(current, initial), [
    { id: 'openai', weight: 35, enabled: false, provider: 'OpenAI custom' },
    { id: 'gemini', weight: 35, enabled: true, provider: 'Google custom' },
    { id: 'local', weight: 5, enabled: true, provider: 'Local' },
  ]);

  const management = await readSource('src/components/AiModelsCollaborationManagement.tsx');
  assert.match(management, /resetDisplayWeights\(prev, INITIAL_NODES\)/);
  assert.doesNotMatch(management, /setNodes\(INITIAL_NODES\)/);
});
