import { createHash } from 'node:crypto';

const REPO = 'GLORIFIER7/GLORIFIER';
const OWNER = 32674233;
const REQUESTER = `github:${OWNER}`;
const INTENTS = new Set(['plan', 'explain', 'fix', 'review']);
const FLAGS = ['executionAuthorized','paidInferenceAuthorized','mergeAuthorized','deploymentAuthorized','fullyVerified'];
const isSha = v => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v);
const isId = v => Number.isSafeInteger(v) && v > 0;
const deny = () => { throw new Error('Coding mission admission denied: invalid or changed trusted target'); };

// Call only from a trusted Actions adapter with verifyCodingTarget and the existing
// Postgres-backed AutopilotMissionStore. No raw HTTP endpoint or model-callable tool.
// Blocked rows are deliberately not claimable by the existing generic workers.
export async function admitCodingMission(context, {store, verifyTarget, now = () => new Date().toISOString()} = {}) {
  if (typeof verifyTarget !== 'function' || typeof store?.create !== 'function' || typeof now !== 'function') deny();
  const {env, event} = context ?? {};
  if (env?.GITHUB_REPOSITORY !== REPO || env.GITHUB_EVENT_NAME !== 'issue_comment' || env.GITHUB_REF !== 'refs/heads/main' || env.GITHUB_ACTOR_ID !== String(OWNER) || env.GITHUB_TRIGGERING_ACTOR !== 'GLORIFIER7' || !isSha(env.GITHUB_SHA) || event?.repository?.full_name !== REPO || event.action !== 'created' || event.sender?.id !== OWNER || event.sender.type !== 'User' || event.comment?.user?.id !== OWNER || event.comment.user.type !== 'User' || !isId(event.comment.id) || !isId(event.issue?.number) || event.issue.state !== 'open') deny();
  const evidence = await verifyTarget(context);
  if (evidence?.status === 'IGNORED') return {status:'IGNORED'};
  const kind = event.issue.pull_request ? 'pull_request' : 'issue';
  const intent = evidence?.intent;
  const idempotencyKey = `github:${REPO}:comment:${event.comment.id}`;
  if (evidence?.status !== 'TARGET_VERIFIED' || evidence.schemaVersion !== 1 || evidence.id !== `github-comment-${event.comment.id}` || evidence.repository !== REPO || evidence.requestedBy !== OWNER || evidence.sourceSnapshotSha !== env.GITHUB_SHA || !INTENTS.has(intent) || event.comment.body !== `/glorifier ${intent}` || (intent === 'review' && kind !== 'pull_request') || evidence.target?.kind !== kind || evidence.target.number !== event.issue.number || FLAGS.some(k => evidence[k] !== false)) deny();
  if (kind === 'pull_request' ? (evidence.targetHeadVerified !== true || !isSha(evidence.target.headSha)) : (evidence.targetHeadVerified !== false || evidence.target.headSha !== null)) deny();
  const time = now();
  if (typeof time !== 'string' || !Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time) deny();
  const objective = JSON.stringify({schemaVersion:1, repository:REPO, commentId:event.comment.id, intent, target:{kind,number:event.issue.number,headSha:evidence.target.headSha},sourceSnapshotSha:env.GITHUB_SHA,executionAuthorized:false});
  const id = 'mission-coding-' + createHash('sha256').update(idempotencyKey).digest('hex');
  const mission = {id, requester:REQUESTER, idempotencyKey, title:`GitHub ${intent} #${event.issue.number}`,objective,status:'blocked',verificationState:'not-started',version:1,steps:[],evidenceRefs:[],createdAt:time,updatedAt:time,lastError:'Coding admission only; trusted execution authorization and dedicated worker required.'};
  // The existing SQL unique constraint and ON CONFLICT readback handle concurrent
  // inserts; never overwrite a prior mission, even on a replay with changed main.
  const stored = await store.create(mission);
  if (stored?.id !== id || stored.requester !== REQUESTER || stored.idempotencyKey !== idempotencyKey || stored.objective !== objective || !Number.isSafeInteger(stored.version) || stored.version < 1 || !['blocked','queued','planning','executing','completed','failed','cancelled','reconciliation-required'].includes(stored.status)) throw new Error('Coding mission idempotency conflict or invalid ledger readback');
  return Object.freeze({status:stored.status === 'blocked' && stored.version === 1 ? 'ADMITTED_BLOCKED' : 'ALREADY_ADMITTED',missionId:stored.id,missionStatus:stored.status,executionAuthorized:false,publicationAuthorized:false,fullyVerified:false});
}
