import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';

export { GLORIFIER_BUSINESS_MODEL_VERSION, GLORIFIER_BUSINESS_MODEL_ARCHITECTURE, pricingPlans, getBusinessModel } from './business-model-contract';

export type WorkUnitKind = 'research'|'analysis'|'automation'|'monitoring'|'coding'|'social-intelligence'|'opportunity-analysis'|'other';
export type EconomicTruthLabel = 'NOT VERIFIED'|'EVIDENCE-BACKED'|'VERIFIED';

export async function initializeBusinessModel() {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS glorifier_work_units (
      id TEXT PRIMARY KEY, tenant_id TEXT, kind TEXT NOT NULL, units NUMERIC NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed', provider TEXT, model TEXT, task_ref TEXT,
      estimated_cost NUMERIC, currency TEXT DEFAULT 'USD', metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_glorifier_work_units_tenant ON glorifier_work_units(tenant_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS glorifier_customer_roi (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, metric_type TEXT NOT NULL,
      quantity NUMERIC, currency TEXT, evidence_status TEXT NOT NULL DEFAULT 'not_verified',
      source_ref TEXT, notes TEXT, observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_glorifier_customer_roi_tenant ON glorifier_customer_roi(tenant_id, observed_at DESC);
    CREATE TABLE IF NOT EXISTS glorifier_opportunity_graph (
      id TEXT PRIMARY KEY, tenant_id TEXT, node_type TEXT NOT NULL, node_ref TEXT NOT NULL,
      label TEXT NOT NULL, attributes JSONB NOT NULL DEFAULT '{}', evidence_status TEXT NOT NULL DEFAULT 'not_verified',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_glorifier_opportunity_graph_ref ON glorifier_opportunity_graph(tenant_id, node_type, node_ref);
    CREATE TABLE IF NOT EXISTS glorifier_opportunity_edges (
      id TEXT PRIMARY KEY, tenant_id TEXT, from_node_id TEXT NOT NULL REFERENCES glorifier_opportunity_graph(id) ON DELETE CASCADE,
      to_node_id TEXT NOT NULL REFERENCES glorifier_opportunity_graph(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL, evidence_status TEXT NOT NULL DEFAULT 'not_verified',
      metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(from_node_id,to_node_id,relationship)
    );
    CREATE TABLE IF NOT EXISTS glorifier_marketplace_offers (
      id TEXT PRIMARY KEY, provider_ref TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL,
      description TEXT, price NUMERIC, currency TEXT DEFAULT 'USD', status TEXT NOT NULL DEFAULT 'draft',
      evidence_status TEXT NOT NULL DEFAULT 'not_verified', requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
      metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function recordWorkUnit(input:{
  tenantId?:string|null; kind:WorkUnitKind; units?:number; provider?:string|null; model?:string|null;
  taskRef?:string|null; estimatedCost?:number|null; currency?:string; metadata?:Record<string,unknown>
}) {
  await initializeBusinessModel();
  const units=Math.max(0,Number(input.units ?? 1));
  const id=`gwu-${crypto.randomUUID()}`;
  const r=await getPostgresPool().query(
    `INSERT INTO glorifier_work_units(id,tenant_id,kind,units,provider,model,task_ref,estimated_cost,currency,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id,input.tenantId||null,input.kind,units,input.provider||null,input.model||null,input.taskRef||null,input.estimatedCost??null,input.currency||'USD',JSON.stringify(input.metadata||{})]
  );
  return mapWorkUnit(r.rows[0]);
}

export async function getWorkUnitSummary(tenantId?:string) {
  await initializeBusinessModel();
  const r=await getPostgresPool().query(
    `SELECT COUNT(*)::int executions, COALESCE(SUM(units),0) units, COALESCE(SUM(estimated_cost),0) estimated_cost
     FROM glorifier_work_units ${tenantId?'WHERE tenant_id=$1':''}`, tenantId?[tenantId]:[]);
  const x=r.rows[0];
  return { executions:Number(x.executions), units:Number(x.units), estimatedCost:Number(x.estimated_cost), estimatedCostLabel:'NOT VERIFIED',
    pricingUnit:'GLORIFIER Work Unit (GWU)', policy:{usageIsNotRevenue:true,costEstimateIsNotRevenue:true} };
}

export async function recordCustomerRoi(input:{
  tenantId:string; metricType:string; quantity:number; currency?:string|null; evidenceStatus?:'not_verified'|'evidence-backed'|'verified';
  sourceRef?:string|null; notes?:string|null; metadata?:Record<string,unknown>
}) {
  await initializeBusinessModel();
  const status=input.evidenceStatus||'not_verified';
  const id=`roi-${crypto.randomUUID()}`;
  const r=await getPostgresPool().query(
    `INSERT INTO glorifier_customer_roi(id,tenant_id,metric_type,quantity,currency,evidence_status,source_ref,notes,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id,input.tenantId,input.metricType,Number(input.quantity),input.currency||null,status,input.sourceRef||null,input.notes||null,JSON.stringify(input.metadata||{})]
  );
  return mapRoi(r.rows[0]);
}

export async function getCustomerRoi(tenantId:string) {
  await initializeBusinessModel();
  const r=await getPostgresPool().query('SELECT * FROM glorifier_customer_roi WHERE tenant_id=$1 ORDER BY observed_at DESC',[tenantId]);
  return r.rows.map(mapRoi);
}

export async function upsertOpportunityNode(input:{
  tenantId?:string|null; nodeType:string; nodeRef:string; label:string; attributes?:Record<string,unknown>;
  evidenceStatus?:'not_verified'|'evidence-backed'|'verified'
}) {
  await initializeBusinessModel();
  const id=`ogn-${crypto.randomUUID()}`;
  const r=await getPostgresPool().query(
    `INSERT INTO glorifier_opportunity_graph(id,tenant_id,node_type,node_ref,label,attributes,evidence_status)
     VALUES($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT DO NOTHING RETURNING *`,
    [id,input.tenantId||null,input.nodeType,input.nodeRef,input.label,JSON.stringify(input.attributes||{}),input.evidenceStatus||'not_verified']
  );
  if (r.rows[0]) return r.rows[0];
  const existing=await getPostgresPool().query('SELECT * FROM glorifier_opportunity_graph WHERE tenant_id IS NOT DISTINCT FROM $1 AND node_type=$2 AND node_ref=$3 LIMIT 1',[input.tenantId||null,input.nodeType,input.nodeRef]);
  return existing.rows[0];
}

export async function linkOpportunityNodes(input:{tenantId?:string|null;fromNodeId:string;toNodeId:string;relationship:string;evidenceStatus?:'not_verified'|'evidence-backed'|'verified';metadata?:Record<string,unknown>}) {
  await initializeBusinessModel();
  const id=`oge-${crypto.randomUUID()}`;
  const r=await getPostgresPool().query(
    `INSERT INTO glorifier_opportunity_edges(id,tenant_id,from_node_id,to_node_id,relationship,evidence_status,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(from_node_id,to_node_id,relationship) DO UPDATE SET evidence_status=EXCLUDED.evidence_status,metadata=EXCLUDED.metadata RETURNING *`,
    [id,input.tenantId||null,input.fromNodeId,input.toNodeId,input.relationship,input.evidenceStatus||'not_verified',JSON.stringify(input.metadata||{})]
  );
  return r.rows[0];
}

export async function getOpportunityGraph(tenantId?:string) {
  await initializeBusinessModel();
  const db=getPostgresPool();
  const nodes=await db.query(`SELECT * FROM glorifier_opportunity_graph ${tenantId?'WHERE tenant_id=$1':''} ORDER BY created_at DESC LIMIT 1000`,tenantId?[tenantId]:[]);
  const ids=nodes.rows.map((x:any)=>x.id);
  const edges=ids.length ? await db.query(`SELECT * FROM glorifier_opportunity_edges WHERE from_node_id=ANY($1) OR to_node_id=ANY($1) ORDER BY created_at DESC LIMIT 2000`,[ids]) : {rows:[]};
  return {nodes:nodes.rows,edges:edges.rows,truthRule:'Relationships and opportunity values are NOT VERIFIED unless qualifying evidence is recorded.'};
}

export async function createMarketplaceOffer(input:{providerRef:string;title:string;category:string;description?:string|null;price?:number|null;currency?:string;metadata?:Record<string,unknown>}) {
  await initializeBusinessModel();
  const id=`offer-${crypto.randomUUID()}`;
  const r=await getPostgresPool().query(
    `INSERT INTO glorifier_marketplace_offers(id,provider_ref,title,category,description,price,currency) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id,input.providerRef,input.title,input.category,input.description||null,input.price??null,input.currency||'USD']
  );
  return r.rows[0];
}

export async function listMarketplaceOffers() {
  await initializeBusinessModel();
  const r=await getPostgresPool().query('SELECT * FROM glorifier_marketplace_offers ORDER BY created_at DESC');
  return r.rows;
}


function mapWorkUnit(x:any){return {id:x.id,tenantId:x.tenant_id||null,kind:x.kind,units:Number(x.units),status:x.status,provider:x.provider||null,model:x.model||null,taskRef:x.task_ref||null,estimatedCost:x.estimated_cost==null?null:Number(x.estimated_cost),currency:x.currency||'USD',estimatedCostLabel:'NOT VERIFIED',createdAt:x.created_at};}
function mapRoi(x:any){return {id:x.id,tenantId:x.tenant_id,metricType:x.metric_type,quantity:Number(x.quantity),currency:x.currency||null,evidenceStatus:x.evidence_status,sourceRef:x.source_ref||null,notes:x.notes||null,observedAt:x.observed_at,truthLabel:x.evidence_status==='verified'?'VERIFIED':x.evidence_status==='evidence-backed'?'EVIDENCE-BACKED':'NOT VERIFIED'};}


export async function governWorkUnitAction(input: { objective: string; actionType?: string; evidenceRefs?: string[]; actor?: string }) {
  const { governRevenueAction } = await import('./revenue-control-plane');
  return governRevenueAction({ machine: 'work-units', actionType: (input.actionType || 'propose') as any, objective: input.objective, evidenceRefs: input.evidenceRefs || [], actor: input.actor || 'human-owner' });
}
