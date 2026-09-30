export type ReinvestmentRequest = {
  opportunityId: string;
  amount: number;
  currency: string;
  evidenceVerified: boolean;
  expectedOutcomeDocumented: boolean;
  reversible: boolean;
  humanApproved: boolean;
  financialTransferRequired: boolean;
};

export type ReinvestmentDecision = {
  allowed: boolean;
  mode: 'AUTO_LOW_RISK' | 'HUMAN_REVIEW' | 'BLOCKED';
  reasons: string[];
};

export function evaluateReinvestmentPolicy(request: ReinvestmentRequest): ReinvestmentDecision {
  const reasons: string[] = [];
  if (!request.opportunityId) reasons.push('opportunity identity is missing');
  if (!Number.isFinite(request.amount) || request.amount <= 0) reasons.push('reinvestment amount must be positive');
  if (!request.currency) reasons.push('currency is missing');
  if (!request.evidenceVerified) reasons.push('reinvestment requires verified evidence');
  if (!request.expectedOutcomeDocumented) reasons.push('expected outcome must be documented');
  if (!request.reversible) reasons.push('reinvestment must have a reversible recovery path');

  if (reasons.length) return { allowed: false, mode: 'BLOCKED', reasons };

  if (request.financialTransferRequired && !request.humanApproved) {
    return { allowed: false, mode: 'HUMAN_REVIEW', reasons: ['financial movement remains human-approved'] };
  }

  return {
    allowed: true,
    mode: request.financialTransferRequired ? 'HUMAN_REVIEW' : 'AUTO_LOW_RISK',
    reasons: request.financialTransferRequired
      ? ['reinvestment plan approved by policy; money movement still requires human approval']
      : ['low-risk non-financial reinvestment is pre-authorized']
  };
}
