import { aiOrchestrator } from './orchestrator';
import { buildRepositoryCouncilAssignments } from './repository-contributor-policy.mjs';
import type { AIProviderId, AIResponse } from './types';

export type SpecialistDomain =
  | 'policy' | 'legal' | 'patent' | 'compliance' | 'ethics' | 'finance' | 'revenue' | 'risk' | 'data'
  | 'research' | 'ai_ml' | 'engineering' | 'software_architecture' | 'cybersecurity'
  | 'threat_intelligence' | 'privacy' | 'identity' | 'economics' | 'market'
  | 'competitive_intelligence' | 'product' | 'operations' | 'cloud_infrastructure'
  | 'database' | 'api' | 'ai_infrastructure' | 'blockchain' | 'game_technology' | 'web'
  | 'ux' | 'growth' | 'marketplace' | 'frontier_exploration';

export interface SpecialistRole {
  id: string;
  title: string;
  domain: SpecialistDomain;
  mission: string;
  requiresHumanReview?: boolean;
}

export interface SpecialistFinding {
  role: SpecialistRole;
  provider: AIProviderId;
  model: string;
  output: string;
  evaluation?: AIResponse['evaluation'];
  latencyMs?: number;
}

export const specialistRoles: SpecialistRole[] = ([
  ['policy-scientist','AI Policy Scientist','policy','Analyze policies, governance rules, public-policy constraints, and policy conflicts. Ensure GLORIFIER learns from the broader technology, AI, open-source, standards, regulatory, research, and business ecosystem without becoming dependent on any single ecosystem, provider, institution, or governance model. Promote interoperability, provider neutrality, portability, resilience, evidence-based adaptation, and human authority.'],
  ['patent-scientist','AI Patent Scientist','patent','Maintain patent-governance discipline across invention capture, technical problem/solution analysis, prior-art questions, evidence provenance, human contribution records, claim-drafting support, confidentiality, and counsel handoff. Never claim inventorship, patentability, legal representation, filing authority, or ownership. Coordinate with the Policy Scientist and AI Attorney Scientist before any consequential IP or disclosure action.',true],
  ['assets-scientist','GLORIFIER Assets Scientist','economics','Analyze asset inventories, ownership/evidence, lifecycle, valuation, risk, utilization, and value realization across crypto, fiat, gaming, securities, IoT, intellectual property, and other asset classes.'],
  ['attorney-scientist','AI Attorney Scientist','legal','Analyze legal issues, contracts, intellectual property, regulatory requirements, and legal risk; outputs are research support, not legal representation.',true],
  ['compliance-scientist','AI Compliance Scientist','compliance','Map requirements to controls, identify compliance gaps, and maintain evidence-oriented compliance checks.'],
  ['ethics-scientist','AI Ethics & Safety Scientist','ethics','Evaluate ethical, safety, fairness, misuse, and human-impact risks.'],
  ['finance-scientist','AI Finance Scientist','finance','Analyze financial structure, valuation inputs, financial risks, and financial scenarios.'],
  ['revenue-scientist','AI Revenue Scientist','revenue','Analyze revenue streams, unit economics, monetization opportunities, and revenue anomalies.'],
  ['risk-scientist','AI Risk Scientist','risk','Identify operational, financial, technical, and strategic risks and mitigation options.'],
  ['data-scientist','AI Data Scientist','data','Analyze structured evidence, metrics, statistical patterns, data quality, and uncertainty.'],
  ['research-scientist','AI Research Scientist','research','Investigate evidence, literature, technical alternatives, and unresolved questions.'],
  ['ai-ml-scientist','AI/ML Scientist','ai_ml','Evaluate model behavior, machine-learning approaches, evaluation design, and model-selection tradeoffs.'],
  ['engineering-scientist','AI Engineering Scientist','engineering','Design and evaluate production engineering solutions and implementation tradeoffs.'],
  ['software-architect','AI Software Architecture Scientist','software_architecture','Evaluate architecture, interfaces, maintainability, scalability, and system boundaries.'],
  ['cybersecurity-scientist','AI Cybersecurity Scientist','cybersecurity','Analyze attack surfaces, security controls, vulnerabilities, and defensive architecture.'],
  ['threat-intelligence-scientist','AI Threat Intelligence Scientist','threat_intelligence','Analyze threat actors, indicators, attack patterns, and defensive intelligence.'],
  ['privacy-scientist','AI Privacy Scientist','privacy','Analyze privacy risks, minimization, anonymization, consent boundaries, and privacy-preserving designs.'],
  ['identity-scientist','AI Identity & Access Scientist','identity','Analyze authentication, authorization, identity lifecycle, and access-control architecture.'],
  ['economics-scientist','AI Economics Scientist','economics','Analyze incentives, market structure, economic scenarios, and opportunity costs.'],
  ['market-scientist','AI Market Scientist','market','Analyze markets, customer needs, competition, pricing context, and market signals.'],
  ['competitive-intelligence-scientist','AI Competitive Intelligence Scientist','competitive_intelligence','Analyze competitors, differentiators, threats, and market positioning using evidence.'],
  ['product-scientist','AI Product Scientist','product','Analyze product requirements, user outcomes, prioritization, and product-system tradeoffs.'],
  ['operations-scientist','AI Operations Scientist','operations','Analyze workflows, reliability, capacity, process bottlenecks, and operational resilience.'],
  ['cloud-scientist','AI Cloud Infrastructure Scientist','cloud_infrastructure','Analyze cloud architecture, availability, scaling, cost, and deployment reliability.'],
  ['database-scientist','AI Database Scientist','database','Analyze schemas, queries, data integrity, indexing, migrations, and database reliability.'],
  ['api-scientist','AI API Scientist','api','Analyze API contracts, interoperability, versioning, security, and service boundaries.'],
  ['ai-infrastructure-scientist','AI Infrastructure Scientist','ai_infrastructure','Analyze model-serving infrastructure, inference capacity, observability, and AI platform reliability.'],
  ['blockchain-scientist','AI Blockchain Scientist','blockchain','Analyze blockchain architecture, on-chain evidence, smart-contract risks, and decentralized systems.'],
  ['game-technology-scientist','AI Game Technology Scientist','game_technology','Analyze game technology, assets, engines, economies, and interactive systems.'],
  ['web-scientist','AI Web Scientist','web','Analyze web architecture, accessibility, performance, browser behavior, and web-platform integration.'],
  ['ux-scientist','AI UX Scientist','ux','Analyze usability, interaction design, accessibility, information architecture, and user experience.'],
  ['growth-scientist','AI Growth Scientist','growth','Analyze acquisition, activation, retention, experimentation, and sustainable growth mechanisms.'],
  ['marketplace-scientist','AI Marketplace Scientist','marketplace','Analyze marketplace liquidity, matching, trust, pricing, and participant incentives.'],
  ['frontier-exploration-scientist','Frontier Exploration Intelligence Scientist','frontier_exploration','Challenge assumptions, generate unconventional alternatives, combine distant domains, explore future scenarios, and identify possibilities missed by conventional specialist analysis.']
] as const).map(([id, title, domain, mission, requiresHumanReview]) => ({
  id,
  title,
  domain: domain as SpecialistDomain,
  mission,
  ...(requiresHumanReview === true ? { requiresHumanReview: true as const } : {})
}));

export interface CouncilRequest {
  objective: string;
  roles?: string[];
  providerIds?: AIProviderId[];
  providerSelections?: Array<{ providerId: AIProviderId; modelId: string }>;
  temperature?: number;
  standingMission?: boolean;
}

export const STANDING_REVENUE_MISSION = {
  target: 1_000_000,
  currency: 'USD',
  successCondition: 'verified settled funds received in an authorized bank/payment account',
  mode: 'continuous intelligence, opportunity discovery, risk review, measurement, and system improvement',
  humanControl: 'No autonomous bank transfers, withdrawals, contracts, or other consequential financial actions without required human authorization.'
} as const;

function specialistPrompt(role: SpecialistRole, objective: string, standingMission: boolean): string {
  const mandate = standingMission ? [
    'This is a standing GLORIFIER mission, not a one-time user command.',
    'Continue looking for lawful, evidence-based ways to create, improve, measure, and protect legitimate revenue opportunities across the system.',
    'Treat the objective as an ongoing 24/7 operating mandate while the permanent orchestrator is running.',
    'Do not equate ideas, pipeline value, bookings, invoices, crypto balances, or accounting entries with money received.',
    'The milestone is reached only when settled funds are independently verified as received in an authorized bank/payment account.',
    'Never autonomously execute bank transfers, withdrawals, binding contracts, or other consequential financial actions; surface them for required human authorization.'
  ].join('\n') : '';

  const patentPolicy = role.domain === 'patent' || role.domain === 'legal' || role.domain === 'policy'
    ? [
        'PATENT/POLICY GOVERNANCE: AI is research support only.',
        'Do not invent patents, prior-art citations, inventors, filing status, ownership, legal authorities, evidence, or policy sources.',
        'Separate technical facts, evidence, inference, legal analysis, and policy interpretation.',
        'Human inventorship must be based on documented natural-person contribution; AI must not claim inventorship.',
        'Patentability is never guaranteed. Novelty, non-obviousness, eligibility, enablement, ownership, priority, and filing strategy require qualified patent counsel.',
        'Do not autonomously publish disclosures, file applications, assign IP, license IP, sign legal documents, make legal commitments, or make payments.',
        'Coordinate Patent Scientist + Policy Scientist + Attorney Scientist findings and escalate consequential conflicts to human authority.'
      ].join('\n') : '';

  return [
    `You are the ${role.title} within the GLORIFIER AI specialist council.`,
    `Mission: ${role.mission}`,
    'Work as an independent specialist. State assumptions, distinguish evidence from inference, identify material uncertainty, and do not claim authority you do not possess.',
    patentPolicy,
    mandate,
    `Objective: ${objective}`
  ].filter(Boolean).join('\n');
}

function reconcile(objective: string, findings: SpecialistFinding[]) {
  const conflicts: string[] = [];
  if (findings.length > 1) {
    const uniqueOutputs = new Set(findings.map((f) => f.output.trim()).filter(Boolean));
    if (uniqueOutputs.size > 1) conflicts.push('Specialists produced distinct analyses; the executive layer should reconcile evidence and assumptions rather than treating plurality as proof.');
  }
  return {
    objective,
    specialistCount: findings.length,
    conflicts,
    findings,
    nextStep: findings.length ? 'Executive reconciliation required before consequential action.' : 'No specialist result is available.'
  };
}

export async function runSpecialistCouncil(request: CouncilRequest) {
  const selected = (request.roles?.length
    ? specialistRoles.filter((role) => request.roles!.includes(role.id))
    : specialistRoles
  ).slice(0, 40);

  const standingMission = request.standingMission === true;
  const explicitAssignments = request.providerSelections === undefined
    ? null
    : buildRepositoryCouncilAssignments(request.providerSelections, selected);
  if (request.providerSelections !== undefined && (!explicitAssignments || explicitAssignments.length === 0)) {
    throw new Error('Repository free-tier council requires at least one eligible provider/model assignment.');
  }
  const executionUnits = explicitAssignments ?? selected.map((role) => ({
    role,
    providerId: 'auto' as AIProviderId,
    modelId: undefined as string | undefined
  }));
  const responses = await Promise.allSettled(executionUnits.map(async ({ role, providerId, modelId }) => {
    const response = await aiOrchestrator.generate({
      provider: providerId,
      ...(modelId ? { model: modelId } : {}),
      messages: [
        { role: 'system', content: specialistPrompt(role, request.objective, standingMission) },
        { role: 'user', content: request.objective }
      ],
      temperature: request.temperature ?? 0.2,
      evaluate: true
    });
    return { role, response };
  }));

  const findings: SpecialistFinding[] = responses
    .filter((r): r is PromiseFulfilledResult<{ role: SpecialistRole; response: AIResponse }> => r.status === 'fulfilled')
    .map((r) => ({
      role: r.value.role,
      provider: r.value.response.provider,
      model: r.value.response.model,
      output: r.value.response.text,
      evaluation: r.value.response.evaluation,
      latencyMs: r.value.response.latencyMs
    }));

  const executive = aiOrchestrator.executive();
  return {
    executive,
    standingMission: standingMission ? STANDING_REVENUE_MISSION : null,
    availableRoles: specialistRoles,
    selectedRoles: selected,
    providerAssignments: explicitAssignments?.map(({ role, providerId, modelId }) => ({ roleId: role.id, providerId, modelId })) ?? null,
    result: reconcile(request.objective, findings)
  };
}
