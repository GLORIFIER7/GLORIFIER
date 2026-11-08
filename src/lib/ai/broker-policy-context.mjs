const BROKER_POLICY_MODES = new Set([
  'autonomous-maximize',
  'balanced-protective',
  'strict-sovereign',
]);

export function normalizeBrokerPolicyContext(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const floor = source.minimumMonthlyFloorUsd;
  const epsilon = source.globalEpsilon;

  return {
    minimumMonthlyFloorUsd:
      typeof floor === 'number' && Number.isFinite(floor) && floor >= 0 ? floor : 0,
    brokerMode: BROKER_POLICY_MODES.has(source.brokerMode)
      ? source.brokerMode
      : 'balanced-protective',
    globalEpsilon:
      typeof epsilon === 'number' && Number.isFinite(epsilon) && epsilon > 0 ? epsilon : 0.35,
    allowAiModelPretraining: source.allowAiModelPretraining === true,
  };
}
