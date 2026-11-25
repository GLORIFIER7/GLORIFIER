import { readFileSync, statSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { admitCodingMission } from './coding-mission-admission.mjs';

const REQUESTER = 'github:32674233';
const COMMANDS = new Set(['/glorifier plan', '/glorifier explain', '/glorifier fix', '/glorifier review']);
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
  return admitCodingMission(context, { verifyTarget, now, store: {
    async create(mission) {
      const dsn = connection(env.DIGITAL_ME_ADMISSION_DATABASE_URL);
      const store = await openStore(dsn);
      return store.create(mission);
    },
  } });
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
  try { await main(); } catch { console.error('Coding admission not confirmed; reconcile the immutable comment ID before retrying.'); process.exitCode = 1; }
}
