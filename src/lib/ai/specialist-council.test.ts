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
