export type BrokerPolicyMode = 'autonomous-maximize' | 'balanced-protective' | 'strict-sovereign';

export interface BrokerPolicyContext {
  minimumMonthlyFloorUsd: number;
  brokerMode: BrokerPolicyMode;
  globalEpsilon: number;
  allowAiModelPretraining: boolean;
}

export declare function normalizeBrokerPolicyContext(value: unknown): BrokerPolicyContext;
