export type LowRiskTask = {
  taskId: string;
  reversible: boolean;
  affectsProduction: boolean;
  financialTransfer: boolean;
  credentialOrPermissionChange: boolean;
  privilegeEscalation: boolean;
  authorizedIntegration: boolean;
  evidenceVerified: boolean;
};

export type LowRiskDecision = {
  allowed: boolean;
  mode: 'AUTO_APPROVED' | 'HUMAN_REVIEW' | 'BLOCKED';
  reasons: string[];
};

export function evaluateLowRiskTask(task: LowRiskTask): LowRiskDecision {
  const reasons: string[] = [];
  if (!task.taskId) reasons.push('task identity is missing');
  if (!task.reversible) reasons.push('task is not reversible');
  if (task.affectsProduction) reasons.push('production-impacting change requires review');
  if (task.financialTransfer) reasons.push('financial movement requires human approval');
  if (task.credentialOrPermissionChange) reasons.push('credential or permission changes require the dedicated credential-rotation policy');
  if (task.privilegeEscalation) reasons.push('privilege escalation is prohibited');
  if (!task.authorizedIntegration) reasons.push('integration is not authorized');
  if (!task.evidenceVerified) reasons.push('no evidence means UNKNOWN / NOT VERIFIED');

  if (reasons.length === 0) {
    return { allowed: true, mode: 'AUTO_APPROVED', reasons: ['pre-authorized low-risk task'] };
  }

  const requiresHuman = task.financialTransfer || task.affectsProduction || task.credentialOrPermissionChange;
  return {
    allowed: false,
    mode: requiresHuman ? 'HUMAN_REVIEW' : 'BLOCKED',
    reasons
  };
}
