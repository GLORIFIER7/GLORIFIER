import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const agaveWorkflows = [
  '.github/workflows/glorifier-solana-devnet-reconcile.yml',
  '.github/workflows/glorifier-solana-devnet-resume.yml',
  '.github/workflows/glorifier-solana-devnet.yml',
];

const agaveSha256 = '5fc8684f7430038105fde953d4308ed56addf627f658daa61709f345448247ee';

for (const workflow of agaveWorkflows) {
  test(workflow + ' verifies the pinned Agave release archive before extraction', () => {
    const source = read(workflow);
    assert.match(source, new RegExp(agaveSha256));
    assert.match(source, /sha256sum --check --strict/);
    assert.match(source, /curl --fail --show-error --silent --location --proto '=https' --tlsv1\.2/);
    assert.ok(source.indexOf('sha256sum --check --strict') < source.indexOf('tar -xjf'));
    assert.doesNotMatch(source, /sh -c "\$\(curl[^"]*release\.anza\.xyz/);
  });
}

const actionPins = [
  ['.github/workflows/codex-gemini-review.yml', 'openai/codex-action', 'bdf19a4a223ec2549a3e2274a0cf61556bc07675'],
  ['.github/workflows/gemini-collaborator.yml', 'google-github-actions/run-gemini-cli', 'f77273f4c914e4bf38440cf36a0369cb64a37489'],
  ['.github/workflows/glorifier-bnb-testnet-deploy.yml', 'foundry-rs/foundry-toolchain', 'dba66c27052e63476d886f22216e119ba7e615bf'],
  ['.github/workflows/glorifier-sepolia-rpc-check.yml', 'foundry-rs/foundry-toolchain', 'dba66c27052e63476d886f22216e119ba7e615bf'],
  ['.github/workflows/glorifier-testnet-deploy.yml', 'foundry-rs/foundry-toolchain', 'dba66c27052e63476d886f22216e119ba7e615bf'],
  ['.github/workflows/glorifier-contracts.yml', 'foundry-rs/foundry-toolchain', 'dba66c27052e63476d886f22216e119ba7e615bf'],
];

for (const [workflow, action, sha] of actionPins) {
  test(workflow + ' pins ' + action + ' to its verified immutable commit', () => {
    assert.ok(read(workflow).includes('uses: ' + action + '@' + sha));
  });
}

for (const script of ['scripts/continuous-improvement-agent.mjs', 'scripts/code-guardian.mjs']) {
  test(script + ' uses an owner-only temporary directory for patch files', () => {
    const source = read(script);
    assert.match(source, /withPrivateTempFile/);
    assert.doesNotMatch(source, /['"]\/tmp\/glorifier-[^'"]+['"]/);
  });
}

test('private temp directory helper creates unique mode-0700 directories and cleans up', async () => {
  const { createPrivateTempDir } = await import('./private-temp-dir.mjs');
  const first = createPrivateTempDir('glorifier-security-test');
  const second = createPrivateTempDir('glorifier-security-test');
  try {
    assert.notEqual(first, second);
    assert.equal(path.dirname(first), os.tmpdir());
    assert.equal(path.dirname(second), os.tmpdir());
    assert.equal(fs.statSync(first).mode & 0o777, 0o700);
    assert.equal(fs.statSync(second).mode & 0o777, 0o700);
    assert.throws(() => createPrivateTempDir('../unsafe'), /prefix must be/);
    assert.throws(() => createPrivateTempDir('contains spaces'), /prefix must be/);
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});

const mainnetRevocationScripts = [
  'solana/revoke-token2022-metadata-authority.mjs',
  'solana/revoke-token2022-metadata-pointer.mjs',
];

for (const script of mainnetRevocationScripts) {
  test(script + ' delegates dependency-directory validation to the shared private loader', () => {
    const source = read(script);
    assert.match(source, /createPrivateToken2022Require/);
    assert.doesNotMatch(source, /fs\.lstatSync/);
    assert.doesNotMatch(source, /\/tmp\/glorifier-token2022-js/);
  });
}

test('shared Token-2022 loader rejects missing, public, and symlinked dependency directories', async () => {
  const { createPrivateToken2022Require } = await import('../solana/private-token2022-modules.mjs');
  const previous = process.env.GLORIFIER_TOKEN2022_NODE_MODULES_DIR;
  const valid = fs.mkdtempSync(path.join(os.tmpdir(), 'glorifier-token-modules-test-'));
  const link = path.join(os.tmpdir(), 'glorifier-token-modules-link-' + process.pid);
  try {
    delete process.env.GLORIFIER_TOKEN2022_NODE_MODULES_DIR;
    assert.throws(() => createPrivateToken2022Require(), /is required/);

    fs.chmodSync(valid, 0o700);
    process.env.GLORIFIER_TOKEN2022_NODE_MODULES_DIR = valid;
    assert.equal(typeof createPrivateToken2022Require(), 'function');

    fs.chmodSync(valid, 0o755);
    assert.throws(() => createPrivateToken2022Require(), /mode 0700/);

    fs.chmodSync(valid, 0o700);
    fs.symlinkSync(valid, link, 'dir');
    process.env.GLORIFIER_TOKEN2022_NODE_MODULES_DIR = link;
    assert.throws(() => createPrivateToken2022Require(), /non-symlink/);
  } finally {
    if (previous === undefined) delete process.env.GLORIFIER_TOKEN2022_NODE_MODULES_DIR;
    else process.env.GLORIFIER_TOKEN2022_NODE_MODULES_DIR = previous;
    fs.rmSync(link, { force: true });
    fs.rmSync(valid, { recursive: true, force: true });
  }
});

test('Mainnet Token-2022 runner creates and removes a unique private dependency directory', () => {
  const source = read('solana/deploy-token2022-mainnet.sh');
  assert.match(source, /mktemp -d/);
  assert.match(source, /chmod 700/);
  assert.match(source, /export GLORIFIER_TOKEN2022_NODE_MODULES_DIR/);
  assert.match(source, /trap .*rm -rf.*GLORIFIER_TOKEN2022_NODE_MODULES_DIR.* EXIT/);
  assert.match(source, /npm install --prefix "\$GLORIFIER_TOKEN2022_NODE_MODULES_DIR"/);
  assert.doesNotMatch(source, /npm install --prefix \/tmp\/glorifier-token2022-js/);
});

test('private patch file helper enforces mode 0600 and removes files after success or failure', async () => {
  const { withPrivateTempFile } = await import('./private-temp-file.mjs');
  let successFile;
  let successDirectory;
  const value = withPrivateTempFile(
    { prefix: 'glorifier-patch-test', fileName: 'success.patch', content: 'valid patch' },
    (filePath) => {
      successFile = filePath;
      successDirectory = path.dirname(filePath);
      assert.equal(fs.statSync(successDirectory).mode & 0o777, 0o700);
      assert.equal(fs.statSync(filePath).mode & 0o777, 0o600);
      assert.equal(fs.readFileSync(filePath, 'utf8'), 'valid patch');
      return 'applied';
    },
  );
  assert.equal(value, 'applied');
  assert.equal(fs.existsSync(successFile), false);
  assert.equal(fs.existsSync(successDirectory), false);

  let failureFile;
  let failureDirectory;
  assert.throws(() => withPrivateTempFile(
    { prefix: 'glorifier-patch-test', fileName: 'failure.patch', content: 'invalid patch' },
    (filePath) => {
      failureFile = filePath;
      failureDirectory = path.dirname(filePath);
      throw new Error('git apply failed');
    },
  ), /git apply failed/);
  assert.equal(fs.existsSync(failureFile), false);
  assert.equal(fs.existsSync(failureDirectory), false);
  assert.throws(() => withPrivateTempFile(
    { prefix: 'glorifier-patch-test', fileName: '../escape.patch', content: 'x' },
    () => undefined,
  ), /single path segment/);
});
