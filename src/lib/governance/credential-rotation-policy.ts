export type CredentialRotationRequest = {
  credentialId: string;
  provider: string;
  scope: string;
  samePermissions: boolean;
  privilegeEscalation: boolean;
  financialPermissionsChanged: boolean;
  providerNativeRotation: boolean;
  existingCredential: boolean;
  rollbackAvailable: boolean;
  authorizedByPolicy: boolean;
};

export type CredentialRotationDecision = {
  allowed: boolean;
  risk: 'LOW' | 'HIGH';
  reasons: string[];
};

export function evaluateCredentialRotationPolicy(
  request: CredentialRotationRequest
): CredentialRotationDecision {
  const reasons: string[] = [];

  if (!request.credentialId) reasons.push('credential identity is missing');
  if (!request.provider) reasons.push('provider is missing');
  if (!request.scope) reasons.push('credential scope is missing');
  if (!request.existingCredential) reasons.push('rotation must target an existing credential');
  if (!request.samePermissions) reasons.push('permission scope must remain unchanged');
  if (request.privilegeEscalation) reasons.push('privilege escalation is prohibited');
  if (request.financialPermissionsChanged) reasons.push('financial permissions may not change');
  if (!request.providerNativeRotation) reasons.push('provider-native rotation is required');
  if (!request.rollbackAvailable) reasons.push('rollback or overlap-safe recovery is required');
  if (!request.authorizedByPolicy) reasons.push('pre-authorization is required');

  const allowed = reasons.length === 0;
  return { allowed, risk: allowed ? 'LOW' : 'HIGH', reasons };
}
