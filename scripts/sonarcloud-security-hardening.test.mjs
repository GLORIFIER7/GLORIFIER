import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { applyUnifiedDiff } from './apply-unified-diff.mjs';

const agaveSources = [
  readFileSync(new URL('../.github/workflows/glorifier-solana-devnet-reconcile.yml', import.meta.url), 'utf8'),
  readFileSync(new URL('../.github/workflows/glorifier-solana-devnet-resume.yml', import.meta.url), 'utf8'),
  readFileSync(new URL('../.github/workflows/glorifier-solana-devnet.yml', import.meta.url), 'utf8'),
];
const agaveSha256 = '5fc8684f7430038105fde953d4308ed56addf627f658daa61709f345448247ee';

for (const [index, source] of agaveSources.entries()) {
  test('Agave Devnet workflow ' + (index + 1) + ' verifies the exact downloaded archive before extraction', () => {
    assert.ok(source.includes(agaveSha256));
    assert.match(source, /curl --fail --show-error --silent --location --proto '=https' --tlsv1\.2/);
    assert.ok(source.includes('"$ARCHIVE_URL" --output "$ARCHIVE"'));
    assert.ok(source.includes("printf '%s  %s\\n' \"$ARCHIVE_SHA256\" \"$ARCHIVE\" | sha256sum --check --strict"));
    assert.ok(source.includes('tar -xjf "$ARCHIVE"'));
    const checksumIndex = source.indexOf('sha256sum --check --strict');
    const extractionIndex = source.indexOf('tar -xjf "$ARCHIVE"');
    assert.ok(checksumIndex >= 0 && extractionIndex > checksumIndex, 'the exact verified archive must be extracted after checksum validation');
    assert.doesNotMatch(source, /sh -c "\$\(curl[^"]*release\.anza\.xyz/);
  });
}

const codexWorkflow = readFileSync(
  new URL('../.github/workflows/codex-gemini-review.yml', import.meta.url),
  'utf8',
);
const geminiWorkflow = readFileSync(
  new URL('../.github/workflows/gemini-collaborator.yml', import.meta.url),
  'utf8',
);
const foundryWorkflows = [
  readFileSync(new URL('../.github/workflows/glorifier-bnb-testnet-deploy.yml', import.meta.url), 'utf8'),
  readFileSync(new URL('../.github/workflows/glorifier-sepolia-rpc-check.yml', import.meta.url), 'utf8'),
  readFileSync(new URL('../.github/workflows/glorifier-testnet-deploy.yml', import.meta.url), 'utf8'),
  readFileSync(new URL('../.github/workflows/glorifier-contracts.yml', import.meta.url), 'utf8'),
];

function assertPinnedAction(source, action, sha) {
  const activeReferences = source.split(/\r?\n/).filter((line) => line.trimStart().startsWith('uses: ' + action + '@'));
  assert.ok(activeReferences.length > 0, 'expected an active uses: entry for ' + action);
  for (const line of activeReferences) {
    const actual = line.trim().split(/\s+#/, 1)[0].trim();
    assert.equal(actual, 'uses: ' + action + '@' + sha, 'unexpected or mutable action reference: ' + line.trim());
  }
}

test('Codex action is pinned to its reviewed immutable commit', () => {
  assertPinnedAction(codexWorkflow, 'openai/codex-action', 'bdf19a4a223ec2549a3e2274a0cf61556bc07675');
});

test('Gemini action is pinned to its reviewed immutable commit', () => {
  assertPinnedAction(geminiWorkflow, 'google-github-actions/run-gemini-cli', 'f77273f4c914e4bf38440cf36a0369cb64a37489');
});

test('all four Foundry workflow actions are pinned to the reviewed immutable commit', () => {
  for (const source of foundryWorkflows) {
    assertPinnedAction(source, 'foundry-rs/foundry-toolchain', 'dba66c27052e63476d886f22216e119ba7e615bf');
  }
});

const maintenanceSources = [
  readFileSync(new URL('../scripts/continuous-improvement-agent.mjs', import.meta.url), 'utf8'),
  readFileSync(new URL('../scripts/code-guardian.mjs', import.meta.url), 'utf8'),
];

for (const source of maintenanceSources) {
  test('AI maintenance agent applies diffs through stdin without writing a patch file', () => {
    assert.match(source, /applyUnifiedDiff/);
    assert.doesNotMatch(source, /\/tmp\/glorifier-/);
    assert.doesNotMatch(source, /writeFileSync|writeFile\(/);
  });
}

const tokenSources = [
  readFileSync(new URL('../solana/revoke-token2022-metadata-authority.mjs', import.meta.url), 'utf8'),
  readFileSync(new URL('../solana/revoke-token2022-metadata-pointer.mjs', import.meta.url), 'utf8'),
];

for (const source of tokenSources) {
  test('Token-2022 revocation script resolves modules through the workflow-provided NODE_PATH', () => {
    assert.match(source, /createRequire\(import\.meta\.url\)/);
    assert.doesNotMatch(source, /GLORIFIER_TOKEN2022_NODE_MODULES_DIR/);
    assert.doesNotMatch(source, /\/tmp\/glorifier-token2022-js/);
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
  const patch = 'diff --git a/src/example.ts b/src/example.ts\\n';
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
    'diff --git a/src/example.ts b/src/example.ts\\n',
    () => failed,
  );
  assert.equal(result, failed);
});

test('applyUnifiedDiff rejects missing patches and invalid executors', () => {
  assert.throws(() => applyUnifiedDiff('', () => ({ ok: true })), /non-empty unified diff/);
  assert.throws(() => applyUnifiedDiff('diff --git a/a b/a\\n', null), /executor function/);
});

test('Node loads the isolated module directory from NODE_PATH at process startup', () => {
  const probePath = '/private-runner-temp/node_modules';
  const result = execFileSync(
    process.execPath,
    ['-e', 'const Module = require("node:module"); process.stdout.write(Module.globalPaths.includes(process.env.NODE_PATH) ? "ok" : "missing");'],
    { encoding: 'utf8', env: { ...process.env, NODE_PATH: probePath } },
  );
  assert.equal(result, 'ok');
});
