import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const recipeId = 'admission-sqlstate-classification';
export const recipePaths = Object.freeze([
  'digital-me/src/coding-admission-actions.mjs',
  'digital-me/test/coding-admission-actions.test.mjs',
]);
const focusedTests = [
  'digital-me/test/coding-intake.test.mjs',
  'digital-me/test/coding-target.test.mjs',
  'digital-me/test/coding-mission-admission.test.mjs',
  recipePaths[1],
];
const originalBlobs = ['9e89a276070e5c35d768a5a0958c5e850c480ebc', 'd868c05eae6dc029b15fbcd70a3c624455d48bf8'];
const repairedBlobs = ['297925e006307f40a40fd9caf8e7ecc1af887ac8', '50d424a7c60da38a7102a17842eca64d0d028ce3'];
const originalHashes = [
  '5070f8837123b53a6d6a4d0be0bc26297687ba7caa8cab44c9ad756b7ba2897d',
  '59a7fca3a98ad1a83a95427d54ca275691e89439ab645e8b5ad1476c87401b72',
];
const repairedHashes = [
  'f3f98122e3beddf698c876bcf606e211c3b1c731817236328ecb823777d26faa',
  'b0af71663c2be6140d6be1420fb6d437554497b0893cda88dfe40ede92366580',
];
const previousCodes = "'08000','08001','08003','08004','08006','08007','08P01','57P01','57P02','57P03','57P04','57P05'";
const transportCodes = "'08000','08001','08003','08004','08006','08007','57P01','57P02','57P03','57P05'";
const previousTest = `... [${previousCodes}].map(code=>[code,'ADMISSION_DB_NETWORK_FAILED']),['secret arbitrary code','ADMISSION_DB_WRITE_FAILED']`;
const regressionTest = `... [${transportCodes}].map(code=>[code,'ADMISSION_DB_NETWORK_FAILED']),['08P01','ADMISSION_DB_WRITE_FAILED'],['57P04','ADMISSION_DB_WRITE_FAILED'],['secret arbitrary code','ADMISSION_DB_WRITE_FAILED']`;

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const matching = (files, hashes) => files.every((file, index) => sha256(file) === hashes[index]);
const GIT_EXECUTABLE = process.platform === 'win32' ? 'C:\\Program Files\\Git\\cmd\\git.exe' : '/usr/bin/git';

function git(cwd, args) {
  return execFileSync(GIT_EXECUTABLE, args, {
    cwd,
    env: { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' },
    timeout: 10_000,
  });
}

export function repairStatus(files) {
  if (!Array.isArray(files) || files.length !== recipePaths.length || !files.every(file => Buffer.isBuffer(file))) {
    throw Error('REPAIR_FILES_INVALID');
  }
  if (matching(files, repairedHashes)) return 'already-applied';
  if (matching(files, originalHashes)) return 'repair-required';
  throw Error('REPAIR_RULE_DENIED');
}

function replaceOnce(file, before, after) {
  const text = file.toString('utf8');
  if (text.split(before).length !== 2) throw Error('REPAIR_ANCHOR_CHANGED');
  return Buffer.from(text.replace(before, after));
}

export function deriveRepair(files) {
  if (repairStatus(files) !== 'repair-required') throw Error('REPAIR_ALREADY_APPLIED');
  const repaired = [
    replaceOnce(files[0], previousCodes, transportCodes),
    replaceOnce(files[1], previousTest, regressionTest),
  ];
  if (!matching(repaired, repairedHashes)) throw Error('REPAIR_OUTPUT_CHANGED');
  const changes = recipePaths.map((path, index) => ({
    path,
    before: originalBlobs[index],
    after: repairedBlobs[index],
    contents: repaired[index].toString('base64'),
  }));
  return { changes, digest: sha256(JSON.stringify(changes)) };
}

export function readRepairFiles(cwd, sourceSha) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha) || git(cwd, ['rev-parse', 'HEAD']).toString('utf8').trim() !== sourceSha) {
    throw Error('SOURCE_CHANGED');
  }
  return recipePaths.map(path => {
    const entry = git(cwd, ['ls-tree', sourceSha, '--', path]).toString('utf8');
    const match = /^100644 blob ([a-f0-9]{40})\t/.exec(entry);
    const file = join(cwd, path);
    if (!match || !lstatSync(file).isFile()) throw Error('SOURCE_FILE_CHANGED');
    const bytes = readFileSync(file);
    if (!bytes.equals(git(cwd, ['cat-file', 'blob', match[1]]))) throw Error('SOURCE_FILE_CHANGED');
    return bytes;
  });
}

function runTests(cwd, paths) {
  // The candidate runs in its own Actions job. Child processes also get only
  // an explicit environment, without Actions tokens, DB credentials or Node hooks.
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...paths], {
    cwd, env: { CI: 'true' },
    encoding: 'utf8', timeout: 90_000, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.signal || result.status === null) throw Error('REPAIR_TEST_PROCESS_FAILED');
  return result;
}

export function verifyCandidate(cwd, sourceSha) {
  const files = readRepairFiles(cwd, sourceSha);
  if (runTests(cwd, focusedTests).status !== 0) throw Error('BASELINE_TESTS_FAILED');
  if (repairStatus(files) === 'already-applied') return { outcome: 'already-applied' };

  const manifest = deriveRepair(files);
  const write = (index, bytes) => writeFileSync(join(cwd, recipePaths[index]), bytes);
  try {
    write(1, Buffer.from(manifest.changes[1].contents, 'base64'));
    const red = runTests(cwd, [recipePaths[1]]);
    if (red.status !== 1 || !/^# fail 1$/m.test(red.stdout) ||
        !/not ok \d+ - admission failure diagnostics distinguish configuration/.test(red.stdout) ||
        !red.stdout.includes('ADMISSION_DB_NETWORK_FAILED') || !red.stdout.includes('ADMISSION_DB_WRITE_FAILED')) {
      throw Error('EXPECTED_REGRESSION_NOT_REPRODUCED');
    }
    write(0, Buffer.from(manifest.changes[0].contents, 'base64'));
    if (runTests(cwd, focusedTests).status !== 0) throw Error('REPAIRED_TESTS_FAILED');
    git(cwd, ['diff', '--check', '--', ...recipePaths]);
    if (repairStatus(recipePaths.map(path => readFileSync(join(cwd, path)))) !== 'already-applied') {
      throw Error('CANDIDATE_BYTES_CHANGED');
    }
    return { outcome: 'candidate-created', candidateDigest: manifest.digest };
  } finally {
    files.forEach((bytes, index) => write(index, bytes));
  }
}
