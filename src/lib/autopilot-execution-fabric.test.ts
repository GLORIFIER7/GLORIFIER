import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeAutopilotToolStep,
  normalizeGithubToolInvocation,
} from './autopilot-execution-fabric.ts';

test('Autopilot resolves only concrete read-only GitHub adapter capabilities', () => {
  assert.deepEqual(normalizeGithubToolInvocation('github.get_repository', {}), {
    toolName: 'github_get_repository',
    arguments: {},
  });
  assert.deepEqual(normalizeGithubToolInvocation('github.list_pull_requests', { state: 'open', per_page: 5 }), {
    toolName: 'github_list_open_pull_requests',
    arguments: { state: 'open', per_page: 5 },
  });
  assert.throws(() => normalizeGithubToolInvocation('github.create_issue', {}), /no enabled read-only adapter/);
  assert.throws(() => normalizeGithubToolInvocation('github.read_file', { path: '../.env' }), /valid repository-relative path/);
  assert.throws(() => normalizeGithubToolInvocation('github.list_workflow_runs', { per_page: 100 }), /between 1 and 20/);
});

test('Autopilot execution requires independent verification before returning success', async () => {
  const result = await executeAutopilotToolStep('github.get_repository', {}, {
    adapter: async (toolName, args) => {
      assert.equal(toolName, 'github_get_repository');
      assert.deepEqual(args, {});
      return { id: 1377237797, full_name: 'GLORIFIER7/GLORIFIER', default_branch: 'main' };
    },
    verifier: async (toolName, args, output) => ({
      verified: true,
      verifierId: 'github-rest-independent-read-v1',
      sourceUrl: 'https://api.github.com/repos/GLORIFIER7/GLORIFIER',
      verifiedAt: '2026-11-13T09:00:00.000Z',
      sourceSha256: 'a'.repeat(64),
      executionSha256: 'a'.repeat(64),
    }),
  });
  assert.equal(result.toolName, 'github_get_repository');
  assert.equal(result.verification.verified, true);
  assert.match(result.executionSha256, /^[a-f0-9]{64}$/);
});

test('Autopilot refuses to treat a tool response as verified when the independent check fails', async () => {
  await assert.rejects(
    () => executeAutopilotToolStep('github.get_repository', {}, {
      adapter: async () => ({ full_name: 'GLORIFIER7/GLORIFIER' }),
      verifier: async () => ({
        verified: false,
        verifierId: 'github-rest-independent-read-v1',
        sourceUrl: 'https://api.github.com/repos/GLORIFIER7/GLORIFIER',
        verifiedAt: '2026-11-13T09:00:00.000Z',
        sourceSha256: 'b'.repeat(64),
        executionSha256: 'a'.repeat(64),
        reason: 'independent-source-mismatch',
      }),
    }),
    /independent evidence verification failed/,
  );
});
