export type PrivacyTier = 'zero-knowledge' | 'differential-privacy' | 'k-anonymity' | 'synthetic-twin';

export type FootprintStatus = 'active-monetizing' | 'shielded-private' | 'opted-out' | 'clawback-pending' | 'configured-not-verified';

export type DataCategoryType = 
  | 'browsing'
  | 'ecommerce'
  | 'social'
  | 'health'
  | 'developer'
  | 'location'
  | 'financial'
  | 'email'
  | 'drive';

export interface DriveTelemetryMetadata {
  totalFilesScanned: number;
  sensitiveDocumentsDetected: number;
  sharedExternalFilesCount: number;
  totalStorageBytesGoverned: number;
  estimatedAggregateYieldUsd: number;
  lastSyncTimestamp: string;
}

export interface DriveAnalysisItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes?: number;
  createdTime?: string;
  modifiedTime?: string;
  shared: boolean;
  webViewLink?: string;
  iconLink?: string;
  category: 'Documents & Research' | 'Spreadsheets & Finance' | 'Presentations & Strategy' | 'Code & Architecture' | 'Media & Creative' | 'Archival & Other';
  leakRiskScore: number; // 0 - 100
  sensitiveSignals: string[];
  governanceAction: 'NOT VERIFIED — no privacy transformation applied';
  estimatedYieldUsd: number | null;
  differentialPrivacyNoiseLevel: string;
}

export interface GmailTelemetryMetadata {
  totalMessagesAnalyzed: number;
  newsletterSubscriptionsDetected: number;
  receiptsDetected: number;
  travelReservationsCount: number;
  spamTrackersBlocked: number;
  lastSyncTimestamp: string;
}

export interface GmailAnalysisItem {
  id: string;
  snippet: string;
  sender: string;
  date: string;
  category: 'Receipt/Commerce' | 'Travel/Itinerary' | 'Newsletter/Research' | 'Work/Collaboration';
  extractedInsights: string;
  governanceAction: 'NOT VERIFIED — no privacy transformation applied';
  estimatedYieldUsd: number | null;
}

export interface DataSampleRecord {
  field: string;
  rawValue: string;
  anonymizedValue: string;
  noiseLevel: string;
}

export interface DataFootprintSource {
  id: string;
  name: string;
  category: DataCategoryType;
  platform: string;
  iconName: string;
  dataPointsMonthly: number;
  marketMonthlyValueUsd: number;
  userMonthlyCompUsd: number;
  isMonetized: boolean;
  privacyTier: PrivacyTier;
  privacyEpsilon: number; // e.g. 0.3 to 1.5
  status: FootprintStatus;
  lastSync: string;
  description: string;
  leakRiskScore: number; // 0-100 (100 = high risk)
  samples: DataSampleRecord[];
}

export interface BuyerOffer {
  id: string;
  buyerName: string;
  buyerCategory: 'AI Research Lab' | 'Academic Medicine' | 'Consumer Trends' | 'Autonomous Systems' | 'FinTech Benchmark';
  buyerVerified: boolean;
  reputationScore: number;
  dataCategoriesNeeded: DataCategoryType[];
  offeredCompUsd: number;
  pricingCadence: 'monthly' | 'per_query' | 'one_off';
  requiredPrivacyTier: PrivacyTier;
  maxEpsilonAllowed: number;
  retentionWindowDays: number;
  purposeSummary: string;
  prohibitedPurposes: string[];
  aiBrokerScore: number; // 0-100
  aiVerdict: 'RECOMMEND' | 'CAUTION' | 'REJECT';
  aiBrokerReasoning: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COUNTERED';
  counterOfferAmount?: number;
  timestamp: string;
}

export interface BinanceAutoWithdrawalConfig {
  enabled: boolean;
  binancePayIdOrEmail: string; // Binance Pay ID (8-9 digits) or Binance registered Email
  defaultAsset: 'USDT' | 'BUSD' | 'BNB' | 'BTC' | 'ETH';
  network: 'Binance_Pay_Direct' | 'BEP20_BSC' | 'TRC20';
  autoSweepThresholdUsd: number; // minimum amount to trigger auto-sweep
  sweepFrequency: 'instant' | 'daily' | 'weekly';
  isAttested: boolean;
}

export interface GCashDirectWithdrawalConfig {
  enabled: boolean;
  mobileNumber: string; // Philippine mobile format 09XXXXXXXXX or +639XXXXXXXXX
  accountName: string; // Registered GCash verified name
  autoCashOut: boolean;
  cadence: 'instant' | 'weekly';
  minimumThresholdUsd: number;
  phpUsdRate: number; // e.g. 58.50 PHP per 1 USD
  isVerifiedInstapay: boolean;
}

export type RiskToleranceLevel = 'conservative' | 'balanced' | 'yield-focused';

export interface MonetizationPolicy {
  brokerMode: 'autonomous-maximize' | 'balanced-protective' | 'strict-sovereign';
  minimumMonthlyFloorUsd: number;
  allowAiModelPretraining: boolean;
  allowAdTargeting: boolean;
  allowAcademicResearch: boolean;
  allowInsuranceRiskProfiling: boolean;
  globalEpsilon: number;
  autoNegotiateHighBids: boolean;
  payoutMethod: 'usdc_solana' | 'binance_auto' | 'gcash_ph' | 'stripe_connect' | 'direct_ach';
  walletAddress: string;
  binanceConfig?: BinanceAutoWithdrawalConfig;
  gcashConfig?: GCashDirectWithdrawalConfig;
  aiModel?: string;
  riskTolerance?: RiskToleranceLevel;
}

export interface ModelCollaborationParticipant {
  modelId: string;
  model?: string;
  name: string;
  provider: string;
  role: string;
  color: string;
  badge: string;
  status: 'active' | 'analyzing' | 'completed' | 'ready';
  output?: string;
  perspective: string;
  keyRecommendation?: string;
}

export interface CouncilConsensusResult {
  agenda: string;
  timestamp: string;
  participants: ModelCollaborationParticipant[];
  unifiedConsensus: string;
  consensusScore: number | null; // null until an explicit score is returned
  recommendedEpsilon: number | null;
  recommendedFloorUsd: number | null;
  actionDirectives: string[];
}

export interface CompensationTransaction {
  id: string;
  timestamp: string;
  buyerName: string;
  category: DataCategoryType;
  amountUsd: number;
  privacyTier: PrivacyTier;
  txHash: string;
  status: 'settled' | 'pending';
}

export interface DataBrokerExposure {
  id: string;
  brokerName: string;
  brokerType: 'AdTech Aggregator' | 'Risk Profiler' | 'Shadow Tracker' | 'People Search Data Mill';
  estimatedRecordsHeld: number;
  exposureSeverity: 'CRITICAL' | 'HIGH' | 'MODERATE';
  monetizedWithoutConsent: number; // Estimated revenue they make off user in $/yr
  status: 'detected' | 'clawback_sent' | 'purged';
  complianceStatute: string; // GDPR Art. 17 / CCPA § 1798.105
  actionTimestamp?: string;
}

export interface AiBrokerChatMessage {
  id: string;
  sender: 'user' | 'ai_broker';
  content: string;
  timestamp: string;
  modelUsed?: string;
  provider?: string;
  suggestedAction?: {
    label: string;
    type: 'apply_policy' | 'opt_out_all' | 'maximize_yield' | 'run_audit';
    payload?: any;
  };
}

export interface SovereignStats {
  totalEarnedUsd: number;
  pendingSettlementUsd: number;
  activeDataStreamsCount: number;
  monthlyPacingUsd: number;
  totalDataPointsGoverned: number;
  privacyShieldIndex: number; // 0-100
  brokerBidsProcessedToday: number;
}

export interface ActiveDataGrant {
  id: string;
  dataPointName: string;
  category: DataCategoryType;
  sharedFields: string[];
  recipientOrg: string;
  recipientCategory: string;
  purpose: string;
  protectionTech: 'Differential Privacy' | 'Homomorphic Encryption' | 'Federated Learning' | 'Zero-Knowledge Attestation';
  epsilonLevel?: number;
  compensationModel: 'per_query' | 'subscription' | 'shapley_ml' | 'per_action';
  rateDescription: string;
  grantedAt: string;
  expiresAt: string;
  ttlHoursRemaining: number;
  status: 'active' | 'revoked' | 'expired';
  verifiableToken: string;
  totalQueriesServed: number;
  revenueAccruedUsd: number;
}

export interface UsageTelemetryEvent {
  id: string;
  timestamp: string;
  grantId: string;
  recipientOrg: string;
  dataCategory: DataCategoryType;
  eventType: 'dp_query_laplace' | 'fhe_computation' | 'fl_gradient_update' | 'zk_proof_verification' | 'batch_subscription_tick';
  queryUnits: number;
  compensationUsd: number;
  calculationModel: 'Per-Query' | 'Data Shapley' | 'Cohort Subscription' | 'Proof Attestation';
  zkProofHash: string;
  epsilonConsumed: number;
}

// ----------------------------------------------------
// Internet Account Federation & Approval Hub Types
// ----------------------------------------------------
export type InternetAccountCategory = 'google' | 'developer' | 'social' | 'financial' | 'cloud' | 'commerce';

export interface InternetAccount {
  id: string;
  provider: string; // e.g., 'Google Workspace & Search', 'GitHub', 'Binance Pay', 'GCash', 'X / Twitter'
  category: InternetAccountCategory;
  accountIdentifier: string; // e.g., 'johnpaularlos28@gmail.com', '@johnpaularlos', '0917-882-9102'
  connected: boolean;
  status: 'authenticated' | 'pending_auth' | 'disconnected';
  authMethod: 'OAuth2_PKCE' | 'Passkey_FIDO2' | 'API_Token' | 'Crypto_Sign' | 'Mobile_OTP';
  lastSync: string;
  dataItemsGoverned: number;
  monthlyEstValueUsd: number;
  isApprovalGatekeeper: boolean; // Account used for cryptographic approvals & MFA gating
  approvalWeight: number; // 1 to 5 stars or weight in multi-sig
  governedDataTypes: string[];
  privacyShieldActive: boolean;
  autoSyncEnabled: boolean;
  apiHealth: 'optimal' | 'warning' | 'offline';
}

// ----------------------------------------------------
// 24/7 AI Code Sentinel Bot & Error CRUD Types
// ----------------------------------------------------
export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ErrorLifecycleStatus = 'active' | 'analyzing' | 'patch_ready' | 'resolved' | 'dismissed';

export interface CodeSentinelError {
  id: string;
  code: string; // e.g., 'ERR_503_GEMINI_OVERLOAD', 'ERR_QUOTA_429_EXCEEDED', 'ERR_DIFF_PRIVACY_BOUND'
  message: string;
  source: string; // e.g., 'server.ts:callGeminiSafe', 'api/ai/collaborate-council'
  severity: ErrorSeverity;
  status: ErrorLifecycleStatus;
  timestamp: string;
  occurrences: number;
  rootCause: string;
  gptAnalysis: string;
  geminiAnalysis: string;
  collaborativeFixProposal: string;
  patchDiff?: string;
  canAutoFix: boolean;
  autoFixedAt?: string;
  assignedBot: 'GPT-Sentinel' | 'Gemini-Inspector' | 'Dual-Consensus-Healer' | 'unassigned';
}

export interface SentinelLogEntry {
  id: string;
  timestamp: string;
  action: 'SCAN' | 'DETECT' | 'GPT_COLLABORATE' | 'AUTO_FIX' | 'EDIT' | 'DELETE' | 'DISMISS';
  details: string;
  errorId?: string;
  model: string;
}

export interface SentinelBotState {
  isMonitoring24x7: boolean;
  healthScore: number; // 0-100
  autoHealEnabled: boolean;
  activeErrorsCount: number;
  resolvedTotalCount: number;
  lastScanTimestamp: string;
  collaboratingModels: string[];
  scanFrequencySeconds: number;
  sentinelLogs: SentinelLogEntry[];
}

