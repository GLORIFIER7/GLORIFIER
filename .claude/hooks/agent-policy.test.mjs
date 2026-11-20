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

test('allows absolute source paths when they remain inside the checkout', () => {
  assert.equal(decidePreToolUse({
    tool_name: 'Write', tool_input: { file_path: path.join(cwd, 'src/example.ts') }, cwd,
  }), null);
});

test('denies edits to protected paths for every supported file-edit tool name', () => {
  for (const file of [
    '.github/workflows/ci.yml', '.env.production', '.dev.vars',
    'wrangler.jsonc', 'database/migrations/001.sql', 'package-lock.json',
    'uv.lock', 'keys/deploy.pem',
  ]) {
    for (const tool_name of ['Edit', 'MultilineEdit', 'MultiEdit', 'NotebookEdit']) {
      const decision = decidePreToolUse({
        tool_name, tool_input: { file_path: file }, cwd,
      });
      assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny', tool_name + ': ' + file);
    }
  }
});

test('denies agent self-modification of security hooks, instructions, and permissions', () => {
  const policyFiles = [
    '.claude/settings.json', '.claude/settings.local.json',
    '.claude/hooks/agent-policy.mjs', '.claude/agents/implementation-engineer.md',
    '.claude/skills/ci-repair/SKILL.md', '.opencode/agents/qa-verifier.md',
    'opencode.json', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'AGENT_RUNTIME.md',
    '.github/copilot-instructions.md', '.github/CODEOWNERS',
  ];
  for (const file of policyFiles) {
    for (const tool_name of ['Write', 'Edit', 'MultilineEdit', 'MultiEdit', 'NotebookEdit']) {
      const result = decidePreToolUse({ tool_name, tool_input: { file_path: file }, cwd });
      assert.equal(result?.hookSpecificOutput?.permissionDecision, 'deny', tool_name + ': ' + file);
    }
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
    'gh secret set API_KEY', 'gh secret delete API_KEY', 'gh variable remove PROVIDER_KEY',
    'wrangler deploy', 'npm publish', 'terraform apply -auto-approve', 'railway up',
  ]) {
    const decision = decidePreToolUse({
      tool_name: 'Bash', tool_input: { command }, cwd,
    });
    assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny', command);
  }
});

test('denies unsafe git operations when shell substitutions or pipelines obscure arguments', () => {
  for (const command of [
    'git reset $(printf x | sed s/x/--hard/) HEAD',
    'git clean $(printf x | sed s/x/-fd/)',
    'git push $(printf x | sed s/x/origin/) --force',
    'git push origin $(printf x | sed s/x/--force/)',
  ]) {
    const decision = decidePreToolUse({ tool_name: 'Bash', tool_input: { command }, cwd });
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
    }), null);
  }
});

test('fails closed when a write tool has no target path', () => {
  const decision = decidePreToolUse({ tool_name: 'Write', tool_input: {}, cwd });
  assert.equal(decision?.hookSpecificOutput?.permissionDecision, 'deny');
});
