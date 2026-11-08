import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
  assert.doesNotMatch(route, /let suggestedAction\s*=/);
  assert.match(route, /No data stream names were supplied/);
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
  assert.match(route, /does not contact buyers/i);
  assert.match(route, /does not submit statutory notices/i);
  assert.match(route, /does not verify legal compliance/i);
});

test('broker console labels controls as local preferences and does not imply execution', async () => {
  const consoleSource = await readSource('src/components/AiBrokerConsole.tsx');

  assert.match(consoleSource, /Local Policy Preferences/);
  assert.match(consoleSource, /not a server-side authorization boundary/i);
  assert.match(consoleSource, /configured maximum ε target \(not enforcement\)/i);
  assert.match(consoleSource, /does not transform data or reject requests/i);
  assert.match(consoleSource, /does not contact buyers or send a counter-offer/i);
  assert.match(consoleSource, /Model not reported/);
  assert.match(consoleSource, /Execution boundary: this endpoint returns AI-generated text only/i);
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
  assert.match(modal, /Applying local preferences/);
  assert.doesNotMatch(modal, /Calibrating Enclave/);
});

test('council panel describes a request to configured providers, not all AI or live enforcement', async () => {
  const council = await readSource('src/components/AllAiCollaborationModal.tsx');

  assert.match(council, /Configured-Provider AI Council/);
  assert.match(council, /Request Council Responses/);
  assert.match(council, /discussion only/i);
  assert.doesNotMatch(council, /All-AI Model Collaboration Council/);
  assert.doesNotMatch(council, /tracker quarantine\./i);
  assert.doesNotMatch(council, /Statutory Broker Clawback & Shadow Tracker Eradication/);
});
