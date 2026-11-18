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
  assert.match(script, /GLORIFIER_AUTHORIZED_WORKFLOW/);
  assert.match(script, /\\[\\[ "\\$\\{URI\\}" == "\\$\\{METADATA_URI\\}" \\]\\]/);
  assert.match(script, /Existing metadata does not exactly match the canonical GLORIFIER\\/GLR name, symbol, and URI/);
});

test('every prior recovery phase requires a real transaction signature', () => {
  assert.match(script, /SIGNATURE_PATTERN/);
  assert.match(script, /require_signature "\\$\\{METADATA_TX\\}"/);
  assert.match(script, /require_signature "\\$\\{ACCOUNT_TX\\}"/);
  assert.match(script, /require_signature "\\$\\{MINT_TX\\}"/);
  assert.match(script, /require_signature "\\$\\{MINT_AUTH_TX\\}"/);
  assert.match(script, /require_signature "\\$\\{FREEZE_AUTH_TX\\}"/);
  assert.match(script, /require_signature "\\$\\{METADATA_AUTH_TX\\}"/);
  assert.match(script, /require_signature "\\$\\{POINTER_AUTH_TX\\}"/);
  assert.match(script, /all\\(\\.\\[\\]; type == "string" and test\\(/);
});

test('metadata authority revocation is inside a valid fail-closed branch', () => {
  assert.match(script, /if is_disabled "\\$\\{METADATA_AUTHORITY\\}"; then[\\s\\S]*?else[\\s\\S]*?authorize "\\$\\{MINT\\}" metadata --disable/);
  assert.match(script, /FINAL_METADATA_AUTHORITY/);
});

test('Solana transaction signatures enforce the canonical 64-88 character base58 length', () => {
  assert.match(script, /readonly SIGNATURE_PATTERN='\\^\\[1-9A-HJ-NP-Za-km-z\\]\\{64,88\\}\\$'/);
  assert.doesNotMatch(script, /\\{64,90\\}/);
});

test('missing authority fields are not interpreted as disabled authorities', () => {
  const helper = script.match(/is_disabled\\(\\) \\{([\\s\\S]*?)\\n\\}/)?.[1] ?? '';
  assert.notEqual(helper, '');
  assert.doesNotMatch(helper, /-z "\\$1"/);
  assert.match(helper, /"None"/);
});

test('existing recovery signatures are reconciled to finalized transaction-history receipts', () => {
  assert.match(script, /python3 solana\\/verify-token2022-devnet-history\\.py "\\$\\{MINT\\}"/);
  assert.match(script, /reconcile_receipt/);
  assert.match(script, /creationTransaction/);
  assert.match(script, /transactionSemanticsVerified/);
});

test('a never-initialized freeze authority uses an explicit non-transaction receipt', () => {
  assert.match(script, /NOT_APPLICABLE_NEVER_SET/);
  assert.match(script, /require_receipt/);
});
