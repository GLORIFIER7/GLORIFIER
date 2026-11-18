import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { governRevenueAction } from './revenue-control-plane';

export const GLORIFIER_ECONOMIC_OS_VERSION = 'GEOS-1.0';

export type EconomicEvidenceStatus = 'not_verified' | 'evidence-backed' | 'verified';
export type CommercialObject = 'pricing' | 'work-unit' | 'customer' | 'data-product' | 'agent-service' | 'contract' | 'invoice' | 'payment' | 'marketplace' | 'roi';
export type CommercialStatus = 'draft' | 'active' | 'proposed' | 'accepted' | 'contracted' | 'invoiced' | 'paid' | 'cancelled' | 'expired';

export async function initializeEconomicOperatingSystem() {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS glorifier_pricing_catalog (
      id TEXT PRIMARY KEY, product_ref TEXT NOT NULL, name TEXT NOT NULL, pricing_model TEXT NOT NULL,
      unit TEXT, currency TEXT DEFAULT 'USD', amount NUMERIC, tiers JSONB NOT NULL DEFAULT '[]',
      included_units NUMERIC, overage_amount NUMERIC, status TEXT NOT NULL DEFAULT 'draft',
      evidence_status TEXT NOT NULL DEFAULT 'not_verified', effective_from TIMESTAMPTZ,
      effective_to TIMESTAMPTZ, metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_geos_pricing_product ON glorifier_pricing_catalog(product_ref, status);

    CREATE TABLE IF NOT EXISTS glorifier_gwu_meter_events (
      id TEXT PRIMARY KEY, tenant_id TEXT, product_ref TEXT, work_unit_id TEXT,
      dimension TEXT NOT NULL, quantity NUMERIC NOT NULL, unit TEXT NOT NULL DEFAULT 'GWU',
      provider TEXT, model TEXT, estimated_cost NUMERIC, currency TEXT DEFAULT 'USD',
      evidence_status TEXT NOT NULL DEFAULT 'not_verified', source_ref TEXT,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), metadata JSONB NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_geos_gwu_tenant ON glorifier_gwu_meter_events(tenant_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS glorifier_customer_lifecycle (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'lead',
      external_ref TEXT, evidence_status TEXT NOT NULL DEFAULT 'not_verified',
      source_ref TEXT, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS idx_geos_customer_tenant ON glorifier_customer_lifecycle(tenant_id, started_at DESC);

    CREATE TABLE IF NOT EXISTS glorifier_data_products (
      id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT NOT NULL, product_type TEXT NOT NULL,
      description TEXT, version TEXT, price NUMERIC, currency TEXT DEFAULT 'USD',
      status TEXT NOT NULL DEFAULT 'draft', evidence_status TEXT NOT NULL DEFAULT 'not_verified',
      provenance JSONB NOT NULL DEFAULT '{}', license TEXT, access_policy JSONB NOT NULL DEFAULT '{}',
      metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS glorifier_agent_products (
      id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT NOT NULL, product_type TEXT NOT NULL,
      capability TEXT NOT NULL, version TEXT, pricing_ref TEXT, status TEXT NOT NULL DEFAULT 'draft',
      evidence_status TEXT NOT NULL DEFAULT 'not_verified', provider_dependencies JSONB NOT NULL DEFAULT '[]',
      metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS glorifier_commercial_contracts (
      id TEXT PRIMARY KEY, tenant_id TEXT, customer_ref TEXT, offer_ref TEXT, status TEXT NOT NULL DEFAULT 'proposed',
      amount NUMERIC, currency TEXT DEFAULT 'USD', external_ref TEXT, evidence_status TEXT NOT NULL DEFAULT 'not_verified',
      evidence_refs JSONB NOT NULL DEFAULT '[]', starts_at TIMESTAMPTZ, ends_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS glorifier_invoices (
      id TEXT PRIMARY KEY, tenant_id TEXT, contract_id TEXT, customer_ref TEXT, status TEXT NOT NULL DEFAULT 'draft',
      amount NUMERIC, currency TEXT DEFAULT 'USD', external_ref TEXT, evidence_status TEXT NOT NULL DEFAULT 'not_verified',
      issued_at TIMESTAMPTZ, due_at TIMESTAMPTZ, paid_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS glorifier_payment_evidence (
      id TEXT PRIMARY KEY, invoice_id TEXT, contract_id TEXT, customer_ref TEXT,
      amount NUMERIC NOT NULL, currency TEXT NOT NULL DEFAULT 'USD', external_ref TEXT NOT NULL,
      source TEXT NOT NULL, evidence_status TEXT NOT NULL DEFAULT 'evidence-backed',
      observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), payload_hash TEXT, details JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(source, external_ref)
    );

    CREATE TABLE IF NOT EXISTS glorifier_economic_events (
      id TEXT PRIMARY KEY, object_type TEXT NOT NULL, object_id TEXT NOT NULL,
      event_type TEXT NOT NULL, status TEXT NOT NULL, amount NUMERIC, currency TEXT,
      evidence_status TEXT NOT NULL DEFAULT 'not_verified', external_ref TEXT,
      governance_event_id TEXT, source TEXT, metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_geos_events_created ON glorifier_economic_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_geos_events_object ON glorifier_economic_events(object_type, object_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS glorifier_verified_revenue (
      id TEXT PRIMARY KEY, economic_event_id TEXT NOT NULL UNIQUE,
      amount NUMERIC NOT NULL, currency TEXT NOT NULL DEFAULT 'USD', source TEXT NOT NULL,
      external_ref TEXT NOT NULL, evidence_ref TEXT, observed_at TIMESTAMPTZ NOT NULL,
      verification_method TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function logEconomicEvent(input: {
  objectType: CommercialObject; objectId: string; eventType: string; status: CommercialStatus | string;
  amount?: number | null; currency?: string | null; evidenceStatus?: EconomicEvidenceStatus;
  externalRef?: string | null; governanceEventId?: string | null; source?: string | null; metadata?: Record<string, unknown>;
}) {
  const id = `econ-${crypto.randomUUID()}`;
  const r = await getPostgresPool().query(
    `INSERT INTO glorifier_economic_events
      (id,object_type,object_id,event_type,status,amount,currency,evidence_status,external_ref,governance_event_id,source,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [id,input.objectType,input.objectId,input.eventType,input.status,input.amount ?? null,input.currency || null,
      input.evidenceStatus || 'not_verified',input.externalRef || null,input.governanceEventId || null,input.source || null,
      JSON.stringify(input.metadata || {})]
  );
  return r.rows[0];
}

export function getEconomicOperatingSystemPolicy() {
  return {
    version: GLORIFIER_ECONOMIC_OS_VERSION,
    architecture: [
      'Pricing Catalog','GWU Metering','Customer Lifecycle','Customer ROI',
      'Data Products','Agent Services','Marketplace Transactions',
      'Contracts','Invoices','Payment Evidence','Verified Revenue'
    ],
    commonLedger: 'glorifier_economic_events',
    flow: 'Price -> Meter -> Customer Value -> Offer -> Govern -> Contract -> Invoice -> Payment Evidence -> Verify -> Revenue',
    economicTruth: {
      estimatedPriceIsNotRevenue: true,
      usageIsNotRevenue: true,
      pipelineIsNotRevenue: true,
      contractValueIsNotCash: true,
      invoiceIsNotPayment: true,
      marketValueIsNotRevenue: true,
      missingEvidenceIsNotZero: true,
      verifiedRevenueRequiresExternalReference: true,
      verifiedRevenueRequiresQualifyingEvidence: true
    },
    authority: {
      humanAuthority: true,
      autonomousContracting: false,
      autonomousPaymentMovement: false,
      autonomousTrading: false,
      autonomousWithdrawal: false,
      autonomousRedemption: false,
      executionEnabledByDefault: false
    }
  };
}

export async function recordEconomicPricing(input: {
  productRef: string; name: string; pricingModel: string; unit?: string | null;
  amount?: number | null; currency?: string; includedUnits?: number | null;
  overageAmount?: number | null; tiers?: unknown[]; evidenceStatus?: EconomicEvidenceStatus;
  effectiveFrom?: string | null; effectiveTo?: string | null; metadata?: Record<string, unknown>;
}) {
  await initializeEconomicOperatingSystem();
  const id = `price-${crypto.randomUUID()}`;
  const r = await getPostgresPool().query(
    `INSERT INTO glorifier_pricing_catalog
      (id,product_ref,name,pricing_model,unit,currency,amount,included_units,overage_amount,tiers,evidence_status,effective_from,effective_to,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [id,input.productRef,input.name,input.pricingModel,input.unit || null,input.currency || 'USD',input.amount ?? null,
      input.includedUnits ?? null,input.overageAmount ?? null,JSON.stringify(input.tiers || []),input.evidenceStatus || 'not_verified',
      input.effectiveFrom || null,input.effectiveTo || null,JSON.stringify(input.metadata || {})]
  );
  return r.rows[0];
}

export async function listEconomicPricing() {
  await initializeEconomicOperatingSystem();
  const r = await getPostgresPool().query('SELECT * FROM glorifier_pricing_catalog ORDER BY created_at DESC');
  return r.rows;
}

export async function meterEconomicWork(input: {
  tenantId?: string | null; productRef?: string | null; workUnitId?: string | null;
  dimension?: string; quantity: number; unit?: string; provider?: string | null;
  model?: string | null; estimatedCost?: number | null; currency?: string;
  evidenceStatus?: EconomicEvidenceStatus; sourceRef?: string | null; metadata?: Record<string, unknown>;
}) {
  await initializeEconomicOperatingSystem();
  const id = `gwu-meter-${crypto.randomUUID()}`;
  const quantity = Math.max(0, Number(input.quantity));
  const r = await getPostgresPool().query(
    `INSERT INTO glorifier_gwu_meter_events
      (id,tenant_id,product_ref,work_unit_id,dimension,quantity,unit,provider,model,estimated_cost,currency,evidence_status,source_ref,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
    [id,input.tenantId || null,input.productRef || null,input.workUnitId || null,input.dimension || 'work-unit',
      quantity,input.unit || 'GWU',input.provider || null,input.model || null,input.estimatedCost ?? null,input.currency || 'USD',
      input.evidenceStatus || 'not_verified',input.sourceRef || null,JSON.stringify(input.metadata || {})]
  );
  return r.rows[0];
}

export async function recordCustomerLifecycle(input: {
  tenantId: string; stage: string; externalRef?: string | null;
  evidenceStatus?: EconomicEvidenceStatus; sourceRef?: string | null; metadata?: Record<string, unknown>;
}) {
  await initializeEconomicOperatingSystem();
  const id = `customer-${crypto.randomUUID()}`;
  const r = await getPostgresPool().query(
    `INSERT INTO glorifier_customer_lifecycle(id,tenant_id,stage,external_ref,evidence_status,source_ref,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [id,input.tenantId,input.stage,input.externalRef || null,input.evidenceStatus || 'not_verified',input.sourceRef || null,JSON.stringify(input.metadata || {})]
  );
  return r.rows[0];
}

export async function recordDataProduct(input: {
  tenantId?: string | null; name: string; productType?: string; description?: string | null;
  version?: string | null; price?: number | null; currency?: string; provenance?: Record<string, unknown>;
  license?: string | null; accessPolicy?: Record<string, unknown>; evidenceStatus?: EconomicEvidenceStatus;
  metadata?: Record<string, unknown>;
}) {
  await initializeEconomicOperatingSystem();
  const id = `data-product-${crypto.randomUUID()}`;
  const r = await getPostgresPool().query(
    `INSERT INTO glorifier_data_products
      (id,tenant_id,name,product_type,description,version,price,currency,provenance,license,access_policy,evidence_status,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [id,input.tenantId || null,input.name,input.productType || 'dataset',input.description || null,input.version || null,
      input.price ?? null,input.currency || 'USD',JSON.stringify(input.provenance || {}),input.license || null,
      JSON.stringify(input.accessPolicy || {}),input.evidenceStatus || 'not_verified',JSON.stringify(input.metadata || {})]
  );
  return r.rows[0];
}

export async function recordAgentProduct(input: {
  tenantId?: string | null; name: string; productType?: string; capability: string;
  version?: string | null; pricingRef?: string | null; providerDependencies?: string[];
  evidenceStatus?: EconomicEvidenceStatus; metadata?: Record<string, unknown>;
}) {
  await initializeEconomicOperatingSystem();
  const id = `agent-product-${crypto.randomUUID()}`;
  const r = await getPostgresPool().query(
    `INSERT INTO glorifier_agent_products
      (id,tenant_id,name,product_type,capability,version,pricing_ref,provider_dependencies,evidence_status,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [id,input.tenantId || null,input.name,input.productType || 'agent-as-a-service',input.capability,
      input.version || null,input.pricingRef || null,JSON.stringify(input.providerDependencies || []),
      input.evidenceStatus || 'not_verified',JSON.stringify(input.metadata || {})]
  );
  return r.rows[0];
}

export async function createCommercialContract(input: {
  tenantId?: string | null; customerRef?: string | null; offerRef?: string | null;
  amount?: number | null; currency?: string; externalRef?: string | null;
  evidenceRefs?: string[]; startsAt?: string | null; endsAt?: string | null; actor?: string;
}) {
  await initializeEconomicOperatingSystem();
  const id = `contract-${crypto.randomUUID()}`;
  const governance = await governRevenueAction({
    machine: 'marketplace',
    actionType: 'contract',
    objective: `Prepare commercial contract ${id}`,
    evidenceRefs: input.evidenceRefs || [],
    amount: input.amount ?? null,
    currency: input.currency || 'USD',
    actor: input.actor || 'human-owner'
  });
  const status = 'proposed';
  const r = await getPostgresPool().query(
    `INSERT INTO glorifier_commercial_contracts
      (id,tenant_id,customer_ref,offer_ref,status,amount,currency,external_ref,evidence_status,evidence_refs,starts_at,ends_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [id,input.tenantId || null,input.customerRef || null,input.offerRef || null,status,input.amount ?? null,input.currency || 'USD',
      input.externalRef || null,input.evidenceRefs?.length ? 'evidence-backed' : 'not_verified',JSON.stringify(input.evidenceRefs || []),
      input.startsAt || null,input.endsAt || null]
  );
  const event = await logEconomicEvent({objectType:'contract',objectId:id,eventType:'contract-prepared',status,amount:input.amount,currency:input.currency,evidenceStatus:input.evidenceRefs?.length?'evidence-backed':'not_verified',governanceEventId:governance.id,source:'revenue-control-plane'});
  return { contract:r.rows[0], governance, economicEvent:event, executionEnabled:false, humanApprovalRequired:true };
}

export async function createCommercialInvoice(input: {
  tenantId?: string | null; contractId?: string | null; customerRef?: string | null;
  amount?: number | null; currency?: string; externalRef?: string | null; dueAt?: string | null; actor?: string;
}) {
  await initializeEconomicOperatingSystem();
  const id = `invoice-${crypto.randomUUID()}`;
  const governance = await governRevenueAction({
    machine: 'saas',
    actionType: 'invoice',
    objective: `Prepare commercial invoice ${id}`,
    evidenceRefs: input.contractId ? [input.contractId] : [],
    amount: input.amount ?? null,
    currency: input.currency || 'USD',
    actor: input.actor || 'human-owner'
  });
  const r = await getPostgresPool().query(
    `INSERT INTO glorifier_invoices
      (id,tenant_id,contract_id,customer_ref,status,amount,currency,external_ref,due_at)
     VALUES($1,$2,$3,$4,'draft',$5,$6,$7,$8) RETURNING *`,
    [id,input.tenantId || null,input.contractId || null,input.customerRef || null,input.amount ?? null,input.currency || 'USD',
      input.externalRef || null,input.dueAt || null]
  );
  const event = await logEconomicEvent({objectType:'invoice',objectId:id,eventType:'invoice-prepared',status:'draft',amount:input.amount,currency:input.currency,governanceEventId:governance.id,source:'revenue-control-plane'});
  return { invoice:r.rows[0], governance, economicEvent:event, invoiceIsNotPayment:true, executionEnabled:false };
}

export async function recordCustomerRoiEvidence(input: {
  tenantId: string; metricType: string; quantity: number; currency?: string | null;
  evidenceStatus?: EconomicEvidenceStatus; sourceRef?: string | null; notes?: string | null;
}) {
  await initializeEconomicOperatingSystem();
  const id = `roi-${crypto.randomUUID()}`;
  const r = await getPostgresPool().query(
    `INSERT INTO glorifier_economic_events
      (id,object_type,object_id,event_type,status,amount,currency,evidence_status,source,metadata)
     VALUES($1,'roi',$2,'roi-observed','active',$3,$4,$5,$6,$7) RETURNING *`,
    [id,input.tenantId,'roi-observed',Number(input.quantity),input.currency || null,input.evidenceStatus || 'not_verified',
      input.sourceRef || null,JSON.stringify({metricType:input.metricType,notes:input.notes || null})]
  );
  return r.rows[0];
}

export async function recordPaymentEvidence(input: {
  invoiceId?: string | null; contractId?: string | null; customerRef?: string | null;
  amount: number; currency?: string; externalRef: string; source: string;
  evidenceRef?: string | null; payloadHash?: string | null; details?: Record<string, unknown>;
  actor?: string;
}) {
  await initializeEconomicOperatingSystem();
  const amount = Number(input.amount);
  const externalRef = String(input.externalRef || '').trim();
  if (!(amount > 0)) throw new Error('payment amount must be greater than zero');
  if (!externalRef) throw new Error('externalRef is required to verify payment');
  const governance = await governRevenueAction({
    machine: 'saas',
    actionType: 'collect',
    objective: `Record payment evidence ${externalRef}`,
    evidenceRefs: [input.evidenceRef || externalRef],
    amount, currency: input.currency || 'USD', actor: input.actor || 'human-owner'
  });
  if (governance.status === 'blocked') {
    return { verified:false, status:'blocked', governance, economicTruth:'Payment cannot become verified revenue without qualifying evidence.' };
  }
  const paymentId = `payment-${crypto.randomUUID()}`;
  const p = await getPostgresPool().query(
    `INSERT INTO glorifier_payment_evidence
      (id,invoice_id,contract_id,customer_ref,amount,currency,external_ref,source,evidence_status,payload_hash,details)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,'verified',$9,$10) RETURNING *`,
    [paymentId,input.invoiceId || null,input.contractId || null,input.customerRef || null,amount,input.currency || 'USD',
      externalRef,input.source,input.payloadHash || null,JSON.stringify(input.details || {})]
  );
  const event = await logEconomicEvent({
    objectType:'payment',objectId:paymentId,eventType:'payment-verified',status:'paid',amount,currency:input.currency,
    evidenceStatus:'verified',externalRef,governanceEventId:governance.id,source:input.source
  });
  const revenueId = `revenue-${crypto.randomUUID()}`;
  await getPostgresPool().query(
    `INSERT INTO glorifier_verified_revenue
      (id,economic_event_id,amount,currency,source,external_ref,evidence_ref,observed_at,verification_method,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,NOW(),'external-reference-plus-evidence',$8)`,
    [revenueId,event.id,amount,input.currency || 'USD',input.source,externalRef,input.evidenceRef || null,JSON.stringify(input.details || {})]
  );
  if (input.invoiceId) {
    await getPostgresPool().query(
      `UPDATE glorifier_invoices SET status='paid',paid_at=NOW(),evidence_status='verified' WHERE id=$1`,
      [input.invoiceId]
    );
  }
  return { verified:true, status:'verified', payment:p.rows[0], economicEvent:event, revenueId, governance, revenueTruth:'VERIFIED' };
}

export async function listEconomicOperatingSnapshot() {
  await initializeEconomicOperatingSystem();
  const db = getPostgresPool();
  const [pricing,gwu,customers,dataProducts,agents,contracts,invoices,payments,revenue,events,roi] = await Promise.all([
    db.query('SELECT * FROM glorifier_pricing_catalog ORDER BY created_at DESC LIMIT 500'),
    db.query('SELECT COALESCE(SUM(quantity),0) quantity, COUNT(*)::int events FROM glorifier_gwu_meter_events'),
    db.query('SELECT COUNT(DISTINCT tenant_id)::int customers FROM glorifier_customer_lifecycle WHERE stage IN (\'active\',\'expansion\',\'renewal\')'),
    db.query('SELECT COUNT(*)::int count FROM glorifier_data_products'),
    db.query('SELECT COUNT(*)::int count FROM glorifier_agent_products'),
    db.query('SELECT COUNT(*)::int count FROM glorifier_commercial_contracts'),
    db.query('SELECT COUNT(*)::int count FROM glorifier_invoices'),
    db.query('SELECT COUNT(*)::int count FROM glorifier_payment_evidence WHERE evidence_status=\'verified\''),
    db.query('SELECT COALESCE(SUM(amount),0) amount, COALESCE(SUM(CASE WHEN currency=\'USD\' THEN amount ELSE 0 END),0) usd FROM glorifier_verified_revenue'),
    db.query('SELECT event_type,COUNT(*)::int count FROM glorifier_economic_events GROUP BY event_type ORDER BY count DESC'),
    db.query('SELECT COUNT(*)::int count FROM glorifier_economic_events WHERE object_type=\'roi\'')
  ]);
  return {
    version:GLORIFIER_ECONOMIC_OS_VERSION,
    policy:getEconomicOperatingSystemPolicy(),
    counts:{
      pricing:pricing.rows.length, gwuEvents:Number(gwu.rows[0].events), gwuQuantity:Number(gwu.rows[0].quantity),
      activeCustomers:Number(customers.rows[0].customers), dataProducts:Number(dataProducts.rows[0].count),
      agentServices:Number(agents.rows[0].count), contracts:Number(contracts.rows[0].count),
      invoices:Number(invoices.rows[0].count), verifiedPayments:Number(payments.rows[0].count),
      roiEvidence:Number(roi.rows[0].count)
    },
    verifiedRevenue:{amount:Number(revenue.rows[0].amount),usd:Number(revenue.rows[0].usd),label:'VERIFIED'},
    recentEventTypes:events.rows,
    pricing:pricing.rows.map((x:any)=>({...x,amount:x.amount==null?null:Number(x.amount),evidenceStatus:x.evidence_status})),
    truth: 'Only glorifier_verified_revenue counts as VERIFIED revenue. Prices, usage, contracts, invoices, pipeline, ROI and market value remain separate evidence states.'
  };
}
