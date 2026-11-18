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
  assert.match(script, /URI="\$\{METADATA_URI\}"/);
  assert.match(script, /Existing metadata does not exactly match the canonical GLORIFIER\/GLR name, symbol, and URI/);
});

test('every prior recovery phase requires a real transaction signature', () => {
  assert.match(script, /SIGNATURE_PATTERN/);
  assert.match(script, /require_signature "\$\{METADATA_TX\}"/);
  assert.match(script, /require_signature "\$\{ACCOUNT_TX\}"/);
  assert.match(script, /require_signature "\$\{MINT_TX\}"/);
  assert.match(script, /require_signature "\$\{MINT_AUTH_TX\}"/);
  assert.match(script, /require_signature "\$\{FREEZE_AUTH_TX\}"/);
  assert.match(script, /require_signature "\$\{METADATA_AUTH_TX\}"/);
  assert.match(script, /require_signature "\$\{POINTER_AUTH_TX\}"/);
  assert.doesNotMatch(script, /== null or/);
});

test('metadata authority revocation is inside a valid fail-closed branch', () => {
  assert.match(script, /if is_disabled "\$\{METADATA_AUTHORITY\}"; then[\s\S]*?else[\s\S]*?authorize "\$\{MINT\}" metadata --disable/);
  assert.match(script, /FINAL_METADATA_AUTHORITY/);
});
