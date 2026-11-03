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
    assert.match(source, /createPrivateTempDir/);
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
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});
