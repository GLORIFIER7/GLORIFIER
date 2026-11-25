import { readFileSync, statSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { admitCodingMission } from './coding-mission-admission.mjs';

const REQUESTER = 'github:32674233';
const COMMANDS = new Set(['/glorifier plan', '/glorifier explain', '/glorifier fix', '/glorifier review']);
// Emit only fixed diagnostic categories; never print driver messages, DSNs, or event data.
class AdmissionFailure extends Error {}
function ledgerFailure(error) {
  const code = error?.code;
  if (['28P01','28000'].includes(code)) return 'ADMISSION_DB_AUTH_FAILED';
  if (code === '42501') return 'ADMISSION_DB_PERMISSION_DENIED';
  if (['23502','23503','23505','23514','22P02'].includes(code)) return 'ADMISSION_DB_CONSTRAINT_FAILED';
  if (['CERT_HAS_EXPIRED','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_TLS_CERT_ALTNAME_INVALID','ERR_SSL_WRONG_VERSION_NUMBER'].includes(code)) return 'ADMISSION_DB_TLS_FAILED';
  if (['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','08000','08001','08003','08004','08006','08007','57P01','57P02','57P03','57P05'].includes(code)) return 'ADMISSION_DB_NETWORK_FAILED';
  return 'ADMISSION_DB_WRITE_FAILED';
}
async function stage(code, operation, classify = () => code) {
  try { return await operation(); }
  catch (error) { throw new AdmissionFailure(classify(error)); }
}
function connection(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Dedicated admission database URL required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.hash ||
      url.searchParams.getAll('sslmode').length !== 1 || url.searchParams.get('sslmode') !== 'verify-full' ||
      [...url.searchParams.keys()].some(key => key !== 'sslmode')) throw new Error('Dedicated admission database must use verified TLS');
  url.search = '';
  return url.toString();
}
async function openScopedStore(connectionString) {
  const { WorkerAutopilotMissionStore } = await import('../../src/lib/autopilot-worker-store.ts');
  const { Client } = await import('pg');
  // Reuse the existing transaction-local requester/RLS and atomic INSERT contract.
  // Do not initialize schema, recover leases, or grant elevated worker access.
  return new WorkerAutopilotMissionStore({ connectionString }, { requester: REQUESTER, allowAll: false },
    (dsn, options) => new Client({ connectionString: dsn, ...options, ssl: { rejectUnauthorized: true } }));
}
async function verify(context) {
  const { verifyCodingTarget } = await import('./coding-target.mjs');
  return verifyCodingTarget(context);
}
export async function runAdmission({ env, event }, { verifyTarget = verify, openStore = openScopedStore, now } = {}) {
  if (env?.DIGITAL_ME_ADMISSION_ENABLED !== 'true') return { status: 'DISABLED' };
  if (!COMMANDS.has(event?.comment?.body)) return { status: 'IGNORED' };
  const context = { env, event, token: env.GITHUB_TOKEN };
  // The admission module first authenticates and verifies immutable GitHub context.
  // No database connection is opened for ignored, forged, or stale commands.
  try {
    return await admitCodingMission(context, { verifyTarget: ctx => stage('ADMISSION_TARGET_FAILED', () => verifyTarget(ctx)), now, store: {
      async create(mission) {
        const dsn = await stage('ADMISSION_DSN_INVALID', () => connection(env.DIGITAL_ME_ADMISSION_DATABASE_URL));
        const store = await stage('ADMISSION_STORE_OPEN_FAILED', () => openStore(dsn));
        return stage('ADMISSION_DB_WRITE_FAILED', () => store.create(mission), ledgerFailure);
      },
    } });
  } catch (error) {
    if (error instanceof AdmissionFailure) throw error;
    throw new AdmissionFailure('ADMISSION_CONTEXT_OR_RESULT_INVALID');
  }
}
async function main(env = process.env) {
  const path = env.GITHUB_EVENT_PATH;
  if (!path || statSync(path).size > 1024 * 1024) throw new Error('Missing or oversized event');
  const result = await runAdmission({ env, event: JSON.parse(readFileSync(path, 'utf8')) });
  const output = JSON.stringify(result);
  console.log(output);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, '## Coding mission admission\n\n`' + output + '`\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); } catch (error) {
    const code = error instanceof AdmissionFailure ? error.message : 'ADMISSION_EVENT_OR_SUMMARY_FAILED';
    console.error('Coding admission not confirmed: ' + code + '; reconcile the immutable comment ID before retrying.');
    process.exitCode = 1;
  }
}
