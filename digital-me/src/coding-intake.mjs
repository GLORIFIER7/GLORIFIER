import { readFileSync, statSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const REPO = 'GLORIFIER7/GLORIFIER';
const OWNER_ID = 32674233;
const IGNORED = Object.freeze({ status: 'IGNORED' });
const STEPS = Object.freeze({
  plan: ['inspect-target', 'inspect-exact-source', 'propose-plan'],
  explain: ['inspect-target', 'inspect-exact-source', 'explain-with-evidence'],
  fix: ['inspect-target', 'inspect-exact-source', 'reproduce-with-test', 'propose-minimal-patch', 'request-isolated-validation', 'request-independent-review'],
  review: ['inspect-exact-pr-head', 'inspect-diff', 'identify-findings', 'report-with-evidence'],
});
const validId = n => Number.isSafeInteger(n) && n > 0;

// This boundary accepts only GitHub Actions-provided event context, not raw webhooks.
// A proposal is not a durable mission, an approval, or permission to execute.
export function buildCodingMission(env, event) {
  if (env.GITHUB_REPOSITORY !== REPO || env.GITHUB_EVENT_NAME !== 'issue_comment' ||
      env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_ACTOR_ID !== String(OWNER_ID) ||
      env.GITHUB_TRIGGERING_ACTOR !== 'GLORIFIER7' || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') ||
      event?.repository?.full_name !== REPO || event.action !== 'created' ||
      event.sender?.id !== OWNER_ID || event.sender?.type !== 'User' ||
      event.comment?.user?.id !== OWNER_ID || event.comment?.user?.type !== 'User' ||
      event.issue?.state !== 'open' || !validId(event.issue.number) || !validId(event.comment.id)) return IGNORED;
  const body = event.comment.body;
  if (typeof body !== 'string' || body.length > 32) return IGNORED;
  const command = /^\/glorifier (plan|explain|fix|review)$/.exec(body);
  // JS $ permits a final newline; exact equality closes that loophole.
  if (!command || command[0] !== body) return IGNORED;
  const intent = command[1];
  const kind = event.issue.pull_request ? 'pull_request' : 'issue';
  if (intent === 'review' && kind !== 'pull_request') return IGNORED;
  return {
    schemaVersion: 1,
    id: `github-comment-${event.comment.id}`,
    status: 'PROPOSAL_ONLY', repository: REPO, intent,
    target: { kind, number: event.issue.number },
    requestedBy: OWNER_ID, sourceSnapshotSha: env.GITHUB_SHA, targetHeadVerified: false,
    requestedSteps: [...STEPS[intent]],
    executionAuthorized: false, paidInferenceAuthorized: false,
    mergeAuthorized: false, deploymentAuthorized: false,
    fullyVerified: false,
  };
}

export function main(env = process.env) {
  const path = env.GITHUB_EVENT_PATH;
  if (!path || statSync(path).size > 1024 * 1024) throw new Error('Missing or oversized event');
  const mission = buildCodingMission(env, JSON.parse(readFileSync(path, 'utf8')));
  const output = JSON.stringify(mission, null, 2);
  console.log(output);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `## GLORIFIER coding intake\n\n\`\`\`json\n${output}\n\`\`\`\n`);
  return mission;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch { console.error('Coding intake failed; no action authorized.'); process.exitCode = 1; }
}
