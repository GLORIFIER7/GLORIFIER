import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../solana/resume-recovered-token2022-devnet.sh', import.meta.url));
const script = readFileSync(scriptPath, 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('recovered Token-2022 script passes Bash syntax parsing without execution', () => {
  assert.doesNotThrow(() => execFileSync('bash', ['-n', scriptPath], { stdio: 'pipe' }));
});

test('recovery is limited to the authorized workflow and canonical metadata tuple', () => {
  assert.ok(script.includes('GLORIFIER_AUTHORIZED_WORKFLOW'));
  assert.ok(script.includes('METADATA_URI'));
  assert.ok(script.includes('Existing metadata does not exactly match the canonical GLORIFIER/GLR name, symbol, and URI'));
});

test('all lifecycle receipts are reconciled against the complete finalized history', () => {
  const receipts = [
    ['CREATION_TX', 'creationTransaction'],
    ['METADATA_TX', 'metadataTransaction'],
    ['ACCOUNT_TX', 'tokenAccountCreationTransaction'],
    ['MINT_TX', 'mintTransaction'],
    ['MINT_AUTH_TX', 'mintAuthorityRevocationTransaction'],
    ['FREEZE_AUTH_TX', 'freezeAuthorityRevocationTransaction'],
    ['METADATA_AUTH_TX', 'metadataUpdateAuthorityRevocationTransaction'],
    ['POINTER_AUTH_TX', 'metadataPointerAuthorityRevocationTransaction'],
  ];
  for (const [variable, field] of receipts) {
    assert.ok(
      script.includes('reconcile_receipt ' + variable + ' ' + field),
      variable + ' must be reconciled from finalized history',
    );
  }
  assert.ok(script.includes('python3 solana/verify-token2022-devnet-history.py "\${MINT}"'));
  assert.ok(script.includes('.transactionSemanticsVerified == true'));
  assert.ok(script.includes('.historyComplete == true'));
  assert.ok(script.includes('require_receipt "$verified_receipt" "$label"'));
});

test('finalized transaction validation binds the parsed instruction to the exact mint', () => {
  const start = script.indexOf('verify_finalized_transaction() {');
  const end = script.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start);
  const verifier = script.slice(start, end);
  assert.ok(verifier.includes('$parsed.info.mint == $mint'));
  assert.ok(verifier.includes('$parsed.info.metadata == $mint'));
  assert.ok(verifier.includes('$parsed.info.metadataAddress == $mint'));
  assert.ok(!verifier.includes('accountKeys'));
});

test('metadata update-authority revocation does not require a nonexistent authorityType field', () => {
  assert.ok(script.includes('$parsed.type == "updateTokenMetadataAuthority" and $parsed.info.newAuthority == null'));
  assert.ok(script.includes('$parsed.info.authorityType == $expected_authority_type'));
  assert.ok(script.includes('verify_finalized_transaction "\${METADATA_AUTH_TX}"'));
});

test('new metadata and pointer authority revocations are finalized before evidence publication', () => {
  assert.ok(script.includes('verify_finalized_transaction "\${METADATA_AUTH_TX}"'));
  assert.ok(script.includes('verify_finalized_transaction "\${POINTER_AUTH_TX}"'));
  assert.ok(script.includes('commitment:"finalized"'));
  assert.ok(script.includes('.result.meta.err == null'));
});

test('freeze authority that was never initialized uses an explicit non-transaction receipt', () => {
  assert.ok(script.includes('NOT_APPLICABLE_NEVER_SET'));
  assert.ok(script.includes('if is_disabled "\${current_authority}"; then\n    return'));
  assert.ok(script.includes('freezeAuthorityRevocationTransaction'));
});

test('missing authority fields are not interpreted as disabled authorities', () => {
  const start = script.indexOf('is_disabled() {');
  const end = script.indexOf('\n}', start);
  assert.ok(start >= 0 && end > start);
  const helper = script.slice(start, end);
  assert.ok(!helper.includes('-z "$1"'));
  assert.ok(helper.includes('"None"'));
});

test('Solana signatures enforce the canonical 64-88 character base58 length', () => {
  assert.ok(script.includes("readonly SIGNATURE_PATTERN='^[1-9A-HJ-NP-Za-km-z]{64,88}$'"));
  assert.ok(!script.includes('{64,90}'));
});

test('published recovery evidence requires full finalized transaction-semantic verification', () => {
  assert.ok(script.includes('status:"VERIFIED_ON_CHAIN"'));
  assert.ok(script.includes('.status == "VERIFIED_ON_CHAIN"'));
  assert.ok(script.includes('transactionSemanticsVerified:true'));
});

test('the recovery contract test is exposed as an npm script and runs in required CI', () => {
  assert.equal(
    packageJson.scripts['test:solana-resume-recovery'],
    'node --test scripts/solana-resume-recovery-contract.test.mjs',
  );
  assert.ok(ciWorkflow.includes('npm run test:solana-resume-recovery'));
});
