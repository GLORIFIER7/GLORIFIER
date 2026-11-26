import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const root = new URL('../../', import.meta.url);
const workflow = readFileSync(new URL('.github/workflows/digital-me-coding-repair.yml', root), 'utf8');
const rules = [...workflow.matchAll(/<<'V7_REPAIR'\n([\s\S]*?)^          V7_REPAIR$/gm)]
  .map(match => match[1].replace(/^          /gm, ''));
const paths = ['digital-me/src/coding-admission-actions.mjs', 'digital-me/test/coding-admission-actions.test.mjs'];
const historical = JSON.parse(readFileSync(new URL('./fixtures/coding-admission-repair.json', import.meta.url), 'utf8'));
const applied = historical.files.map(file => file.contents);
const original = [
  applied[0].replace("'08007','57P01','57P02','57P03','57P05'", "'08007','08P01','57P01','57P02','57P03','57P04','57P05'"),
  applied[1]
    .replace("'08007','57P01','57P02','57P03','57P05'", "'08007','08P01','57P01','57P02','57P03','57P04','57P05'")
    .replace(",['08P01','ADMISSION_DB_WRITE_FAILED'],['57P04','ADMISSION_DB_WRITE_FAILED']", ''),
];
const blob = text => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');

function fixture(t, files, rule = rules[0]) {
  const dir = mkdtempSync(join(tmpdir(), 'glorifier-coding-repair-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  paths.forEach((path, index) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), files[index]);
  });
  writeFileSync(join(dir, 'repair.mjs'), rule);
  const output = join(dir, 'outputs');
  const manifest = join(dir, 'manifest.json');
  return {
    dir, output, manifest,
    files: () => paths.map(path => readFileSync(join(dir, path), 'utf8')),
    run: mode => spawnSync(process.execPath, [join(dir, 'repair.mjs'), mode, manifest], {
      cwd: dir, env: { PATH: process.env.PATH, GITHUB_OUTPUT: output }, encoding: 'utf8',
    }),
  };
}

test('candidate and publication use the same bounded repair rule', () => {
  assert.deepEqual(historical.files.map(file => file.path), paths);
  assert.equal(rules.length, 2);
  assert.equal(rules[0], rules[1]);
  assert.deepEqual(original.map(blob), ['9e89a276070e5c35d768a5a0958c5e850c480ebc', 'd868c05eae6dc029b15fbcd70a3c624455d48bf8']);
});

test('the already-merged repair reports a no-op without creating a candidate or writing source', t => {
  const f = fixture(t, applied);
  const result = f.run('status');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'REPAIR_ALREADY_APPLIED');
  assert.deepEqual(f.files(), applied);
  assert.equal(existsSync(f.manifest), false);
  assert.equal(existsSync(f.output), false);
});

test('the original reviewed defect still produces exactly the reviewed repair', t => {
  const f = fixture(t, original);
  const status = f.run('status');
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.stdout.trim(), 'REPAIR_REQUIRED');
  assert.deepEqual(f.files(), original);
  const red = f.run('red');
  assert.equal(red.status, 0, red.stderr);
  assert.deepEqual(f.files(), [original[0], applied[1]]);
  const green = f.run('green');
  assert.equal(green.status, 0, green.stderr);
  assert.deepEqual(f.files(), applied);
  const manifest = JSON.parse(readFileSync(f.manifest, 'utf8'));
  assert.equal(readFileSync(f.output, 'utf8'), `candidate_digest=${manifest.digest}\n`);
});

test('mixed, altered and unknown files are denied without mutation or publication outputs', t => {
  for (const files of [[original[0], applied[1]], [applied[0], original[1]], [applied[0] + '\n', applied[1]], ['unknown', 'unknown']]) {
    const f = fixture(t, files);
    const result = f.run('status');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /REPAIR_RULE_DENIED/);
    assert.deepEqual(f.files(), files);
    assert.equal(existsSync(f.manifest), false);
    assert.equal(existsSync(f.output), false);
  }
});

test('publication re-derivation still rejects an already-applied repair', t => {
  const f = fixture(t, applied, rules[1]);
  const result = f.run('derive');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REPAIR_RULE_DENIED/);
  assert.equal(existsSync(f.manifest), false);
  assert.deepEqual(f.files(), applied);
});

test('workflow verifies tests before a no-op and only publishes a newly validated candidate', () => {
  const candidate = workflow.slice(workflow.indexOf('  candidate:'), workflow.indexOf('  publish:'));
  const publish = workflow.slice(workflow.indexOf('  publish:'));
  assert.match(candidate, /repair_status: \$\{\{ steps\.repair\.outputs\.repair_status \}\}/);
  assert.match(candidate, /node --test "\$\{tests\[@\]\}"[\s\S]*?repair\.mjs" status/);
  assert.match(candidate, /REPAIR_ALREADY_APPLIED[\s\S]*?repair_status=already-applied[\s\S]*?exit 0[\s\S]*?repair\.mjs" red/);
  assert.match(candidate, /node --test "\$\{tests\[@\]\}"[\s\S]*?git diff --check[\s\S]*?repair_status=candidate-created/);
  assert.match(candidate, /#471 remains open/);
  assert.match(publish, /if: vars\.DIGITAL_ME_AUTO_DISPATCH == 'true' && needs\.candidate\.outputs\.repair_status == 'candidate-created' && needs\.candidate\.outputs\.candidate_digest != ''/);
  assert.match(publish, /environment: digital-me-publish/);
});
