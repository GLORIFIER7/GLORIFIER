import { readFileSync, statSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildCodingMission } from './coding-intake.mjs';

const API = 'https://api.github.com/repos/GLORIFIER7/GLORIFIER';
const REPO = 'GLORIFIER7/GLORIFIER';
const OWNER = 32674233;
const isSha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);

// Read-only reauthorization: never forwards issue text, executes source, or grants a mission lease.
export async function verifyCodingTarget({ env, event, token, fetcher = fetch }) {
  const proposal = buildCodingMission(env, event);
  if (proposal.status === 'IGNORED') return proposal;
  if (typeof token !== 'string' || !token.trim()) throw new Error('Read-only GitHub token required');
  const get = async path => {
    const r = await fetcher(API + path, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!r.ok) throw new Error('GitHub target readback failed: HTTP ' + r.status);
    return r.json();
  };
  const main = await get('/commits/main');
  if (main.sha !== proposal.sourceSnapshotSha || main.commit?.verification?.verified !== true || main.commit?.verification?.reason !== 'valid') throw new Error('Stale or unsigned main');
  const number = proposal.target.number;
  const issue = await get('/issues/' + number);
  if (issue.number !== number || issue.state !== 'open' || issue.url !== API + '/issues/' + number || Boolean(issue.pull_request) !== (proposal.target.kind === 'pull_request')) throw new Error('Changed or invalid target');
  const comment = await get('/issues/comments/' + event.comment.id);
  if (comment.id !== event.comment.id || comment.issue_url !== issue.url || comment.user?.id !== OWNER || comment.user?.type !== 'User' || comment.body !== '/glorifier ' + proposal.intent || typeof comment.created_at !== 'string' || !comment.created_at || comment.created_at !== comment.updated_at) throw new Error('Changed or invalid command comment');
  let headSha = null;
  if (proposal.target.kind === 'pull_request') {
    const pr = await get('/pulls/' + number);
    if (pr.number !== number || pr.state !== 'open' || pr.head?.repo?.full_name !== REPO || pr.base?.repo?.full_name !== REPO || pr.base?.ref !== 'main' || !isSha(pr.head?.sha)) throw new Error('Unsupported or invalid PR target');
    headSha = pr.head.sha;
  }
  return { ...proposal, status: 'TARGET_VERIFIED', target: { ...proposal.target, headSha }, targetHeadVerified: headSha !== null, executionAuthorized: false, fullyVerified: false };
}

async function main(env = process.env) {
  const path = env.GITHUB_EVENT_PATH;
  if (!path || statSync(path).size > 1024 * 1024) throw new Error('Missing or oversized event');
  const evidence = await verifyCodingTarget({ env, event: JSON.parse(readFileSync(path, 'utf8')), token: env.GITHUB_TOKEN });
  const output = JSON.stringify(evidence, null, 2);
  console.log(output);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `## GLORIFIER read-only coding target\n\n\`\`\`json\n${output}\n\`\`\`\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); } catch { console.error('Coding target verification failed; no execution authorized.'); process.exitCode = 1; }
}
