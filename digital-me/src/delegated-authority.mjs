// Candidate policy boundary for Digital Me. The caller must supply a grant obtained
// from a trusted, authenticated GEAS authorization store; arbitrary agent input is
// never a grant. Eligibility is not a lease, signature, approval or permission to act.
const SCOPE = ['principal','tenant','resource','adapter','operation'];
const GRANT = [...SCOPE,'grantId','risk','expiresAt','revoked','evidence','zeroCost'];
const REQUEST = [...SCOPE,'risk','maximumCostMicrousd'];
const RISK = new Set(['low','medium','high','critical']);
const ROUTINE = new Set(['repository.audit','repository.inspect','research.public','service.health','mission.plan']);
const SENSITIVE = new Set(['repository.publish','deployment.promote','credential.rotate','finance.transfer']);
const exact = (v,keys) => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null) &&
  Reflect.ownKeys(v).length === keys.length && keys.every(k => {
    const d = Object.getOwnPropertyDescriptor(v,k);return d && Object.hasOwn(d,'value');
  });
const identifier = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,239}$/.test(v);
const result = (decision,reason,grantId=null) => Object.freeze({decision,reason,grantId,
  executionAuthorized:false,publicationAuthorized:false,approvalAuthorized:false,fullyVerified:false});
export function evaluateDelegatedOperation(request,grant,nowMs) {
  if (!exact(request,REQUEST) || !exact(grant,GRANT) || !Number.isSafeInteger(nowMs) || nowMs < 0) return result('deny','invalid-input');
  if (request.principal !== 'digital-me' || !SCOPE.every(k=>identifier(request[k]) && grant[k] === request[k]) || !identifier(grant.grantId)) return result('deny','scope-mismatch');
  if (grant.revoked !== false || grant.evidence !== 'VERIFIED' || grant.zeroCost !== true || request.maximumCostMicrousd !== 0) return result('deny','grant-or-budget-unverified');
  const expiry = typeof grant.expiresAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(grant.expiresAt) ? Date.parse(grant.expiresAt) : NaN;
  if (!Number.isFinite(expiry) || new Date(expiry).toISOString() !== grant.expiresAt.replace('Z','.000Z') || expiry <= nowMs) return result('deny','expired-or-invalid-grant');
  if (!RISK.has(request.risk) || request.risk !== grant.risk) return result('deny','risk-mismatch');
  if (!ROUTINE.has(request.operation) && !SENSITIVE.has(request.operation)) return result('deny','unknown-operation');
  if (SENSITIVE.has(request.operation) && request.risk === 'low') return result('deny','risk-underclassified');
  if (request.risk !== 'low' || SENSITIVE.has(request.operation)) return result('require_approval','independent-authorization-required',grant.grantId);
  return result('eligible','exact-scope-candidate',grant.grantId);
}
