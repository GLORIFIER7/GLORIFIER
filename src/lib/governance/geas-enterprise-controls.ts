import { createHash, randomUUID } from 'node:crypto';

export const GEAS_ENTERPRISE_CONTROLS_VERSION = 'GEAS-EC-1.0';
export type GovernanceStatus = 'PROPOSED'|'AUTHORIZED'|'EXECUTED'|'VERIFIED'|'PARTIALLY_VERIFIED'|'DEGRADED'|'NOT_VERIFIED'|'BLOCKED';

export interface DeploymentProvenance { contextId:string; commitSha:string; frontendDeploymentId?:string; backendDeploymentId?:string; databaseSchemaVersion?:string; environment:'production'|'staging'|'development'; deployedAt:string; verifiedAt?:string; }
export interface GovernedAction { actionId:string; contextId:string; capability:string; resource:string; payloadHash:string; authorityEnvelopeId:string; policyVersion:string; risk:'low'|'medium'|'high'|'critical'; irreversible:boolean; humanApprovalRequired:boolean; humanApprovalId?:string; status:GovernanceStatus; createdAt:string; }
export interface ApprovalBinding { approvalId:string; actionId:string; actionHash:string; approverId:string; approvedAt:string; expiresAt:string; revokedAt?:string; }
export interface UnitEconomics { contextId:string; workload:string; provider?:string; model?:string; inputUnits?:number; outputUnits?:number; computeCost?:number; infrastructureCost?:number; humanReviewCost?:number; totalCost?:number; currency:string; verifiedOutcomeValue?:number; estimatedOutcomeValue?:number; outcomeCurrency?:string; verifiedOutcome:boolean; costPerVerifiedOutcome?:number; }
export interface ProblemDetails { type:string; title:string; status:number; detail:string; instance?:string; code:string; contextId?:string; retryable:boolean; evidenceState:'observed'|'missing'|'stale'|'contradicted'; }

export const GOVERNED_FAILURE_CODES = {
  PROVIDER_UNAVAILABLE:{status:503,retryable:true,evidenceState:'observed'},
  PROVIDER_QUOTA_EXHAUSTED:{status:503,retryable:true,evidenceState:'observed'},
  PROVIDER_AUTH_FAILED:{status:503,retryable:false,evidenceState:'observed'},
  NO_AUTHORIZED_CAPABILITY:{status:403,retryable:false,evidenceState:'observed'},
  RESULT_NOT_VERIFIED:{status:422,retryable:false,evidenceState:'missing'},
  EXECUTION_PARTIALLY_COMPLETED:{status:409,retryable:true,evidenceState:'observed'},
  HUMAN_APPROVAL_REQUIRED:{status:428,retryable:false,evidenceState:'observed'},
  EVIDENCE_STORE_UNAVAILABLE:{status:503,retryable:true,evidenceState:'missing'}
} as const;

export const GEAS_OTEL_ATTRIBUTES = {
  contextId:'glorifier.context.id', actorType:'glorifier.actor.type', actorId:'glorifier.actor.id',
  authorityEnvelopeId:'glorifier.authority.envelope.id', policyDecision:'glorifier.policy.decision',
  policyVersion:'glorifier.policy.version', capabilityId:'glorifier.capability.id',
  providerId:'glorifier.provider.id', modelId:'glorifier.model.id', toolId:'glorifier.tool.id',
  deploymentId:'glorifier.deployment.id', evidenceState:'glorifier.evidence.state',
  outcomeState:'glorifier.outcome.state', reversibility:'glorifier.action.reversibility',
  humanApprovalRequired:'glorifier.human.approval.required'
} as const;

export function sha256(value:unknown){ return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function createGovernedAction(input:Omit<GovernedAction,'actionId'|'payloadHash'|'createdAt'>&{payload:unknown}):GovernedAction {
  const {payload,...metadata}=input;
  return {...metadata,actionId:'action-'+randomUUID(),payloadHash:sha256(payload),createdAt:new Date().toISOString()};
}
export function bindApproval(action:GovernedAction,approverId:string,ttlMs=15*60_000):ApprovalBinding {
  if(!action.humanApprovalRequired) throw new Error('Approval binding is only valid for actions requiring human approval');
  return {approvalId:'approval-'+randomUUID(),actionId:action.actionId,actionHash:sha256(action),approverId,approvedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+ttlMs).toISOString()};
}
export function verifyApprovalBinding(action:GovernedAction,approval:ApprovalBinding){
  return approval.actionId===action.actionId && approval.actionHash===sha256(action) && !approval.revokedAt && Date.parse(approval.expiresAt)>Date.now();
}
export function assertNoIrreversibleExecutionWithoutApproval(action:GovernedAction,approval?:ApprovalBinding){
  if(!action.irreversible)return;
  if(!action.humanApprovalRequired)throw new Error('Irreversible action must require human approval');
  if(!approval||!verifyApprovalBinding(action,approval))throw new Error('Valid human approval bound to exact action is required');
}
export function assertProductionProvenanceMatches(expectedCommitSha:string,actual:DeploymentProvenance){
  if(actual.environment!=='production')return {verified:false,reason:'deployment is not production'};
  if(actual.commitSha!==expectedCommitSha)return {verified:false,reason:'deployed commit does not match expected commit'};
  return {verified:true,reason:'deployment commit matches expected commit'};
}
export function deriveVerificationStatus(input:{deployment:{verified:boolean};authentication:{verified:boolean};authorization:{verified:boolean};evidence:{authoritative:boolean;fresh:boolean;contradicted:boolean};e2e:{passed:boolean}}):GovernanceStatus{
  if(input.evidence.contradicted)return 'NOT_VERIFIED';
  if(!input.deployment.verified||!input.authentication.verified||!input.authorization.verified)return 'PARTIALLY_VERIFIED';
  if(!input.evidence.authoritative||!input.evidence.fresh||!input.e2e.passed)return 'PARTIALLY_VERIFIED';
  return 'VERIFIED';
}
export function createProblemDetails(input:Omit<ProblemDetails,'type'>):ProblemDetails{
  return {type:'https://glorifier.local/problems/'+input.code.toLowerCase(),...input};
}
export function calculateCostPerVerifiedOutcome(record:UnitEconomics):UnitEconomics{
  const totalCost=record.totalCost ?? [record.computeCost,record.infrastructureCost,record.humanReviewCost].filter((v):v is number=>typeof v==='number').reduce((a,b)=>a+b,0);
  const costPerVerifiedOutcome=record.verifiedOutcome&&typeof record.verifiedOutcomeValue==='number'&&record.verifiedOutcomeValue>0?totalCost/record.verifiedOutcomeValue:undefined;
  return {...record,totalCost,costPerVerifiedOutcome};
}
