import assert from 'node:assert/strict';
import test from 'node:test';
import { runSpecialistCouncil } from './specialist-council.ts';

const roles = ['engineering-scientist', 'software-architect'];
const providerSelections = [
  { providerId: 'gemini' as const, modelId: 'gemini-free-test' },
  { providerId: 'nvidia' as const, modelId: 'nvidia-free-test' },
];

test('explicit repository provider assignments cannot use the unguarded provider fallback', async () => {
  await assert.rejects(
    () => runSpecialistCouncil({
      objective: 'Inspect a repository change.',
      roles: [roles[0]],
      providerSelections: [providerSelections[0]],
    }),
    /requires a guarded provider generator/,
  );
});

test('explicit repository provider assignments use only the supplied guarded provider/model', async () => {
  const calls: Array<{ providerId: string; modelId: string }> = [];
  const result = await runSpecialistCouncil({
    objective: 'Inspect a repository change.',
    roles: [roles[0]],
    providerSelections: [providerSelections[0]],
    generateProvider: async (selection) => {
      calls.push(selection);
      return {
        provider: selection.providerId,
        model: selection.modelId,
        text: 'The inspected change has bounded scope and requires tests.',
        latencyMs: 5,
      } as never;
    },
  });
  assert.deepEqual(calls, [providerSelections[0]]);
  assert.equal(result.result.findings.length, 1);
  assert.deepEqual(result.providerAssignments, [{
    roleId: roles[0],
    providerId: 'gemini',
    modelId: 'gemini-free-test',
  }]);
});

test('explicit repository council fails closed when any guarded provider/model call fails', async () => {
  await assert.rejects(
    () => runSpecialistCouncil({
      objective: 'Inspect a repository change.',
      roles,
      providerSelections,
      generateProvider: async (selection) => {
        if (selection.providerId === 'nvidia') throw new Error('provider quota exhausted');
        return {
          provider: selection.providerId,
          model: selection.modelId,
          text: 'The source readback is consistent and the patch is bounded.',
          latencyMs: 5,
        } as never;
      },
    }),
    /1 of 2 guarded provider\/model calls failed \(nvidia:nvidia-free-test\)/,
  );
});


const broadRoleSet = [
  'policy-scientist',
  'patent-scientist',
  'assets-scientist',
  'attorney-scientist',
  'compliance-scientist',
  'ethics-scientist',
  'finance-scientist',
  'revenue-scientist',
  'risk-scientist',
];

const makeProviderSelections = (count: number) => Array.from({ length: count }, (_, index) => ({
  providerId: `provider-${index}` as never,
  modelId: `model-${index}`,
}));

test('unknown specialist role IDs are rejected before any provider request', async () => {
  let calls = 0;
  await assert.rejects(
    () => runSpecialistCouncil({
      objective: 'Inspect a repository change.',
      roles: ['not-a-real-specialist'],
      providerSelections: [providerSelections[0]],
      generateProvider: async (selection) => {
        calls += 1;
        return {
          provider: selection.providerId,
          model: selection.modelId,
          text: 'This should not execute.',
        } as never;
      },
    }),
    /unknown specialist role/i,
  );
  assert.equal(calls, 0);
});

test('specialist fan-out is capped at eight explicitly selected roles', async () => {
  let calls = 0;
  await assert.rejects(
    () => runSpecialistCouncil({
      objective: 'Inspect a repository change.',
      roles: broadRoleSet,
      providerSelections: makeProviderSelections(9),
      generateProvider: async (selection) => {
        calls += 1;
        return {
          provider: selection.providerId,
          model: selection.modelId,
          text: 'A bounded finding.',
        } as never;
      },
    }),
    /at most 8 specialists/i,
  );
  assert.equal(calls, 0);
});

test('an omitted role list uses the bounded executive core panel', async () => {
  const selections = makeProviderSelections(4);
  const result = await runSpecialistCouncil({
    objective: 'Inspect a repository change.',
    providerSelections: selections,
    generateProvider: async (selection) => ({
      provider: selection.providerId,
      model: selection.modelId,
      text: 'The inspected change has bounded scope.',
    } as never),
  });
  assert.deepEqual(
    result.selectedRoles.map((role) => role.id),
    ['policy-scientist', 'engineering-scientist', 'cybersecurity-scientist', 'operations-scientist'],
  );
  assert.equal(result.result.findings.length, 4);
});

test('explicit provider/model attribution must match the assigned provider and model', async () => {
  await assert.rejects(
    () => runSpecialistCouncil({
      objective: 'Inspect a repository change.',
      roles: [roles[0]],
      providerSelections: [providerSelections[0]],
      generateProvider: async () => ({
        provider: 'nvidia',
        model: 'different-model',
        text: 'This response was produced by a different assignment.',
      } as never),
    }),
    /unexpected provider\/model/i,
  );
});

test('blank specialist output is not counted as a successful finding', async () => {
  await assert.rejects(
    () => runSpecialistCouncil({
      objective: 'Inspect a repository change.',
      roles: [roles[0]],
      providerSelections: [providerSelections[0]],
      generateProvider: async (selection) => ({
        provider: selection.providerId,
        model: selection.modelId,
        text: '   ',
      } as never),
    }),
    /empty specialist output/i,
  );
});

test('specialist council limits concurrent provider calls to four', async () => {
  const selections = makeProviderSelections(8);
  let active = 0;
  let maximumActive = 0;
  const result = await runSpecialistCouncil({
    objective: 'Inspect a repository change.',
    roles: broadRoleSet.slice(0, 4),
    providerSelections: selections,
    generateProvider: async (selection) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {
        provider: selection.providerId,
        model: selection.modelId,
        text: 'Independent bounded finding.',
      } as never;
    },
  });
  assert.ok(maximumActive > 1, 'independent specialists should still run concurrently');
  assert.ok(maximumActive <= 4, 'provider fan-out must stay within the four-call ceiling');
  assert.equal(result.result.findings.length, 8);
});

test('oversized council objectives are rejected before provider execution', async () => {
  let calls = 0;
  await assert.rejects(
    () => runSpecialistCouncil({
      objective: 'x'.repeat(24_001),
      roles: [roles[0]],
      providerSelections: [providerSelections[0]],
      generateProvider: async (selection) => {
        calls += 1;
        return {
          provider: selection.providerId,
          model: selection.modelId,
          text: 'This should not execute.',
        } as never;
      },
    }),
    /objective.*24,000/i,
  );
  assert.equal(calls, 0);
});
