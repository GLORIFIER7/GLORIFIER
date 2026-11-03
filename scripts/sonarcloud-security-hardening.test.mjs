import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyUnifiedDiff } from './apply-unified-diff.mjs';

const agaveWorkflows = [
  {
    name: '.github/workflows/glorifier-solana-devnet-reconcile.yml',
    source: readFileSync(new URL('../.github/workflows/glorifier-solana-devnet-reconcile.yml', import.meta.url), 'utf8'),
  },
  {
    name: '.github/workflows/glorifier-solana-devnet-resume.yml',
    source: readFileSync(new URL('../.github/workflows/glorifier-solana-devnet-resume.yml', import.meta.url), 'utf8'),
  },
  {
    name: '.github/workflows/glorifier-solana-devnet.yml',
    source: readFileSync(new URL('../.github/workflows/glorifier-solana-devnet.yml', import.meta.url), 'utf8'),
  },
];

const agaveSha256 = '5fc8684f7430038105fde953d4308ed56addf627f658daa61709f345448247ee';

for (const workflow of agaveWorkflows) {
  test(workflow.name + ' verifies the pinned Agave archive before extraction', () => {
    assert.ok(workflow.source.includes(agaveSha256));
    assert.match(workflow.source, /sha256sum --check --strict/);
    assert.match(workflow.source, /curl --fail --show-error --silent --location --proto '=https' --tlsv1\.2/);
    assert.ok(workflow.source.indexOf('sha256sum --check --strict') < workflow.source.indexOf('tar -xjf'));
    assert.doesNotMatch(workflow.source, /sh -c "\$\(curl[^"]*release\.anza\.xyz/);
  });
}

const actionPins = [
  {
    name: '.github/workflows/codex-gemini-review.yml',
    source: readFileSync(new URL('../.github/workflows/codex-gemini-review.yml', import.meta.url), 'utf8'),
    action: 'openai/codex-action',
    sha: 'bdf19a4a223ec2549a3e2274a0cf61556bc07675',
  },
  {
    name: '.github/workflows/gemini-collaborator.yml',
    source: readFileSync(new URL('../.github/workflows/gemini-collaborator.yml', import.meta.url), 'utf8'),
    action: 'google-github-actions/run-gemini-cli',
    sha: 'f77273f4c914e4bf38440cf36a0369cb64a37489',
  },
  {
    name: '.github/workflows/glorifier-bnb-testnet-deploy.yml',
    source: readFileSync(new URL('../.github/workflows/glorifier-bnb-testnet-deploy.yml', import.meta.url), 'utf8'),
    action: 'foundry-rs/foundry-toolchain',
    sha: 'dba66c27052e63476d886f22216e119ba7e615bf',
  },
  {
    name: '.github/workflows/glorifier-sepolia-rpc-check.yml',
    source: readFileSync(new URL('../.github/workflows/glorifier-sepolia-rpc-check.yml', import.meta.url), 'utf8'),
    action: 'foundry-rs/foundry-toolchain',
    sha: 'dba66c27052e63476d886f22216e119ba7e615bf',
  },
  {
    name: '.github/workflows/glorifier-testnet-deploy.yml',
    source: readFileSync(new URL('../.github/workflows/glorifier-testnet-deploy.yml', import.meta.url), 'utf8'),
    action: 'foundry-rs/foundry-toolchain',
    sha: 'dba66c27052e63476d886f22216e119ba7e615bf',
  },
  {
    name: '.github/workflows/glorifier-contracts.yml',
    source: readFileSync(new URL('../.github/workflows/glorifier-contracts.yml', import.meta.url), 'utf8'),
    action: 'foundry-rs/foundry-toolchain',
    sha: 'dba66c27052e63476d886f22216e119ba7e615bf',
  },
];

for (const item of actionPins) {
  test(item.name + ' pins ' + item.action + ' to the reviewed immutable commit', () => {
    assert.ok(item.source.includes('uses: ' + item.action + '@' + item.sha));
  });
}

const maintenanceScripts = [
  {
    name: 'scripts/continuous-improvement-agent.mjs',
    source: readFileSync(new URL('../scripts/continuous-improvement-agent.mjs', import.meta.url), 'utf8'),
  },
  {
    name: 'scripts/code-guardian.mjs',
    source: readFileSync(new URL('../scripts/code-guardian.mjs', import.meta.url), 'utf8'),
  },
];

for (const item of maintenanceScripts) {
  test(item.name + ' sends generated diffs directly to git apply stdin', () => {
    assert.match(item.source, /applyUnifiedDiff/);
    assert.doesNotMatch(item.source, /\/tmp\/glorifier-/);
    assert.doesNotMatch(item.source, /writeFileSync|writeFile\(/);
  });
}

const tokenScripts = [
  {
    name: 'solana/revoke-token2022-metadata-authority.mjs',
    source: readFileSync(new URL('../solana/revoke-token2022-metadata-authority.mjs', import.meta.url), 'utf8'),
  },
  {
    name: 'solana/revoke-token2022-metadata-pointer.mjs',
    source: readFileSync(new URL('../solana/revoke-token2022-metadata-pointer.mjs', import.meta.url), 'utf8'),
  },
];

for (const item of tokenScripts) {
  test(item.name + ' resolves dependencies through the workflow-provided Node module path', () => {
    assert.match(item.source, /createRequire\(import\.meta\.url\)/);
    assert.doesNotMatch(item.source, /GLORIFIER_TOKEN2022_NODE_MODULES_DIR/);
    assert.doesNotMatch(item.source, /\/tmp\/glorifier-token2022-js/);
  });
}

test('Mainnet Token-2022 runner provides NODE_PATH from its private dependency directory', () => {
  const source = readFileSync(new URL('../solana/deploy-token2022-mainnet.sh', import.meta.url), 'utf8');
  assert.match(source, /mktemp -d/);
  assert.match(source, /chmod 700/);
  assert.match(source, /export GLORIFIER_TOKEN2022_NODE_MODULES_DIR/);
  assert.match(source, /export NODE_PATH="\$GLORIFIER_TOKEN2022_NODE_MODULES_DIR\/node_modules"/);
  assert.match(source, /trap .*rm -rf.*GLORIFIER_TOKEN2022_NODE_MODULES_DIR.* EXIT/);
  assert.match(source, /npm install --prefix "\$GLORIFIER_TOKEN2022_NODE_MODULES_DIR"/);
  assert.doesNotMatch(source, /npm install --prefix \/tmp\/glorifier-token2022-js/);
});

test('applyUnifiedDiff forwards a validated diff over stdin without creating files', () => {
  const patch = 'diff --git a/src/example.ts b/src/example.ts\n';
  let invocation;
  const expected = { ok: true, output: '' };
  const result = applyUnifiedDiff(patch, (command, args, options) => {
    invocation = { command, args, options };
    return expected;
  });

  assert.equal(result, expected);
  assert.equal(invocation.command, 'git');
  assert.deepEqual(invocation.args, ['apply', '--whitespace=fix', '--recount']);
  assert.equal(invocation.options.input, patch);
});

test('applyUnifiedDiff returns a failed git-apply result unchanged', () => {
  const failed = { ok: false, output: 'patch rejected' };
  const result = applyUnifiedDiff(
    'diff --git a/src/example.ts b/src/example.ts\n',
    () => failed,
  );
  assert.equal(result, failed);
});

test('applyUnifiedDiff rejects missing patches and invalid executors', () => {
  assert.throws(() => applyUnifiedDiff('', () => ({ ok: true })), /non-empty unified diff/);
  assert.throws(() => applyUnifiedDiff('diff --git a/a b/a\n', null), /executor function/);
});
