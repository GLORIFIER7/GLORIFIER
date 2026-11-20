import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { decidePreToolUse } from './agent-policy.mjs';

const cwd = path.resolve('/workspace/repository');

test('allows ordinary source edits inside the repository', () => {
  assert.equal(decidePreToolUse({
    tool_name: 'Write', tool_input: { file_path: 'src/example.ts' }, cwd,
  }), null);
});

test('denies edits to workflows, secrets, release configuration, migrations and dependency locks', () => {
  for (const file of [
    '.github/workflows/ci.yml', '.env.production', '.dev.vars',
    'wrangler.jsonc', 'database/migrations/001.sql', 'package-lock.json',
    'uv.lock', 'keys/deploy.pem',
  ]) {
    const decision = decidePreToolUse({
      tool_name: 'Edit', tool_input: { file_path: file }, cwd,
    });
    assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny', file);
  }
});

test('denies paths that escape the repository even when the target name looks safe', () => {
  const decision = decidePreToolUse({
    tool_name: 'Write', tool_input: { file_path: '../outside/README.md' }, cwd,
  });
  assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
});

test('denies destructive, privileged or production-side-effect shell commands', () => {
  for (const command of [
    'git push origin main --force', 'git push --force-with-lease',
    'git reset --hard HEAD', 'git clean -fd', 'gh pr merge 123',
    'gh secret set API_KEY', 'wrangler deploy', 'npm publish',
    'terraform apply -auto-approve', 'railway up',
  ]) {
    const decision = decidePreToolUse({
      tool_name: 'Bash', tool_input: { command }, cwd,
    });
    assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny', command);
  }
});

test('allows read-only inspection and ordinary focused validation commands', () => {
  for (const command of [
    'git status --short', 'git diff --check', 'npm run test:architecture',
    'uv run --locked pytest tests/test_policy.py',
  ]) {
    assert.equal(decidePreToolUse({
      tool_name: 'Bash', tool_input: { command }, cwd,
    }), null, command);
  }
});

test('fails closed when a write tool has no target path', () => {
  const decision = decidePreToolUse({ tool_name: 'Write', tool_input: {}, cwd });
  assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
});
