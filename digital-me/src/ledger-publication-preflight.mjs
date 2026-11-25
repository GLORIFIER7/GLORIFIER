import { createHash } from 'node:crypto';

// Read-only adapter contract for the existing AutopilotMissionStore. No queue,
// credentials, API writes, workflow dispatch, merge, or runtime registration.
const REPOSITORY = 'GLORIFIER7/GLORIFIER';
const CAPABILITY = 'github.publish_reviewed_patch';
const PATHS = new Set(['src/lib/use-accessible-dialog.ts']);
const keys = ['base','patchPath','patchSha256','paths','repository','source'];
const isRecord = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const sha = v => typeof v === 'string' && /^[a-f0-9]{40}$/.test(v);
const sha256 = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const id = v => typeof v === 'string' && /^[A-Za-z0-9._:-]{1,256}$/.test(v);
const iso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const fail = reason => { throw new Error('Publication preflight denied: '+reason); };
function normalize(m) {
  if (!isRecord(m) || !id(m.id) || !id(m.requester) || !Array.isArray(m.steps) || m.steps.length !== 1) fail('invalid mission shape');
  const step=m.steps[0];
  if (!isRecord(step) || !id(step.id) || !id(step.idempotencyKey) || step.capability!==CAPABILITY || step.effect!=='reversible') fail('unsupported capability');
  const a=step.toolArguments, approval=step.approval;
  if (!isRecord(a) || Object.keys(a).length!==keys.length || Object.keys(a).some(key=>!keys.includes(key)) || a.repository!==REPOSITORY || !sha(a.base) || !sha(a.source) || !sha256(a.patchSha256)) fail('invalid immutable target');
  if (typeof a.patchPath!=='string' || a.patchPath.length>180 || !a.patchPath.endsWith('.patch') || !a.patchPath.split('/').every(s=>/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(s))) fail('invalid patch path');
  if (!Array.isArray(a.paths) || a.paths.length!==1 || !PATHS.has(a.paths[0])) fail('path not explicitly reviewed');
  if (!isRecord(approval) || approval.approvedBy!==m.requester || !iso(approval.approvedAt) || !id(approval.evidenceRef)) fail('missing bound approval');
  return {missionId:m.id,requester:m.requester,stepId:step.id,idempotencyKey:step.idempotencyKey,capability:CAPABILITY,effect:step.effect,repository:REPOSITORY,base:a.base,source:a.source,patchPath:a.patchPath,patchSha256:a.patchSha256,paths:[...a.paths],approvedBy:approval.approvedBy,approvedAt:approval.approvedAt,evidenceRef:approval.evidenceRef};
}
export function publicationDigest(mission) {
  return createHash('sha256').update(JSON.stringify(normalize(mission))).digest('hex');
}
function inspect(m,intent) {
  const normalized=normalize(m);
  if (m.id!==intent.missionId || m.requester!==intent.requester || normalized.stepId!==intent.stepId || m.version!==intent.version || m.status!=='executing' || m.leaseOwner!==intent.workerId) fail('lease or mission identity changed');
  if (!iso(m.leaseExpiresAt) || Date.parse(m.leaseExpiresAt)<=Date.parse(intent.now) || Date.parse(m.leaseExpiresAt)-Date.parse(intent.now)>30*60_000) fail('lease expired or invalid');
  if (m.steps[0].status!=='running' || m.steps[0].attemptCount!==1) fail('step not on its first claimed attempt; reconcile before retry');
  if (Date.parse(normalized.approvedAt)>Date.parse(intent.now)) fail('approval from future');
  return normalized;
}
// Dependencies must be supplied by trusted authenticated runtime adapters; a
// returned proof is not a signer capability. This only validates a snapshot.
export async function inspectPublicationLease(intent,deps) {
  if (!isRecord(intent) || ![intent.missionId,intent.stepId,intent.requester,intent.workerId].every(id) || !Number.isSafeInteger(intent.version) || intent.version<1 || !iso(intent.now)) fail('invalid trusted lease context');
  if (!isRecord(deps) || !['getMission','getSignedMain','verifyApproval'].every(k=>typeof deps[k]==='function')) fail('trusted adapters unavailable');
  const first=await deps.getMission(intent.missionId);
  const normalized=inspect(first,intent);
  const authorizationDigest=publicationDigest(first);
  const main=await deps.getSignedMain();
  if (main?.sha!==normalized.base || main.verified!==true || main.reason!=='valid') fail('stale or unsigned main');
  const proof=await deps.verifyApproval({authorizationDigest,principal:normalized.approvedBy,evidenceRef:normalized.evidenceRef,missionId:normalized.missionId});
  if (proof?.verified!==true || proof.principal!==normalized.approvedBy || proof.authorizationDigest!==authorizationDigest || !iso(proof.expiresAt) || Date.parse(proof.expiresAt)<=Date.parse(intent.now)) fail('independent approval proof missing, expired or mismatched');
  const current=await deps.getMission(intent.missionId);
  inspect(current,intent);
  if (publicationDigest(current)!==authorizationDigest || current.leaseExpiresAt!==first.leaseExpiresAt) fail('authorization or lease changed');
  return Object.freeze({status:'preflight-passed',authorizationDigest,missionId:intent.missionId,version:intent.version,publicationAuthorized:false});
}
