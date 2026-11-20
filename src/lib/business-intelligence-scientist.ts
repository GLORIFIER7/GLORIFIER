import { getPostgresPool } from './db/postgres';
import crypto from 'node:crypto';
import {
  getBusinessIntelligencePipelineProgress,
  normalizeIntelligenceReportToBiRecords,
  type IntelligenceReportInput,
} from './business-intelligence-pipeline.js';

export const GLORIFIER_BI_SCIENTIST_VERSION = 'GBIS-2.0';

export const BI_DOMAINS = [
  'market-intelligence','competitive-intelligence','customer-intelligence','product-intelligence',
  'sales-intelligence','marketing-intelligence','operations-intelligence','financial-intelligence',
  'pricing-intelligence','supply-chain-intelligence','risk-intelligence','workforce-intelligence',
  'technology-intelligence','cloud-intelligence','cybersecurity-intelligence','data-intelligence',
  'regulatory-intelligence','ip-intelligence','asset-intelligence','iot-intelligence',
  'ecosystem-intelligence','partner-intelligence','marketplace-intelligence','revenue-intelligence',
  'scenario-intelligence','early-warning','opportunity-intelligence'
] as const;

export const BI_WORK_CYCLE = [
  'Discover','Ingest','Normalize','Validate','Catalog','Model','Observe','Explain',
  'Predict','Simulate','Prioritize','Recommend','Govern','Measure','Learn','Improve'
] as const;

export async function initializeBusinessIntelligenceScientist() {
  const db=getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS glorifier_bi_observations (
      id TEXT PRIMARY KEY, domain TEXT NOT NULL, source TEXT NOT NULL, source_ref TEXT,
      subject TEXT NOT NULL, metric TEXT, value NUMERIC, unit TEXT, observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      evidence_status TEXT NOT NULL DEFAULT 'not_verified', confidence NUMERIC, metadata JSONB NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_gbis_obs_domain_time ON glorifier_bi_observations(domain,observed_at DESC);
    CREATE TABLE IF NOT EXISTS glorifier_bi_signals (
      id TEXT PRIMARY KEY, domain TEXT NOT NULL, signal_type TEXT NOT NULL, title TEXT NOT NULL,
      description TEXT NOT NULL, evidence_refs JSONB NOT NULL DEFAULT '[]', confidence NUMERIC,
      impact_estimate NUMERIC, status TEXT NOT NULL DEFAULT 'observed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), metadata JSONB NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS glorifier_bi_entities (
      id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_ref TEXT NOT NULL,
      name TEXT NOT NULL, source_refs JSONB NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'observed',
      metadata JSONB NOT NULL DEFAULT '{}', UNIQUE(entity_type,entity_ref)
    );
    CREATE TABLE IF NOT EXISTS glorifier_bi_metric_definitions (
      id TEXT PRIMARY KEY, metric_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      definition TEXT NOT NULL, formula TEXT, unit TEXT, source_requirements JSONB NOT NULL DEFAULT '[]',
      economic_truth_label TEXT NOT NULL DEFAULT 'NOT VERIFIED', metadata JSONB NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS glorifier_bi_watchlist (
      id TEXT PRIMARY KEY, domain TEXT NOT NULL, subject TEXT NOT NULL, watch_type TEXT NOT NULL,
      cadence_minutes INTEGER NOT NULL DEFAULT 60, enabled BOOLEAN NOT NULL DEFAULT TRUE,
      last_run_at TIMESTAMPTZ, next_run_at TIMESTAMPTZ, metadata JSONB NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS glorifier_bi_decision_records (
      id TEXT PRIMARY KEY, objective TEXT NOT NULL, recommendation TEXT NOT NULL,
      evidence_refs JSONB NOT NULL DEFAULT '[]', alternatives JSONB NOT NULL DEFAULT '[]',
      uncertainty JSONB NOT NULL DEFAULT '{}', governance_event_id TEXT, human_decision TEXT,
      status TEXT NOT NULL DEFAULT 'prepared', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS glorifier_bi_data_products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, domain TEXT NOT NULL, version TEXT,
      provenance JSONB NOT NULL DEFAULT '{}', quality JSONB NOT NULL DEFAULT '{}',
      access_policy JSONB NOT NULL DEFAULT '{}', monetization_ref TEXT,
      evidence_status TEXT NOT NULL DEFAULT 'not_verified', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS glorifier_bi_ingestion_runs (
      report_id TEXT PRIMARY KEY, generated_at TIMESTAMPTZ NOT NULL,
      source_count INTEGER NOT NULL DEFAULT 0, evidence_count INTEGER NOT NULL DEFAULT 0,
      observations_upserted INTEGER NOT NULL DEFAULT 0, signals_upserted INTEGER NOT NULL DEFAULT 0,
      rejected_evidence_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_gbis_ingestion_time ON glorifier_bi_ingestion_runs(generated_at DESC);
  `);
}

export function getBusinessIntelligenceScientistPolicy() {
  return {
    version:GLORIFIER_BI_SCIENTIST_VERSION,
    mission:'Continuously turn governed multi-source data into evidence-backed business intelligence, decisions, scenarios and opportunities.',
    domains:[...BI_DOMAINS],
    cycle:[...BI_WORK_CYCLE],
    architecture:[
      'Sources & Connections','Evidence & Provenance','Data Quality','Catalog & Lineage',
      'Semantic Layer','Metrics & KPIs','BI & Analytics','Forecasting & Scenarios',
      'Competitive/Market Intelligence','Opportunity Detection','Decision Intelligence',
      'Data Products','Revenue Control Plane','Human Authority'
    ],
    principles:{
      evidenceFirst:true, sourceProvenance:true, lineageRequired:true, semanticConsistency:true,
      conflictingSourcesMustBeSurfaced:true, uncertaintyMustBeDisplayed:true,
      estimatesAreNotFacts:true, missingEvidenceIsNotZero:true,
      marketValueIsNotRevenue:true, expectedValueIsNotRevenue:true,
      autonomousContracting:false, autonomousPaymentMovement:false
    },
    continuousOperation:{
      enabled:true,
      cadence:'continuous/event-driven plus scheduled watchlists',
      autonomousObservation:true,
      autonomousAnalysis:true,
      autonomousRecommendation:true,
      autonomousIrreversibleAction:false,
      humanApprovalForConsequentialActions:true
    }
  };
}

export async function recordBusinessIntelligenceObservation(input:{
  domain:string; source:string; sourceRef?:string; subject:string; metric?:string;
  value?:number|null; unit?:string|null; observedAt?:string; evidenceStatus?:string;
  confidence?:number|null; metadata?:Record<string,unknown>;
}) {
  await initializeBusinessIntelligenceScientist();
  const r=await getPostgresPool().query(`
    INSERT INTO glorifier_bi_observations(id,domain,source,source_ref,subject,metric,value,unit,observed_at,evidence_status,confidence,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [`bi-obs-${crypto.randomUUID()}`,input.domain,input.source,input.sourceRef||null,input.subject,input.metric||null,
      input.value??null,input.unit||null,input.observedAt||new Date().toISOString(),input.evidenceStatus||'not_verified',
      input.confidence??null,JSON.stringify(input.metadata||{})]);
  return r.rows[0];
}

export async function recordBusinessIntelligenceSignal(input:{
  domain:string; signalType:string; title:string; description:string; evidenceRefs?:string[];
  confidence?:number|null; impactEstimate?:number|null; metadata?:Record<string,unknown>;
}) {
  await initializeBusinessIntelligenceScientist();
  const r=await getPostgresPool().query(`
    INSERT INTO glorifier_bi_signals(id,domain,signal_type,title,description,evidence_refs,confidence,impact_estimate)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [`bi-signal-${crypto.randomUUID()}`,input.domain,input.signalType,input.title,input.description,
      JSON.stringify(input.evidenceRefs||[]),input.confidence??null,input.impactEstimate??null]);
  return r.rows[0];
}

export async function registerBusinessIntelligenceWatch(input:{
  domain:string; subject:string; watchType:string; cadenceMinutes?:number; metadata?:Record<string,unknown>;
}) {
  await initializeBusinessIntelligenceScientist();
  const id=`bi-watch-${crypto.randomUUID()}`;
  const cadence=Math.max(5,Math.floor(input.cadenceMinutes||60));
  const next=new Date(Date.now()+cadence*60000).toISOString();
  const r=await getPostgresPool().query(`
    INSERT INTO glorifier_bi_watchlist(id,domain,subject,watch_type,cadence_minutes,next_run_at,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id,input.domain,input.subject,input.watchType,cadence,next,JSON.stringify(input.metadata||{})]);
  return r.rows[0];
}

export async function ingestIntelligenceReportIntoBusinessIntelligence(report: IntelligenceReportInput) {
  await initializeBusinessIntelligenceScientist();
  const db = getPostgresPool();
  const normalized = normalizeIntelligenceReportToBiRecords(report);
  let observationsUpserted = 0;
  let signalsUpserted = 0;

  for (const item of normalized.observations) {
    const result = await db.query(`
      INSERT INTO glorifier_bi_observations(
        id,domain,source,source_ref,subject,metric,value,unit,observed_at,evidence_status,confidence,metadata
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(id) DO UPDATE SET
        domain=EXCLUDED.domain, source=EXCLUDED.source, source_ref=EXCLUDED.source_ref,
        subject=EXCLUDED.subject, metric=EXCLUDED.metric, observed_at=EXCLUDED.observed_at,
        evidence_status=EXCLUDED.evidence_status, metadata=EXCLUDED.metadata
      RETURNING id
    `, [
      item.id,item.domain,item.source,item.sourceRef,item.subject,item.metric,item.value,item.unit,
      item.observedAt,item.evidenceStatus,item.confidence,JSON.stringify(item.metadata)
    ]);
    if ((result.rowCount ?? result.rows.length) > 0) observationsUpserted += 1;
  }

  for (const item of normalized.signals) {
    const result = await db.query(`
      INSERT INTO glorifier_bi_signals(
        id,domain,signal_type,title,description,evidence_refs,confidence,impact_estimate,status,metadata
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(id) DO UPDATE SET
        domain=EXCLUDED.domain, signal_type=EXCLUDED.signal_type, title=EXCLUDED.title,
        description=EXCLUDED.description, evidence_refs=EXCLUDED.evidence_refs,
        status=EXCLUDED.status, metadata=EXCLUDED.metadata
      RETURNING id
    `, [
      item.id,item.domain,item.signalType,item.title,item.description,JSON.stringify(item.evidenceRefs),
      item.confidence,item.impactEstimate,item.status,JSON.stringify(item.metadata)
    ]);
    if ((result.rowCount ?? result.rows.length) > 0) signalsUpserted += 1;
  }

  const reportId = typeof report.id === 'string' && report.id.trim() ? report.id.trim() : 'unidentified-report';
  const generatedAt = report.generatedAt || new Date(0).toISOString();
  const status = normalized.rejectedEvidenceCount > 0 ? 'partial'
    : observationsUpserted > 0 ? 'ingested' : 'empty';
  await db.query(`
    INSERT INTO glorifier_bi_ingestion_runs(
      report_id,generated_at,source_count,evidence_count,observations_upserted,
      signals_upserted,rejected_evidence_count,status
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(report_id) DO UPDATE SET
      generated_at=EXCLUDED.generated_at, source_count=EXCLUDED.source_count,
      evidence_count=EXCLUDED.evidence_count, observations_upserted=EXCLUDED.observations_upserted,
      signals_upserted=EXCLUDED.signals_upserted, rejected_evidence_count=EXCLUDED.rejected_evidence_count,
      status=EXCLUDED.status
  `, [
    reportId,generatedAt,normalized.sourceCount,normalized.observations.length,
    observationsUpserted,signalsUpserted,normalized.rejectedEvidenceCount,status
  ]);

  return {
    reportId,
    status,
    sourceCount:normalized.sourceCount,
    evidenceCount:normalized.observations.length,
    observationsUpserted,
    signalsUpserted,
    rejectedEvidenceCount:normalized.rejectedEvidenceCount,
  };
}

export async function getBusinessIntelligenceSnapshot() {
  await initializeBusinessIntelligenceScientist();
  const db=getPostgresPool();
  const [obs,signals,watches,entities,products,decisions,freshness,latestIngestion]=await Promise.all([
    db.query('SELECT COUNT(*)::int count FROM glorifier_bi_observations'),
    db.query("SELECT signal_type,COUNT(*)::int count FROM glorifier_bi_signals WHERE status='observed' GROUP BY signal_type ORDER BY count DESC"),
    db.query('SELECT COUNT(*)::int count FROM glorifier_bi_watchlist WHERE enabled=true'),
    db.query('SELECT COUNT(*)::int count FROM glorifier_bi_entities'),
    db.query('SELECT COUNT(*)::int count FROM glorifier_bi_data_products'),
    db.query("SELECT COUNT(*)::int count FROM glorifier_bi_decision_records WHERE status='prepared'"),
    db.query('SELECT COUNT(DISTINCT source)::int source_count, MAX(observed_at) latest_observed_at FROM glorifier_bi_observations'),
    db.query('SELECT report_id,generated_at,source_count,evidence_count,observations_upserted,signals_upserted,rejected_evidence_count,status FROM glorifier_bi_ingestion_runs ORDER BY generated_at DESC LIMIT 1')
  ]);
  const latest = latestIngestion.rows[0] || null;
  return {
    version:GLORIFIER_BI_SCIENTIST_VERSION,
    policy:getBusinessIntelligenceScientistPolicy(),
    counts:{
      observations:Number(obs.rows[0].count),
      signals:Number(signals.rows.reduce((n:any,x:any)=>n+Number(x.count),0)),
      activeWatchlists:Number(watches.rows[0].count),
      entities:Number(entities.rows[0].count),
      dataProducts:Number(products.rows[0].count),
      preparedDecisions:Number(decisions.rows[0].count),
      sourceCount:Number(freshness.rows[0].source_count),
    },
    latestObservedAt:freshness.rows[0].latest_observed_at || null,
    latestIngestion:latest ? {
      reportId:latest.report_id,
      generatedAt:latest.generated_at,
      sourceCount:Number(latest.source_count),
      evidenceCount:Number(latest.evidence_count),
      observationsUpserted:Number(latest.observations_upserted),
      signalsUpserted:Number(latest.signals_upserted),
      rejectedEvidenceCount:Number(latest.rejected_evidence_count),
      status:latest.status,
    } : null,
    signalTypes:signals.rows
  };
}

export const GLOBAL_BI_SOURCE_FAMILIES = [
  'public-web','market-and-industry','competitor','customer-and-product','sales-and-marketing',
  'finance-and-revenue','technology-and-ai','cloud-and-infrastructure','cybersecurity',
  'regulatory-and-policy','intellectual-property','open-source','ecosystem-and-partners',
  'marketplace','iot-and-edge','research-and-academia'
] as const;

export const GLOBAL_BI_SOURCE_CATALOG = [
  { family:'public-web', name:'Public Web', access:'public', evidence:'source-required' },
  { family:'market-and-industry', name:'Market and industry sources', access:'public-or-authorized', evidence:'source-required' },
  { family:'competitor', name:'Competitor public surfaces', access:'public', evidence:'source-required' },
  { family:'customer-and-product', name:'First-party customer/product telemetry', access:'authorized', evidence:'source-required' },
  { family:'sales-and-marketing', name:'Sales and marketing systems', access:'authorized', evidence:'source-required' },
  { family:'finance-and-revenue', name:'Finance, billing and payment systems', access:'authorized', evidence:'source-required' },
  { family:'technology-and-ai', name:'AI/model/provider ecosystems', access:'public-or-authorized', evidence:'source-required' },
  { family:'cloud-and-infrastructure', name:'Cloud and infrastructure telemetry', access:'authorized', evidence:'source-required' },
  { family:'cybersecurity', name:'Security and threat intelligence', access:'public-or-authorized', evidence:'source-required' },
  { family:'regulatory-and-policy', name:'Regulatory and policy sources', access:'public', evidence:'source-required' },
  { family:'intellectual-property', name:'Patent, trademark and IP sources', access:'public-or-authorized', evidence:'source-required' },
  { family:'open-source', name:'Open-source ecosystems', access:'public', evidence:'source-required' },
  { family:'ecosystem-and-partners', name:'Partner and ecosystem sources', access:'authorized-or-public', evidence:'source-required' },
  { family:'marketplace', name:'Marketplaces and platform listings', access:'public-or-authorized', evidence:'source-required' },
  { family:'iot-and-edge', name:'IoT, edge and device telemetry', access:'authorized', evidence:'source-required' },
  { family:'research-and-academia', name:'Research and academic sources', access:'public', evidence:'source-required' }
] as const;

export const BI_INTELLIGENCE_PIPELINE = [
  'Discover source','Ingest observation','Normalize data','Validate quality','Resolve entity',
  'Apply business semantics','Calculate metric','Detect signal','Explain driver','Generate scenario',
  'Assess opportunity','Check evidence','Govern action','Measure outcome','Feed GEAS improvement'
] as const;

export async function registerBusinessIntelligenceEntity(input:{
  entityType:string; entityRef:string; name:string; sourceRefs?:string[];
  status?:string; metadata?:Record<string,unknown>;
}) {
  await initializeBusinessIntelligenceScientist();
  const r=await getPostgresPool().query(`
    INSERT INTO glorifier_bi_entities(id,entity_type,entity_ref,name,source_refs,status,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(entity_type,entity_ref) DO UPDATE SET
      name=EXCLUDED.name, source_refs=EXCLUDED.source_refs, status=EXCLUDED.status, metadata=EXCLUDED.metadata
    RETURNING *
  `,[
    `bi-entity-${crypto.randomUUID()}`,input.entityType,input.entityRef,input.name,
    JSON.stringify(input.sourceRefs||[]),input.status||'observed',JSON.stringify(input.metadata||{})
  ]);
  return r.rows[0];
}

export async function defineBusinessIntelligenceMetric(input:{
  metricKey:string; name:string; definition:string; formula?:string; unit?:string;
  sourceRequirements?:string[]; economicTruthLabel?:'NOT VERIFIED'|'EVIDENCE-BACKED'|'VERIFIED';
  metadata?:Record<string,unknown>;
}) {
  await initializeBusinessIntelligenceScientist();
  const r=await getPostgresPool().query(`
    INSERT INTO glorifier_bi_metric_definitions(id,metric_key,name,definition,formula,unit,source_requirements,economic_truth_label,metadata)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT(metric_key) DO UPDATE SET
      name=EXCLUDED.name, definition=EXCLUDED.definition, formula=EXCLUDED.formula,
      unit=EXCLUDED.unit, source_requirements=EXCLUDED.source_requirements,
      economic_truth_label=EXCLUDED.economic_truth_label, metadata=EXCLUDED.metadata
    RETURNING *
  `,[
    `bi-metric-${crypto.randomUUID()}`,input.metricKey,input.name,input.definition,input.formula||null,
    input.unit||null,JSON.stringify(input.sourceRequirements||[]),input.economicTruthLabel||'NOT VERIFIED',
    JSON.stringify(input.metadata||{})
  ]);
  return r.rows[0];
}

export async function getGlobalBusinessIntelligenceArchitecture() {
  return {
    version:GLORIFIER_BI_SCIENTIST_VERSION,
    sourceFamilies:[...GLOBAL_BI_SOURCE_FAMILIES],
    sourceCatalog:GLOBAL_BI_SOURCE_CATALOG,
    pipeline:[...BI_INTELLIGENCE_PIPELINE],
    intelligenceDomains:[...BI_DOMAINS],
    semantics:{
      entities:['company','customer','product','service','competitor','market','technology','provider','asset','opportunity','transaction','regulation','ip'],
      relationships:['owns','uses','buys','sells','competes-with','depends-on','integrates-with','generates','affects','supports','risks','governs'],
      missingEvidenceIsNotZero:true,
      estimatesAreNotFacts:true
    },
    continuousOperation:{
      enabled:true,
      mode:'event-driven plus scheduled watchlists',
      observationAnalysisRecommendationAutonomous:true,
      irreversibleActionsAutonomous:false
    },
    governance:{
      path:['GEAS','AI CEO','Specialist Council','GATS','Revenue Control Plane','Human Authority','Governed Action','Evidence','GEAS'],
      humanAuthority:true,
      consequentialActionsRequireHumanApproval:true
    },
    economicTruth:{
      estimatedOpportunity:'NOT VERIFIED',
      expectedValue:'NOT VERIFIED',
      marketValueIsNotRevenue:true,
      verifiedRevenueRequiresQualifyingEvidence:true
    }
  };
}

export async function runBusinessIntelligenceHealthCheck() {
  const snapshot=await getBusinessIntelligenceSnapshot();
  const latest=snapshot.latestIngestion;
  const pipeline=getBusinessIntelligencePipelineProgress({
    report:latest ? {sourceCount:latest.sourceCount,evidenceCount:latest.evidenceCount} : null,
    ingestion:latest ? {
      status:latest.status,
      observationsUpserted:latest.observationsUpserted,
      signalsUpserted:latest.signalsUpserted,
      rejectedEvidenceCount:latest.rejectedEvidenceCount,
    } : null,
  });
  return {
    status:latest ? 'partial' : 'awaiting-evidence',
    storageStatus:'available',
    version:GLORIFIER_BI_SCIENTIST_VERSION,
    continuousOperation:{configured:true,runtimeVerified:false},
    sourceFamilies:GLOBAL_BI_SOURCE_FAMILIES.length,
    domains:BI_DOMAINS.length,
    pipeline,
    snapshot,
  };
}
