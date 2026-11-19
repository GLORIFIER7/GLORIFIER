import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('../solana/resume-recovered-token2022-devnet.sh', import.meta.url));
const script = readFileSync(scriptPath, 'utf8');

test('recovered Token-2022 script passes Bash syntax parsing without execution', () => {
  assert.ok(Buffer.isBuffer(execFileSync('bash', ['-n', scriptPath], { stdio: 'pipe' })));
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

test('published recovery evidence requires finalized transaction-semantic verification', () => {
  assert.ok(script.includes('status:"VERIFIED_ON_CHAIN"'));
  assert.ok(script.includes('.status == "VERIFIED_ON_CHAIN"'));
  assert.ok(script.includes('.historyComplete == true'));
});

test('metadata recovery rejects any name, symbol, or exact-URI mismatch', () => {
  assert.ok(script.includes('if [[ "${NAME}" != "GLORIFIER" || "${SYMBOL}" != "GLR" || "${URI}" != "${METADATA_URI}" ]]; then'));
});

test('each existing lifecycle receipt is checked against its exact Token-2022 operation', () => {
  const verifierCalls = [
    '[[ -z "${CREATION_TX}" ]] || verify_finalized_transaction "${CREATION_TX}" "mint creation" \'["initializeMint","initializeMint2"]\'',
    '[[ -z "${METADATA_TX}" ]] || verify_finalized_transaction "${METADATA_TX}" "metadata initialization" \'["initializeTokenMetadata","initializeMetadata"]\'',
    '[[ -z "${ACCOUNT_TX}" ]] || verify_finalized_transaction "${ACCOUNT_TX}" "token-account creation" \'["initializeAccount","initializeAccount2","initializeAccount3"]\'',
    '[[ -z "${MINT_TX}" ]] || verify_finalized_transaction "${MINT_TX}" "supply mint" \'["mintTo","mintToChecked"]\'',
    '[[ -z "${MINT_AUTH_TX}" ]] || verify_finalized_transaction "${MINT_AUTH_TX}" "mint authority revocation" \'["setAuthority"]\' "mintTokens"',
    '[[ -z "${FREEZE_AUTH_TX}" || "${FREEZE_AUTH_TX}" == "NOT_APPLICABLE_NEVER_SET" ]] || verify_finalized_transaction "${FREEZE_AUTH_TX}" "freeze authority revocation" \'["setAuthority"]\' "freezeAccount"',
    '[[ -z "${METADATA_AUTH_TX}" ]] || verify_finalized_transaction "${METADATA_AUTH_TX}" "metadata update-authority revocation" \'["updateTokenMetadataAuthority","setAuthority"]\' "metadata"',
    '[[ -z "${POINTER_AUTH_TX}" ]] || verify_finalized_transaction "${POINTER_AUTH_TX}" "metadata pointer-authority revocation" \'["updateMetadataPointerAuthority","setAuthority"]\' "metadataPointer"',
  ];
  for (const call of verifierCalls) assert.ok(script.includes(call), 'missing operation-specific verifier: ' + call);
});

test('metadata and pointer authority instructions are verified by instruction type', () => {
  assert.ok(script.includes('$parsed.type == "updateTokenMetadataAuthority"'));
  assert.ok(script.includes('$parsed.type == "updateMetadataPointerAuthority"'));
  assert.ok(script.includes('$expected_authority_type == "metadata"'));
  assert.ok(script.includes('$expected_authority_type == "metadataPointer"'));
});

test('an already-existing token account does not attempt to verify an empty receipt', () => {
  assert.ok(script.includes('[[ -z "${ACCOUNT_TX}" ]] || verify_finalized_transaction "${ACCOUNT_TX}" "existing token-account creation"'));
});

test('metadata authority is signer-checked before the revocation instruction', () => {
  const start = script.indexOf('METADATA_AUTHORITY="$(printf');
  const end = script.indexOf('\nCURRENT_POINTER_AUTH=', start);
  assert.ok(start >= 0 && end > start);
  const branch = script.slice(start, end);
  const signerGuard = branch.indexOf('[[ "${METADATA_AUTHORITY}" == "${SIGNER}" ]]');
  const revoke = branch.indexOf('authorize "${MINT}" metadata --disable');
  assert.ok(signerGuard >= 0 && revoke > signerGuard);
});

test('history reconciliation receives the mint and binds every lifecycle receipt to its field', () => {
  assert.ok(script.includes('python3 solana/verify-token2022-devnet-history.py "${MINT}"'));
  const mappings = [
    'reconcile_receipt CREATION_TX creationTransaction "mint creation"',
    'reconcile_receipt METADATA_TX metadataTransaction "metadata initialization"',
    'reconcile_receipt ACCOUNT_TX tokenAccountCreationTransaction "token-account creation"',
    'reconcile_receipt MINT_TX mintTransaction "supply mint"',
    'reconcile_receipt MINT_AUTH_TX mintAuthorityRevocationTransaction "mint authority revocation"',
    'reconcile_receipt FREEZE_AUTH_TX freezeAuthorityRevocationTransaction "freeze authority revocation"',
    'reconcile_receipt METADATA_AUTH_TX metadataUpdateAuthorityRevocationTransaction "metadata update-authority revocation"',
    'reconcile_receipt POINTER_AUTH_TX metadataPointerAuthorityRevocationTransaction "metadata pointer-authority revocation"',
  ];
  for (const mapping of mappings) assert.ok(script.includes(mapping), 'missing history receipt mapping: ' + mapping);
});

test('the non-transaction sentinel is accepted only for a never-set freeze authority', () => {
  assert.ok(script.includes('if [[ "$label" == "freeze authority revocation" && "$receipt" == "NOT_APPLICABLE_NEVER_SET" ]]; then'));
  assert.ok(script.includes('.freezeAuthorityRevocationTransaction == "NOT_APPLICABLE_NEVER_SET"'));
});

test('complete finalized history requires transaction-semantic verification before publication', () => {
  assert.ok(script.includes('.transactionSemanticsVerified == true'));
  assert.ok(script.includes('.historyComplete == true'));
});
