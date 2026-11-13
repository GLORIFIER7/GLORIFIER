import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import {
  executeGithubWriteTool,
  isAllowedAutopilotWritePath,
  normalizeAutopilotWriteBranch,
} from './autopilot-github-write.ts';

const token = 'test-write-token';

test('Autopilot branch creation is restricted to its namespace and uses main as the only base', async () => {
  const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push({ url, method, body });
    if (url.endsWith('/git/ref/heads/autopilot/mission-123')) {
      return Response.json({ message: 'Not Found' }, { status: 404 });
    }
    if (url.endsWith('/git/ref/heads/main')) {
      return Response.json({ ref: 'refs/heads/main', object: { sha: 'a'.repeat(40) } });
    }
    if (url.endsWith('/git/refs') && method === 'POST') {
      return Response.json({ ref: body?.ref, object: { sha: 'b'.repeat(40) } }, { status: 201 });
    }
    throw new Error('Unexpected request: ' + method + ' ' + url);
  };
  const result = await executeGithubWriteTool('github_create_branch', {
    branch: 'autopilot/mission-123',
    base_ref: 'main',
  }, token, fetchImpl);
  assert.deepEqual(result, { ref: 'refs/heads/autopilot/mission-123', sha: 'b'.repeat(40), idempotent: false });
  assert.equal(calls.at(-1)?.body?.sha, 'a'.repeat(40));
  assert.equal(calls.at(-1)?.body?.ref, 'refs/heads/autopilot/mission-123');
  assert.ok(calls.every(call => call.method === 'GET' || call.method === 'POST'));
});

test('Autopilot refuses to reuse an existing mission branch that diverged from current main', async () => {
  const branch = 'autopilot/mission-123';
  const mainSha = 'a'.repeat(40);
  const branchSha = 'b'.repeat(40);
  let mutationAttempted = false;
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    if (method === 'GET' && url.endsWith('/git/ref/heads/autopilot/mission-123')) {
      return Response.json({ ref: 'refs/heads/' + branch, object: { sha: branchSha } });
    }
    if (method === 'GET' && url.endsWith('/git/ref/heads/main')) {
      return Response.json({ ref: 'refs/heads/main', object: { sha: mainSha } });
    }
    if (method === 'GET' && url.endsWith('/compare/' + mainSha + '...' + branchSha)) {
      return Response.json({ status: 'diverged', merge_base_commit: { sha: 'c'.repeat(40) } });
    }
    mutationAttempted = true;
    throw new Error('Unexpected mutation request: ' + method + ' ' + url);
  };
  await assert.rejects(
    () => executeGithubWriteTool('github_create_branch', { branch, base_ref: 'main' }, token, fetchImpl),
    /not a descendant of current main/,
  );
  assert.equal(mutationAttempted, false, 'a diverged branch must not be reused or mutated');
});

test('Autopilot update_file only writes bounded source content to a non-main autopilot branch', async () => {
  const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push({ url, method, body });
    if (method === 'GET' && url.includes('/contents/src/lib/example.ts?')) {
      return Response.json({ path: 'src/lib/example.ts', sha: 'd'.repeat(40), content: Buffer.from('existing').toString('base64') + '\n', encoding: 'base64' });
    }
    if (method === 'PUT' && url.includes('/contents/src/lib/example.ts')) {
      return Response.json({
        commit: { sha: 'f'.repeat(40) },
        content: { path: 'src/lib/example.ts', sha: 'e'.repeat(40) },
      });
    }
    throw new Error('Unexpected request: ' + method + ' ' + url);
  };
  const result = await executeGithubWriteTool('github_update_file', {
    branch: 'autopilot/mission-123',
    path: 'src/lib/example.ts',
    content: 'export const repaired = true;\\n',
    message: 'fix(autopilot): repair example',
    expectedContentSha256: createHash('sha256').update('existing').digest('hex'),
  }, token, fetchImpl);
  assert.deepEqual(result, {
    commit: { sha: 'f'.repeat(40) },
    content: { path: 'src/lib/example.ts', sha: 'e'.repeat(40) },
    idempotent: false,
  });
  assert.equal(calls[1].body?.sha, 'd'.repeat(40));
  assert.equal(calls[1].body?.branch, 'autopilot/mission-123');
  assert.equal(calls[1].method, 'PUT');
});

test('Autopilot create_pull_request is draft-only, targets main and is idempotent', async () => {
  const calls: Array<{ url: string; method: string; body?: Record<string, unknown> }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method || 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : undefined;
    calls.push({ url, method, body });
    if (method === 'GET' && url.includes('/pulls?')) return Response.json([]);
    if (method === 'POST' && url.endsWith('/pulls')) {
      return Response.json({
        number: 91, title: 'Autopilot repair', state: 'open', draft: true,
        html_url: 'https://github.com/GLORIFIER7/GLORIFIER/pull/91',
        head: { ref: 'autopilot/mission-123' }, base: { ref: 'main' },
      }, { status: 201 });
    }
    throw new Error('Unexpected request: ' + method + ' ' + url);
  };
  const result = await executeGithubWriteTool('github_create_pull_request', {
    branch: 'autopilot/mission-123',
    title: 'Autopilot repair',
    body: 'Evidence and tests are attached.',
  }, token, fetchImpl);
  assert.deepEqual(result, {
    number: 91, title: 'Autopilot repair', state: 'open', draft: true,
    url: 'https://github.com/GLORIFIER7/GLORIFIER/pull/91',
    head: { ref: 'autopilot/mission-123' }, base: { ref: 'main' },
    idempotent: false,
  });
  assert.equal(calls[1].body?.draft, true);
  assert.equal(calls[1].body?.base, 'main');
  assert.equal(calls[1].body?.head, 'autopilot/mission-123');

  const existing = await executeGithubWriteTool('github_create_pull_request', {
    branch: 'autopilot/mission-123', title: 'Autopilot repair', body: 'Retry safely.',
  }, token, async () => Response.json([{
    number: 91, title: 'Autopilot repair', state: 'open', draft: true,
    html_url: 'https://github.com/GLORIFIER7/GLORIFIER/pull/91',
    head: { ref: 'autopilot/mission-123' }, base: { ref: 'main' },
  }]));
  assert.equal((existing as { idempotent: boolean }).idempotent, true);
});

test('Autopilot write adapter rejects secret paths, path traversal, main writes and unsafe branches', async () => {
  assert.equal(normalizeAutopilotWriteBranch('autopilot/mission-123'), 'autopilot/mission-123');
  assert.throws(() => normalizeAutopilotWriteBranch('main'), /autopilot branch/);
  assert.throws(() => normalizeAutopilotWriteBranch('feature/mission-123'), /autopilot branch/);
  assert.equal(isAllowedAutopilotWritePath('src/lib/service.ts'), true);
  assert.equal(isAllowedAutopilotWritePath('.github/workflows/ci.yml'), false);
  assert.equal(isAllowedAutopilotWritePath('docs/operations.md'), true);
  assert.equal(isAllowedAutopilotWritePath('../.env'), false);
  assert.equal(isAllowedAutopilotWritePath('src/../../.env'), false);
  assert.equal(isAllowedAutopilotWritePath('package.json'), false);
  assert.equal(isAllowedAutopilotWritePath('.env'), false);
  assert.equal(isAllowedAutopilotWritePath('src/lib/' + String.fromCharCode(0) + 'escape.ts'), false);
  assert.equal(isAllowedAutopilotWritePath('src/lib' + String.fromCharCode(92) + 'escape.ts'), false);
  await assert.rejects(
    () => executeGithubWriteTool('github_update_file', {
      branch: 'main', path: 'src/lib/service.ts', content: 'x', message: 'unsafe',
    }, token, async () => { throw new Error('network must not be called'); }),
    /autopilot branch/,
  );
  await assert.rejects(
    () => executeGithubWriteTool('github_update_file', {
      branch: 'autopilot/mission-123', path: '.env', content: 'secret', message: 'unsafe',
    }, token, async () => { throw new Error('network must not be called'); }),
    /not in the enabled maintenance scope/,
  );
});

test('Autopilot GitHub write adapter refuses missing write credentials', async () => {
  await assert.rejects(
    () => executeGithubWriteTool('github_create_branch', {
      branch: 'autopilot/mission-123', base_ref: 'main',
    }, '', async () => { throw new Error('network must not be called'); }),
    /GLORIFIER_GITHUB_WRITE_TOKEN is not configured/,
  );
});


test('Autopilot refuses to overwrite a source file that changed after inspection', async () => {
  let putAttempted = false;
  await assert.rejects(
    () => executeGithubWriteTool('github_update_file', {
      branch: 'autopilot/mission-123',
      path: 'src/lib/example.ts',
      content: 'replacement',
      message: 'fix(autopilot): avoid stale write',
      expectedContentSha256: createHash('sha256').update('old inspected value').digest('hex'),
    }, token, async (input, init) => {
      const method = init?.method || 'GET';
      if (method === 'GET') {
        return Response.json({
          path: 'src/lib/example.ts',
          sha: 'd'.repeat(40),
          content: Buffer.from('newer current value').toString('base64'),
          encoding: 'base64',
        });
      }
      putAttempted = true;
      return Response.json({});
    }),
    /changed after inspection/,
  );
  assert.equal(putAttempted, false, 'stale source must be rejected before the GitHub write request');
});


test('Autopilot GitHub write adapter rejects real CR and LF in credentials before network access', async () => {
  for (const invalidToken of ['token' + String.fromCharCode(10) + 'header: injected', 'token' + String.fromCharCode(13) + 'header: injected']) {
    await assert.rejects(
      () => executeGithubWriteTool('github_create_branch', {
        branch: 'autopilot/mission-123', base_ref: 'main',
      }, invalidToken, async () => { throw new Error('network must not be called'); }),
      /invalid format/,
    );
  }
});
