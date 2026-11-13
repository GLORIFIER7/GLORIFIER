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
  assert.throws(() => normalizeGithubToolInvocation('github.create_issue', {}), /no enabled Autopilot GitHub adapter/);
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


test('Autopilot normalizes only reversible branch-scoped GitHub write capabilities', () => {
  assert.deepEqual(normalizeGithubToolInvocation('github.create_branch', {
    branch: 'autopilot/mission-123', base_ref: 'main',
  }), {
    toolName: 'github_create_branch',
    arguments: { branch: 'autopilot/mission-123', base_ref: 'main' },
  });
  assert.deepEqual(normalizeGithubToolInvocation('github.update_file', {
    branch: 'autopilot/mission-123',
    path: 'src/lib/fix.ts',
    content: 'export const fixed = true;',
    message: 'fix: repair module',
  }), {
    toolName: 'github_update_file',
    arguments: {
      branch: 'autopilot/mission-123',
      path: 'src/lib/fix.ts',
      content: 'export const fixed = true;',
      message: 'fix: repair module',
    },
  });
  assert.throws(() => normalizeGithubToolInvocation('github.create_branch', {
    branch: 'main', base_ref: 'main',
  }), /autopilot branch/);
  assert.throws(() => normalizeGithubToolInvocation('github.update_file', {
    branch: 'autopilot/mission-123', path: '.env', content: 'x', message: 'fix: secret',
  }), /maintenance scope/);
  assert.throws(() => normalizeGithubToolInvocation('github.create_pull_request', {
    branch: 'feature/unsafe', title: 'unsafe PR', body: '',
  }), /autopilot branch/);
});

test('Autopilot write execution also requires matching independent GitHub source evidence', async () => {
  const result = await executeAutopilotToolStep('github.create_branch', {
    branch: 'autopilot/mission-123', base_ref: 'main',
  }, {
    adapter: async (toolName, args) => {
      assert.equal(toolName, 'github_create_branch');
      assert.deepEqual(args, { branch: 'autopilot/mission-123', base_ref: 'main' });
      return { ref: 'refs/heads/autopilot/mission-123', sha: 'c'.repeat(40), idempotent: false };
    },
    verifier: async (toolName, args, output) => ({
      verified: true,
      verifierId: 'github-rest-independent-read-v1',
      sourceUrl: 'https://api.github.com/repos/GLORIFIER7/GLORIFIER/git/ref/heads/autopilot/mission-123',
      verifiedAt: '2026-11-13T09:00:00.000Z',
      sourceSha256: 'c'.repeat(64),
      executionSha256: 'c'.repeat(64),
    }),
  });
  assert.equal(result.verification.verified, true);
  assert.equal(result.toolName, 'github_create_branch');
});


test('Autopilot read path validation rejects single backslashes and null bytes', () => {
  assert.throws(() => normalizeGithubToolInvocation('github.read_file', {
    path: 'src\\\\lib\\\\service.ts',
  }), /valid repository-relative path/);
  assert.throws(() => normalizeGithubToolInvocation('github.read_file', {
    path: 'src/lib/\\0service.ts',
  }), /valid repository-relative path/);
});
