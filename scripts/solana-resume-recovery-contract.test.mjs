import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../solana/resume-recovered-token2022-devnet.sh', import.meta.url));
const script = readFileSync(scriptPath, 'utf8');

test('recovered Token-2022 script passes Bash syntax parsing without execution', () => {
  execFileSync('bash', ['-n', scriptPath], { stdio: 'pipe' });
});

test('recovery requires the authorized workflow and the exact metadata URI', () => {
  assert.ok(script.includes('GLORIFIER_AUTHORIZED_WORKFLOW'));
  assert.ok(script.includes('METADATA_URI'));
  assert.ok(script.includes('Existing metadata does not exactly match the canonical GLORIFIER/GLR name, symbol, and URI'));
});

test('every prior recovery phase requires transaction receipt validation', () => {
  assert.ok(script.includes('SIGNATURE_PATTERN'));
  assert.ok(script.includes('require_signature'));
  assert.ok(script.includes('METADATA_TX'));
  assert.ok(script.includes('ACCOUNT_TX'));
  assert.ok(script.includes('MINT_TX'));
  assert.ok(script.includes('MINT_AUTH_TX'));
  assert.ok(script.includes('FREEZE_AUTH_TX'));
  assert.ok(script.includes('METADATA_AUTH_TX'));
  assert.ok(script.includes('POINTER_AUTH_TX'));
});

test('metadata authority revocation is inside a valid fail-closed branch', () => {
  assert.ok(script.includes('if is_disabled'));
  assert.ok(script.includes('authorize'));
  assert.ok(script.includes('FINAL_METADATA_AUTHORITY'));
});

test('Solana transaction signatures enforce the canonical 64-88 character base58 length', () => {
  assert.ok(script.includes("readonly SIGNATURE_PATTERN='^[1-9A-HJ-NP-Za-km-z]{64,88}$'"));
  assert.ok(!script.includes('{64,90}'));
});

test('missing authority fields are not interpreted as disabled authorities', () => {
  const start = script.indexOf('is_disabled() {');
  const end = script.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start);
  const helper = script.slice(start, end);
  assert.ok(!helper.includes('-z "$1"'));
  assert.ok(helper.includes('"None"'));
});

test('existing recovery signatures are reconciled to finalized transaction-history receipts', () => {
  assert.ok(script.includes('python3 solana/verify-token2022-devnet-history.py'));
  assert.ok(script.includes('reconcile_receipt'));
  assert.ok(script.includes('creationTransaction'));
  assert.ok(script.includes('transactionSemanticsVerified'));
});

test('a never-initialized freeze authority uses an explicit non-transaction receipt', () => {
  assert.ok(script.includes('NOT_APPLICABLE_NEVER_SET'));
  assert.ok(script.includes('require_receipt'));
});

test('reused evidence is verified against finalized transactions and the expected operation', () => {
  assert.match(script, /verify_finalized_transaction/);
  assert.match(script, /commitment:"finalized"/);
  assert.match(script, /\.result\.meta\.err == null/);
  assert.match(script, /\.result\.transaction\.signatures\[0\] == \$signature/);
  assert.match(script, /\.result\.transaction\.message\.instructions/);
});

test('missing authority output is not treated as a revoked authority', () => {
  assert.match(script, /\[\[ "\$1" == "None" \|\| "\$1" == "Disabled" \|\| "\$1" == "\(not set\)" \]\]/);
  assert.doesNotMatch(script, /\[\[ -z "\$1" \|\|/);
});

test('Solana signatures use the canonical base58 length range', () => {
  assert.match(script, /SIGNATURE_PATTERN='\^\[1-9A-HJ-NP-Za-km-z\]\{64,88\}\$'/);
  assert.doesNotMatch(script, /\{64,90\}/);
});
