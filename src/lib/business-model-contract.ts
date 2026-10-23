export const GLORIFIER_BUSINESS_MODEL_VERSION = 'GBM-2.0';

export const GLORIFIER_BUSINESS_MODEL_ARCHITECTURE = {
  thesis: 'Governed intelligence infrastructure monetized through recurring software, measured AI consumption, enterprise contracts, data products, marketplaces, integrations, and evidenced outcomes.',
  layers: ['Infrastructure','Intelligence','Applications','Distribution','Transactions','Financial Intelligence','Governance'],
  revenueStreams: [
    'subscription', 'usage-based', 'hybrid subscription-plus-usage', 'enterprise-contract',
    'private-offer', 'professional-services', 'managed-service', 'integration-fees',
    'data-products', 'API-access', 'agent-as-a-service', 'workflow-as-a-service',
    'marketplace-take-rate', 'transaction-fees', 'referral/partner-fees', 'licensing',
    'white-label', 'advertising-only-when-user-authorized', 'outcome-linked-fees-when-measurable',
    'asset-intelligence-services', 'IoT-monitoring', 'premium-research', 'custom-model-orchestration'
  ],
  pricingMechanisms: [
    'free-trial', 'freemium', 'flat-rate', 'per-seat', 'per-tenant', 'per-agent', 'per-work-unit',
    'per-request', 'per-token', 'per-minute', 'per-data-unit', 'per-device', 'per-asset',
    'tiered-volume', 'feature-based', 'contract-commitment', 'contract-plus-consumption',
    'private-negotiated-offer', 'annual', 'multi-year', 'usage-overage'
  ],
  distribution: ['direct-sales','self-serve','enterprise-sales','partner-channel','marketplace','API/developer','embedded/white-label'],
  valueCreation: ['automation','decision-support','risk-reduction','cost-reduction','revenue-enablement','new-product-creation','data-intelligence','capital-efficiency'],
  governance: {
    estimatedIsNotRevenue: true,
    marketValueIsNotRevenue: true,
    missingEvidenceIsNotZero: true,
    verifiedRevenueRequiresQualifyingEvidence: true,
    humanAuthority: true,
    autonomousContracting: false,
    autonomousPaymentMovement: false,
    autonomousTrading: false,
    autonomousWithdrawal: false,
    autonomousRedemption: false
  }
} as const;

export const pricingPlans = [
  { id:'free', name:'GLORIFIER Free', billing:'free', includedWorkUnits:100, features:['core intelligence','limited monitoring','economic-truth dashboard'] },
  { id:'pro', name:'GLORIFIER Pro', billing:'subscription', includedWorkUnits:5000, features:['AI orchestration','specialist council','monitoring','opportunity engine'] },
  { id:'business', name:'GLORIFIER Business', billing:'subscription+usage', includedWorkUnits:25000, features:['multi-agent workflows','integrations','business intelligence','ROI analytics'] },
  { id:'enterprise', name:'GLORIFIER Enterprise', billing:'contract+usage', includedWorkUnits:null, features:['enterprise governance','custom integrations','data products','dedicated controls'] }
] as const;

export function getBusinessModel() {
  return {
    version:GLORIFIER_BUSINESS_MODEL_VERSION,
    identity:'The governed intelligence layer for AI-powered businesses: provider-neutral orchestration, business intelligence, asset intelligence, automation, data, transactions and revenue infrastructure.',
    northStar:'Permanent provider-neutral intelligence operating system connecting AI, businesses, assets, data and opportunities under governance, evidence and human authority.',
    architecture:GLORIFIER_BUSINESS_MODEL_ARCHITECTURE,
    pricing:{model:'hybrid-multi-engine',subscription:true,consumption:true,workUnit:'GLORIFIER Work Unit (GWU)',outcomePricing:'only where outcomes are measurable and evidenced',enterpriseContracts:true,marketplaceOffers:true,privateOffers:true,usageOverage:true},
    modules:['platform','AI work units','business intelligence','data products','integrations','IoT intelligence','social intelligence','revenue opportunity engine','marketplace'],
    economicTruth:{estimatedValue:'NOT VERIFIED',marketValue:'NOT VERIFIED',missingEvidence:'not zero',verifiedRevenue:'requires qualifying payment evidence',contracts:'evidence-backed',autonomousPaymentMovement:false},
    governance:{humanAuthority:true,autonomousContracting:false,autonomousTrading:false,autonomousFundMovement:false,consequentialActionsRequireHumanApproval:true},
    flywheel:['Connect','Understand','Discover','Qualify','Create Value','Monetize','Verify','Reinvest','Improve']
  };
}
