import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedPaths = [
  '__pycache__/example.cpython-312.pyc',
  'solana/__pycache__/verify-token2022-devnet-history.cpython-312.pyc',
  'solana/deployment-output.txt',
  'solana/deployment-status.txt',
  'solana/final-supply.txt',
  'solana/final-mint-state.txt',
  'solana/mint-account.txt',
  'solana/deployment-evidence.json',
  'solana/deployment-record.json',
  'solana/reconciliation-status.txt',
  'solana/reconciliation-account.txt',
  'solana/reconciliation-supply.txt',
  'solana/reconciliation-mint-state.txt',
  'solana/reconciliation-evidence.json',
];

for (const path of generatedPaths) {
  const result = spawnSync('git', ['check-ignore', '--no-index', '--quiet', '--', path], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `Expected generated artifact to be ignored: ${path}. ${result.stderr ?? ''}`,
  );
}

console.log(`Git ignore regression test passed for ${generatedPaths.length} generated paths.`);
