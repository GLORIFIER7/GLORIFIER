import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  normalizeAutopilotGraph,
  getReadyAutopilotGraphWave,
  type AutopilotGraphNode,
} from './autopilot-graph.ts';

const node = (id: string, dependsOn?: string[], effect: 'read-only' | 'reversible' = 'read-only'): AutopilotGraphNode => ({
  id,
  capability: 'github.get_repository',
  objective: `Execute ${id}`,
  effect,
  ...(dependsOn === undefined ? {} : { dependsOn }),
} as AutopilotGraphNode);

test('normalizes a graph into a stable topological order', () => {
  const graph = normalizeAutopilotGraph([
    node('publish', ['verify']),
    node('inspect-a'),
    node('inspect-b'),
    node('verify', ['inspect-a', 'inspect-b']),
  ]);

  assert.deepEqual(graph.map((step) => step.id), ['inspect-a', 'inspect-b', 'verify', 'publish']);
  assert.deepEqual(graph.find((step) => step.id === 'publish')?.dependsOn, ['verify']);
});

test('preserves legacy plan order when no explicit dependencies were supplied', () => {
  const graph = normalizeAutopilotGraph([node('first'), node('second'), node('third')]);

  assert.deepEqual(graph.map((step) => step.dependsOn), [[], ['first'], ['second']]);
});

test('rejects missing, duplicate, and self-referential dependencies', () => {
  assert.throws(() => normalizeAutopilotGraph([node('first', ['missing'])]), /unknown dependency/);
  assert.throws(() => normalizeAutopilotGraph([node('first', ['first'])]), /cannot depend on itself/);
  assert.throws(() => normalizeAutopilotGraph([node('first'), node('second', ['first', 'first'])]), /duplicate dependency/);
});

test('rejects cyclic graphs and plans that exceed the bounded node limit', () => {
  assert.throws(() => normalizeAutopilotGraph([
    node('first', ['second']),
    node('second', ['first']),
  ]), /contains a dependency cycle/);
  assert.throws(() => normalizeAutopilotGraph(
    Array.from({ length: 7 }, (_, index) => node(`step-${index}`)),
  ), /between 1 and 6 nodes/);
});

test('readiness wave selects only independent read-only nodes after dependencies complete', () => {
  const graph = normalizeAutopilotGraph([
    node('verify', ['inspect-a', 'inspect-b']),
    node('inspect-a'),
    node('inspect-b'),
    node('publish', ['verify'], 'reversible'),
  ]);
  const statuses = new Map([
    ['inspect-a', 'completed' as const],
    ['inspect-b', 'completed' as const],
    ['verify', 'pending' as const],
    ['publish', 'pending' as const],
  ]);

  assert.deepEqual(getReadyAutopilotGraphWave(graph, statuses, 2).map((step) => step.id), ['verify']);
});

test('parallel waves never group repository writes and respect concurrency bounds', () => {
  const graph = normalizeAutopilotGraph([
    node('inspect-a'),
    node('inspect-b'),
    node('inspect-c'),
    node('write-a', [], 'reversible'),
    node('write-b', [], 'reversible'),
  ]);
  const allPending = new Map(graph.map((step) => [step.id, 'pending' as const]));

  assert.deepEqual(getReadyAutopilotGraphWave(graph, allPending, 2).map((step) => step.id), ['inspect-a', 'inspect-b']);

  const writeOnly = new Map(graph.map((step) => [step.id, step.effect === 'reversible' ? 'pending' as const : 'completed' as const]));
  assert.deepEqual(getReadyAutopilotGraphWave(graph, writeOnly, 2).map((step) => step.id), ['write-a']);
});

test('failed or uncertain dependencies never release downstream nodes', () => {
  const graph = normalizeAutopilotGraph([
    node('inspect'),
    node('mutate', ['inspect'], 'reversible'),
  ]);

  for (const status of ['failed', 'blocked', 'reconciliation-required', 'running'] as const) {
    const states = new Map([
      ['inspect', status],
      ['mutate', 'pending' as const],
    ]);
    assert.deepEqual(getReadyAutopilotGraphWave(graph, states, 2), []);
  }
});


test('legacy sequential missions above six steps remain normalizable and schedulable', () => {
  const legacy = Array.from({ length: 7 }, (_, index) => node(`legacy-${index + 1}`));
  const graph = normalizeAutopilotGraph(legacy, 30);

  assert.equal(graph.length, 7);
  assert.deepEqual(graph.map((step) => step.dependsOn), [
    [],
    ['legacy-1'],
    ['legacy-2'],
    ['legacy-3'],
    ['legacy-4'],
    ['legacy-5'],
    ['legacy-6'],
  ]);

  const statuses = new Map(graph.map((step, index) => [
    step.id,
    index === 6 ? 'pending' as const : 'completed' as const,
  ]));
  assert.deepEqual(getReadyAutopilotGraphWave(graph, statuses, 2, 30).map((step) => step.id), ['legacy-7']);
});

test('a running mutation prevents another mutation from entering the same execution wave', () => {
  const graph = normalizeAutopilotGraph([
    node('write-a', [], 'reversible'),
    node('write-b', [], 'reversible'),
  ]);
  const statuses = new Map([
    ['write-a', 'running' as const],
    ['write-b', 'pending' as const],
  ]);

  assert.deepEqual(getReadyAutopilotGraphWave(graph, statuses, 2), []);
});


test('read-only concurrency bounds include nodes already running in a prior wave', () => {
  const graph = normalizeAutopilotGraph([
    node('inspect-a', [], 'read-only'),
    node('inspect-b', [], 'read-only'),
    node('inspect-c', [], 'read-only'),
  ]);
  const twoRunning = new Map([
    ['inspect-a', 'running' as const],
    ['inspect-b', 'running' as const],
    ['inspect-c', 'pending' as const],
  ]);
  assert.deepEqual(getReadyAutopilotGraphWave(graph, twoRunning, 2), []);

  const oneRunning = new Map([
    ['inspect-a', 'running' as const],
    ['inspect-b', 'pending' as const],
    ['inspect-c', 'pending' as const],
  ]);
  assert.deepEqual(getReadyAutopilotGraphWave(graph, oneRunning, 2).map((step) => step.id), ['inspect-b']);
});


test('mutating work waits until an in-flight read-only wave has drained', () => {
  const graph = normalizeAutopilotGraph([
    node('inspect-a', [], 'read-only'),
    node('write-a', [], 'reversible'),
  ]);
  const statuses = new Map([
    ['inspect-a', 'running' as const],
    ['write-a', 'pending' as const],
  ]);

  assert.deepEqual(getReadyAutopilotGraphWave(graph, statuses, 2), []);
});
