import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../solana/resume-recovered-token2022-devnet.sh', import.meta.url));
const script = readFileSync(scriptPath, 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const provenanceScriptPath = fileURLToPath(new URL('../solana/recover-deployment-provenance.sh', import.meta.url));
const provenanceScript = readFileSync(provenanceScriptPath, 'utf8');

test('recovered Token-2022 script passes Bash syntax parsing without execution', () => {
  assert.doesNotThrow(() => execFileSync('bash', ['-n', scriptPath], { stdio: 'pipe' }));
  assert.doesNotThrow(() => execFileSync('bash', ['-n', provenanceScriptPath], { stdio: 'pipe' }));
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
  assert.ok(verifier.includes('.result.transaction.signatures[0] == $signature'));
});

test('metadata update-authority revocation does not require a nonexistent authorityType field', () => {
  assert.ok(script.includes('$parsed.type == "updateTokenMetadataAuthority"'));
  assert.ok(script.includes('has("newAuthority") and .newAuthority == null'));
  assert.ok(script.includes('$parsed.info.authorityType == $expected_authority_type'));
  assert.ok(script.includes('verify_finalized_transaction "\${METADATA_AUTH_TX}"'));
});

test('new metadata and pointer authority revocations are verified against finalized transactions', () => {
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
  assert.ok(helper.includes('"Disabled"'));
  assert.ok(helper.includes('"(not set)"'));
});

test('Solana signatures enforce the canonical 64-88 character base58 length', () => {
  assert.ok(script.includes("readonly SIGNATURE_PATTERN='^[1-9A-HJ-NP-Za-km-z]{64,88}$'"));
  assert.ok(!script.includes('{64,90}'));
});

test('published recovery evidence preserves the downstream handoff and finalized-history proof', () => {
  assert.ok(script.includes('status:"READY_FOR_RECONCILIATION"'));
  assert.ok(script.includes('.status == "READY_FOR_RECONCILIATION"'));
  assert.ok(script.includes('transactionSemanticsVerified:true'));
  assert.ok(script.includes('transactionHistorySource:"FINALIZED_RPC_TRANSACTION_HISTORY"'));
  assert.ok(script.includes('historyComplete:true'));
  assert.ok(provenanceScript.includes('.status=="READY_FOR_RECONCILIATION"'));
  assert.ok(provenanceScript.includes('freeze-authority" && "${value}" == "NOT_APPLICABLE_NEVER_SET"'));
  assert.ok(provenanceScript.includes('.historyComplete==true'));
  assert.ok(provenanceScript.includes('"transactionHistorySource":"FINALIZED_RPC_TRANSACTION_HISTORY"'));
});

test('all history receipts are reconciled before evidence is atomically published', () => {
  const history = script.indexOf('python3 solana/verify-token2022-devnet-history.py "${MINT}"');
  const lastReceipt = script.indexOf('reconcile_receipt POINTER_AUTH_TX metadataPointerAuthorityRevocationTransaction');
  const tempEvidence = script.indexOf('TEMP_EVIDENCE="$(mktemp');
  const publish = script.indexOf('mv -f "${TEMP_EVIDENCE}" "${EVIDENCE_FILE}"');
  assert.ok(history >= 0 && lastReceipt > history);
  assert.ok(tempEvidence > lastReceipt);
  assert.ok(publish > tempEvidence);
});

test('the recovery contract test is exposed as an npm script and runs in required CI', () => {
  assert.equal(
    packageJson.scripts['test:solana-resume-recovery'],
    'node --test scripts/solana-resume-recovery-contract.test.mjs',
  );
  assert.ok(ciWorkflow.includes('npm run test:solana-resume-recovery'));
});
