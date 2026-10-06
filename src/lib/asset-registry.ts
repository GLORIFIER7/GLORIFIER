import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';

export type AssetClass = 'crypto' | 'fiat' | 'gaming' | 'stock' | 'bond' | 'etf' | 'other';
export type AssetStatus = 'discovered' | 'connected' | 'authorized' | 'degraded' | 'revoked' | 'disabled';

export interface AssetAccountRecord {
  id: string;
  provider: string;
  displayName: string;
  assetClass: AssetClass;
  status: AssetStatus;
  accountRef?: string | null;
  connectionId?: string | null;
  custody: 'self_custody' | 'custodial' | 'bank' | 'platform' | 'unknown';
  capabilities: string[];
  scopes: string[];
  priority: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
  requiresHumanApproval: boolean;
  lastVerifiedAt?: string | null;
  metadata: Record<string, unknown>;
}

export async function initializeAssetRegistry() {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS asset_account_registry (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      display_name TEXT NOT NULL,
      asset_class TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'discovered',
      account_ref TEXT,
      connection_id TEXT REFERENCES connection_registry(id) ON DELETE SET NULL,
      custody TEXT NOT NULL DEFAULT 'unknown',
      capabilities JSONB NOT NULL DEFAULT '[]',
      scopes JSONB NOT NULL DEFAULT '[]',
      priority INTEGER NOT NULL DEFAULT 50,
      risk TEXT NOT NULL DEFAULT 'medium',
      requires_human_approval BOOLEAN NOT NULL DEFAULT TRUE,
      last_verified_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE asset_account_registry ADD COLUMN IF NOT EXISTS connection_id TEXT REFERENCES connection_registry(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_asset_registry_class_priority ON asset_account_registry(asset_class, priority DESC);
    CREATE INDEX IF NOT EXISTS idx_asset_registry_provider ON asset_account_registry(provider);
    CREATE INDEX IF NOT EXISTS idx_asset_registry_connection ON asset_account_registry(connection_id);
    CREATE TABLE IF NOT EXISTS asset_holdings (
      id TEXT PRIMARY KEY,
      asset_account_id TEXT NOT NULL REFERENCES asset_account_registry(id) ON DELETE CASCADE,
      symbol TEXT NOT NULL,
      instrument_type TEXT NOT NULL,
      name TEXT,
      quantity NUMERIC,
      currency TEXT,
      cost_basis NUMERIC,
      market_price NUMERIC,
      market_value NUMERIC,
      valuation_time TIMESTAMPTZ,
      verification_status TEXT NOT NULL DEFAULT 'not_verified',
      source TEXT NOT NULL,
      evidence_ref TEXT,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(asset_account_id, symbol, instrument_type)
    );
    ALTER TABLE asset_holdings ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'not_verified';
    CREATE INDEX IF NOT EXISTS idx_asset_holdings_account ON asset_holdings(asset_account_id);
    CREATE INDEX IF NOT EXISTS idx_asset_holdings_symbol ON asset_holdings(symbol);
    CREATE TABLE IF NOT EXISTS asset_evidence (
      id TEXT PRIMARY KEY,
      asset_account_id TEXT REFERENCES asset_account_registry(id) ON DELETE CASCADE,
      holding_id TEXT REFERENCES asset_holdings(id) ON DELETE CASCADE,
      evidence_type TEXT NOT NULL,
      source TEXT NOT NULL,
      source_ref TEXT,
      observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      payload_hash TEXT,
      details JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_asset_evidence_account_time ON asset_evidence(asset_account_id, observed_at DESC);
    CREATE TABLE IF NOT EXISTS canonical_asset_registry (
      asset_id TEXT PRIMARY KEY,
      namespace TEXT NOT NULL,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      asset_class TEXT NOT NULL,
      canonical_status TEXT NOT NULL DEFAULT 'active',
      decimals INTEGER,
      supply_policy TEXT,
      canonical_metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(namespace, symbol)
    );
    CREATE TABLE IF NOT EXISTS canonical_asset_deployments (
      deployment_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES canonical_asset_registry(asset_id) ON DELETE CASCADE,
      network TEXT NOT NULL,
      network_family TEXT NOT NULL DEFAULT 'evm',
      network_id TEXT NOT NULL DEFAULT 'evm:unknown',
      chain_id BIGINT,
      identifier_type TEXT NOT NULL DEFAULT 'contract',
      contract_address TEXT,
      asset_identifier TEXT NOT NULL DEFAULT '',
      program_id TEXT,
      deployment_transaction TEXT,
      deployment_block BIGINT,
      status TEXT NOT NULL DEFAULT 'not_verified',
      explorer TEXT,
      source_verification_status TEXT NOT NULL DEFAULT 'not_verified',
      deployer_address TEXT,
      initial_holder_address TEXT,
      verification_mode TEXT,
      verification_workflow_commit TEXT,
      evidence JSONB NOT NULL DEFAULT '{}',
      first_verified_at TIMESTAMPTZ,
      last_verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(asset_id, network_id, asset_identifier),
      UNIQUE(network_id, asset_identifier)
    );
    CREATE INDEX IF NOT EXISTS idx_canonical_asset_deployments_asset
      ON canonical_asset_deployments(asset_id, status);
    ALTER TABLE canonical_asset_deployments ADD COLUMN IF NOT EXISTS network_family TEXT NOT NULL DEFAULT 'evm';
    ALTER TABLE canonical_asset_deployments ADD COLUMN IF NOT EXISTS network_id TEXT;
    ALTER TABLE canonical_asset_deployments ADD COLUMN IF NOT EXISTS identifier_type TEXT NOT NULL DEFAULT 'contract';
    ALTER TABLE canonical_asset_deployments ADD COLUMN IF NOT EXISTS asset_identifier TEXT;
    ALTER TABLE canonical_asset_deployments ADD COLUMN IF NOT EXISTS program_id TEXT;
    UPDATE canonical_asset_deployments SET network_id = CASE WHEN chain_id IS NOT NULL THEN 'evm:' || chain_id::TEXT ELSE network END WHERE network_id IS NULL;
    UPDATE canonical_asset_deployments SET asset_identifier = contract_address WHERE asset_identifier IS NULL OR asset_identifier = '';
    ALTER TABLE canonical_asset_deployments ALTER COLUMN network_id SET NOT NULL;
    ALTER TABLE canonical_asset_deployments ALTER COLUMN asset_identifier SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_asset_deployment_identity
      ON canonical_asset_deployments(asset_id, network_id, asset_identifier);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_canonical_asset_deployment_network_identity
      ON canonical_asset_deployments(network_id, asset_identifier);
    CREATE INDEX IF NOT EXISTS idx_canonical_asset_deployments_chain
      ON canonical_asset_deployments(chain_id, network);
    CREATE TABLE IF NOT EXISTS canonical_asset_events (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES canonical_asset_registry(asset_id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_canonical_asset_events_time
      ON canonical_asset_events(asset_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS asset_account_events (
      id TEXT PRIMARY KEY,
      asset_account_id TEXT NOT NULL REFERENCES asset_account_registry(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      details JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_asset_account_events_time ON asset_account_events(asset_account_id, created_at DESC);
  `);
  await seedCanonicalGLRRegistry();
}

export async function ensureCoreAssetIntegrations() {
  const seeds: Array<Omit<AssetAccountRecord, 'id' | 'lastVerifiedAt' | 'accountRef'>> = [
    { provider: 'alpaca', displayName: 'Alpaca Brokerage', assetClass: 'stock', status: 'discovered', custody: 'custodial', capabilities: ['account-read','positions-read','market-data'], scopes: ['read:account','read:positions'], priority: 100, risk: 'high', requiresHumanApproval: true, metadata: { integrationType: 'broker', credentialsStoredOutsideRegistry: true, fundMovementEnabled: false } },
    { provider: 'binance', displayName: 'Binance Crypto', assetClass: 'crypto', status: 'discovered', custody: 'custodial', capabilities: ['balances','portfolio-metadata','market-data'], scopes: ['read:balances','read:portfolio'], priority: 100, risk: 'high', requiresHumanApproval: true, metadata: { integrationType: 'exchange', credentialsStoredOutsideRegistry: true } },
    { provider: 'fiat', displayName: 'Fiat / Bank Accounts', assetClass: 'fiat', status: 'discovered', custody: 'bank', capabilities: ['account-inventory','balance-read','transaction-history'], scopes: ['read:accounts','read:balances','read:transactions'], priority: 95, risk: 'critical', requiresHumanApproval: true, metadata: { integrationType: 'banking-connector', transfersDisabledByDefault: true } },
    { provider: 'steam', displayName: 'Steam Gaming', assetClass: 'gaming', status: 'discovered', custody: 'platform', capabilities: ['account-inventory','game-library','digital-assets'], scopes: ['read:profile','read:library','read:inventory'], priority: 85, risk: 'medium', requiresHumanApproval: true, metadata: { integrationType: 'gaming-platform' } },
    { provider: 'epic-games', displayName: 'Epic Games', assetClass: 'gaming', status: 'discovered', custody: 'platform', capabilities: ['account-inventory','game-library'], scopes: ['read:profile','read:library'], priority: 80, risk: 'medium', requiresHumanApproval: true, metadata: { integrationType: 'gaming-platform' } },
    { provider: 'playstation', displayName: 'PlayStation Network', assetClass: 'gaming', status: 'discovered', custody: 'platform', capabilities: ['account-inventory','game-library','digital-assets'], scopes: ['read:profile','read:library'], priority: 75, risk: 'medium', requiresHumanApproval: true, metadata: { integrationType: 'gaming-platform' } },
    { provider: 'xbox', displayName: 'Xbox / Microsoft Gaming', assetClass: 'gaming', status: 'discovered', custody: 'platform', capabilities: ['account-inventory','game-library','digital-assets'], scopes: ['read:profile','read:library'], priority: 75, risk: 'medium', requiresHumanApproval: true, metadata: { integrationType: 'gaming-platform' } },
    { provider: 'nintendo', displayName: 'Nintendo', assetClass: 'gaming', status: 'discovered', custody: 'platform', capabilities: ['account-inventory','game-library'], scopes: ['read:profile','read:library'], priority: 70, risk: 'medium', requiresHumanApproval: true, metadata: { integrationType: 'gaming-platform' } }
  ];
  for (const seed of seeds) {
    await registerAssetAccount(seed);
  }
  return listAssetAccounts();
}

export async function registerAssetAccount(input: Omit<AssetAccountRecord, 'id'> & { id?: string }) {
  await initializeAssetRegistry();
  const id = input.id || `asset-account-${crypto.randomUUID()}`;
  const r = await getPostgresPool().query(
    `INSERT INTO asset_account_registry
      (id,provider,display_name,asset_class,status,account_ref,connection_id,custody,capabilities,scopes,priority,risk,requires_human_approval,last_verified_at,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT(id) DO UPDATE SET
       provider=EXCLUDED.provider, display_name=EXCLUDED.display_name, asset_class=EXCLUDED.asset_class,
       status=EXCLUDED.status, account_ref=EXCLUDED.account_ref, connection_id=EXCLUDED.connection_id, custody=EXCLUDED.custody,
       capabilities=EXCLUDED.capabilities, scopes=EXCLUDED.scopes, priority=EXCLUDED.priority,
       risk=EXCLUDED.risk, requires_human_approval=EXCLUDED.requires_human_approval,
       last_verified_at=EXCLUDED.last_verified_at, metadata=EXCLUDED.metadata, updated_at=NOW()
     RETURNING *`,
    [id,input.provider,input.displayName,input.assetClass,input.status,input.accountRef||null,input.connectionId||null,input.custody,
      JSON.stringify(input.capabilities),JSON.stringify(input.scopes),input.priority,input.risk,input.requiresHumanApproval,
      input.lastVerifiedAt||null,JSON.stringify(input.metadata||{})]
  );
  return mapAsset(r.rows[0]);
}

export async function listAssetAccounts(assetClass?: AssetClass) {
  await initializeAssetRegistry();
  const r = assetClass
    ? await getPostgresPool().query('SELECT * FROM asset_account_registry WHERE asset_class=$1 ORDER BY priority DESC, provider, display_name',[assetClass])
    : await getPostgresPool().query('SELECT * FROM asset_account_registry ORDER BY priority DESC, asset_class, provider, display_name');
  return r.rows.map(mapAsset);
}

export async function getAssetAccount(id: string) {
  await initializeAssetRegistry();
  const r = await getPostgresPool().query('SELECT * FROM asset_account_registry WHERE id=$1',[id]);
  return r.rows[0] ? mapAsset(r.rows[0]) : null;
}

export async function recordAssetAccountEvent(assetAccountId: string, eventType: string, actor: string, details: Record<string, unknown> = {}) {
  await initializeAssetRegistry();
  const id = `aae-${crypto.randomUUID()}`;
  await getPostgresPool().query(
    'INSERT INTO asset_account_events(id,asset_account_id,event_type,actor,details) VALUES($1,$2,$3,$4,$5)',
    [id,assetAccountId,eventType,actor,JSON.stringify(details)]
  );
  return { id, assetAccountId, eventType, actor, details };
}

export async function prioritizeAssetAccount(id: string, priority: number, actor = 'human-owner') {
  await initializeAssetRegistry();
  const bounded = Math.max(0, Math.min(100, Math.round(priority)));
  const r = await getPostgresPool().query(
    'UPDATE asset_account_registry SET priority=$2,updated_at=NOW() WHERE id=$1 RETURNING *',
    [id,bounded]
  );
  if (!r.rows[0]) return null;
  await recordAssetAccountEvent(id,'priority_changed',actor,{priority:bounded});
  return mapAsset(r.rows[0]);
}

function mapAsset(x: any): AssetAccountRecord {
  return {
    id:x.id, provider:x.provider, displayName:x.display_name, assetClass:x.asset_class,
    status:x.status, accountRef:x.account_ref||null, connectionId:x.connection_id||null, custody:x.custody,
    capabilities:x.capabilities||[], scopes:x.scopes||[], priority:Number(x.priority||0),
    risk:x.risk, requiresHumanApproval:Boolean(x.requires_human_approval),
    lastVerifiedAt:x.last_verified_at ? new Date(x.last_verified_at).toISOString() : null,
    metadata:x.metadata||{}
  };
}


export async function recordAssetHolding(input: {
  id?: string;
  assetAccountId: string;
  symbol: string;
  instrumentType: 'stock' | 'bond' | 'etf' | 'crypto' | 'other';
  name?: string;
  quantity?: number | null;
  currency?: string | null;
  costBasis?: number | null;
  marketPrice?: number | null;
  marketValue?: number | null;
  valuationTime?: string | null;
  source: string;
  evidenceRef?: string | null;
  verificationStatus?: 'not_verified' | 'verified';
  metadata?: Record<string, unknown>;
}) {
  await initializeAssetRegistry();
  const id = input.id || `holding-${crypto.randomUUID()}`;
  const r = await getPostgresPool().query(
    `INSERT INTO asset_holdings
      (id,asset_account_id,symbol,instrument_type,name,quantity,currency,cost_basis,market_price,market_value,valuation_time,verification_status,source,evidence_ref,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT(asset_account_id,symbol,instrument_type) DO UPDATE SET
       name=EXCLUDED.name, quantity=EXCLUDED.quantity, currency=EXCLUDED.currency,
       cost_basis=EXCLUDED.cost_basis, market_price=EXCLUDED.market_price, market_value=EXCLUDED.market_value,
       valuation_time=EXCLUDED.valuation_time, verification_status=EXCLUDED.verification_status, source=EXCLUDED.source, evidence_ref=EXCLUDED.evidence_ref,
       metadata=EXCLUDED.metadata, updated_at=NOW()
     RETURNING *`,
    [id,input.assetAccountId,input.symbol,input.instrumentType,input.name||null,input.quantity??null,input.currency||null,
      input.costBasis??null,input.marketPrice??null,
      input.marketValue ?? (input.quantity != null && input.marketPrice != null ? input.quantity * input.marketPrice : null),
      input.valuationTime||null,input.verificationStatus || 'not_verified',input.source,
      input.evidenceRef||null,JSON.stringify(input.metadata||{})]
  );
  return { ...r.rows[0], verification_status: r.rows[0].verification_status || 'not_verified', calculated: true, verified: r.rows[0].verification_status === 'verified' };
}

export async function listAssetHoldings(assetAccountId?: string) {
  await initializeAssetRegistry();
  const r = assetAccountId
    ? await getPostgresPool().query('SELECT * FROM asset_holdings WHERE asset_account_id=$1 ORDER BY symbol',[assetAccountId])
    : await getPostgresPool().query('SELECT * FROM asset_holdings ORDER BY asset_account_id, symbol');
  return r.rows.map((row: any) => ({ ...row, verification_status: row.verification_status || 'not_verified', calculated: true, verified: row.verification_status === 'verified' }));
}

export async function listAssetEvidence(assetAccountId?: string, limit = 100) {
  await initializeAssetRegistry();
  const db = getPostgresPool();
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  const params: unknown[] = [];
  let where = '';
  if (assetAccountId) {
    params.push(assetAccountId);
    where = `WHERE asset_account_id=$${params.length}`;
  }
  params.push(safeLimit);
  const result = await db.query(
    `SELECT id, asset_account_id, holding_id, evidence_type, source, source_ref,
            observed_at, payload_hash, details, created_at
       FROM asset_evidence ${where}
      ORDER BY observed_at DESC NULLS LAST, created_at DESC
      LIMIT $${params.length}`,
    params
  );
  return result.rows;
}

export async function recordAssetEvidence(input: {
  assetAccountId?: string | null;
  holdingId?: string | null;
  evidenceType: string;
  source: string;
  sourceRef?: string | null;
  observedAt?: string | null;
  payloadHash?: string | null;
  details?: Record<string, unknown>;
}) {
  await initializeAssetRegistry();
  const id = `ae-${crypto.randomUUID()}`;
  const r = await getPostgresPool().query(
    'INSERT INTO asset_evidence(id,asset_account_id,holding_id,evidence_type,source,source_ref,observed_at,payload_hash,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [id,input.assetAccountId||null,input.holdingId||null,input.evidenceType,input.source,input.sourceRef||null,
      input.observedAt||new Date().toISOString(),input.payloadHash||null,JSON.stringify(input.details||{})]
  );
  return r.rows[0];
}


export type CanonicalAssetStatus = 'active' | 'deprecated' | 'disabled';
export type CanonicalDeploymentStatus = 'fully_verified' | 'verified' | 'partially_verified' | 'not_verified' | 'degraded' | 'not_observable';

export interface CanonicalAssetRecord {
  assetId: string;
  namespace: string;
  name: string;
  symbol: string;
  assetClass: string;
  canonicalStatus: CanonicalAssetStatus;
  decimals: number | null;
  supplyPolicy: string | null;
  metadata: Record<string, unknown>;
  deployments: CanonicalAssetDeploymentRecord[];
}

export interface CanonicalAssetDeploymentRecord {
  deploymentId: string;
  network: string;
  chainId: number | null;
  networkFamily: 'evm' | 'solana' | 'other';
  networkId: string;
  identifierType: 'contract' | 'mint' | 'other';
  contractAddress: string | null;
  assetIdentifier: string;
  programId: string | null;
  deploymentTransaction: string | null;
  deploymentBlock: number | null;
  status: CanonicalDeploymentStatus;
  explorer: string | null;
  sourceVerificationStatus: string;
  deployerAddress: string | null;
  initialHolderAddress: string | null;
  verificationMode: string | null;
  verificationWorkflowCommit: string | null;
  evidence: Record<string, unknown>;
  firstVerifiedAt: string | null;
  lastVerifiedAt: string | null;
}

async function seedCanonicalGLRRegistry() {
  const db = getPostgresPool();
  await db.query(`INSERT INTO canonical_asset_registry
    (asset_id,namespace,name,symbol,asset_class,canonical_status,decimals,supply_policy,canonical_metadata)
    VALUES('glr','glorifier','GLORIFIER','GLR','crypto','active',18,'fixed-max-supply-1000000000',$1)
    ON CONFLICT(asset_id) DO UPDATE SET
      namespace=EXCLUDED.namespace,name=EXCLUDED.name,symbol=EXCLUDED.symbol,
      asset_class=EXCLUDED.asset_class,canonical_status=EXCLUDED.canonical_status,
      decimals=EXCLUDED.decimals,supply_policy=EXCLUDED.supply_policy,
      canonical_metadata=EXCLUDED.canonical_metadata,updated_at=NOW()`,
    [JSON.stringify({
      role: 'agent-economic-settlement-unit',
      identityRule: 'one-canonical-asset-many-chain-deployments',
      verificationRule: 'each-chain-independent'
    })]);

  await upsertCanonicalGLRDeployment({
    deploymentId: 'glr-ethereum-mainnet', network: 'Ethereum Mainnet', networkFamily: 'evm', networkId: 'evm:1', chainId: 1, identifierType: 'contract',
    contractAddress: '0x9db6f9afe2f4ada50060d32d7c7c0bebbccf89eb',
    deploymentTransaction: '0x8b92e5b669ea3188fe55052ed68d3eae0cc7715a0cf8c96e71ee7e95d846f81a',
    status: 'fully_verified', explorer: 'Etherscan', sourceVerificationStatus: 'verified',
    verificationMode: 'workflow-reconciliation',
    evidence: { etherscanVerified: true, source: 'github-actions-evidence' }
  });
  await upsertCanonicalGLRDeployment({
    deploymentId: 'glr-bnb-mainnet', network: 'BNB Smart Chain Mainnet', networkFamily: 'evm', networkId: 'evm:56', chainId: 56, identifierType: 'contract',
    contractAddress: '0x5e0B0A449232FDA7cA6Ea3419A50873b08F64804',
    deploymentTransaction: '0xf5698f6bbde7ff173be1cbd0bb83da53f03389842c68ca2f6e4e287b89d9bbc0',
    deploymentBlock: 125836150, status: 'fully_verified', explorer: 'BscScan',
    sourceVerificationStatus: 'verified',
    deployerAddress: '0x4533168d8359fE1EEd2A923dF332a6Cea2eb17ad',
    initialHolderAddress: '0x4533168d8359fE1EEd2A923dF332a6Cea2eb17ad',
    verificationMode: 'verify-existing',
    verificationWorkflowCommit: '8921c2e31b79107cf05aa3ba4bdb43715dda69d2',
    evidence: { onChainAssertions: 'PASSED', bscScanVerified: true, blockchainTransactionBroadcast: false, deployerNonce: 3, source: 'github-actions-evidence' }
  });
}

async function upsertCanonicalGLRDeployment(input: {
  deploymentId: string; network: string; networkFamily?: 'evm' | 'solana' | 'other'; networkId?: string; chainId?: number | null; identifierType?: 'contract' | 'mint' | 'other'; contractAddress?: string | null; assetIdentifier?: string; programId?: string | null;
  deploymentTransaction: string; deploymentBlock?: number; status: CanonicalDeploymentStatus;
  explorer: string; sourceVerificationStatus: string; deployerAddress?: string;
  initialHolderAddress?: string; verificationMode: string; verificationWorkflowCommit?: string;
  evidence: Record<string, unknown>;
}) {
  await getPostgresPool().query(`INSERT INTO canonical_asset_deployments
    (deployment_id,asset_id,network,network_family,network_id,chain_id,identifier_type,contract_address,asset_identifier,program_id,deployment_transaction,deployment_block,status,explorer,source_verification_status,deployer_address,initial_holder_address,verification_mode,verification_workflow_commit,evidence,first_verified_at,last_verified_at)
    VALUES($1,'glr',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
    ON CONFLICT(deployment_id) DO UPDATE SET
      network=EXCLUDED.network,network_family=EXCLUDED.network_family,network_id=EXCLUDED.network_id,chain_id=EXCLUDED.chain_id,identifier_type=EXCLUDED.identifier_type,contract_address=EXCLUDED.contract_address,asset_identifier=EXCLUDED.asset_identifier,program_id=EXCLUDED.program_id,
      deployment_transaction=EXCLUDED.deployment_transaction,deployment_block=EXCLUDED.deployment_block,
      status=EXCLUDED.status,explorer=EXCLUDED.explorer,source_verification_status=EXCLUDED.source_verification_status,
      deployer_address=EXCLUDED.deployer_address,initial_holder_address=EXCLUDED.initial_holder_address,
      verification_mode=EXCLUDED.verification_mode,verification_workflow_commit=EXCLUDED.verification_workflow_commit,
      evidence=EXCLUDED.evidence,last_verified_at=NOW(),updated_at=NOW()`,
    [input.deploymentId,input.network,input.networkFamily || 'evm',input.networkId || `evm:${input.chainId}`,input.chainId ?? null,input.identifierType || 'contract',input.contractAddress ?? null,input.assetIdentifier || input.contractAddress || '',input.programId ?? null,input.deploymentTransaction,input.deploymentBlock??null,
     input.status,input.explorer,input.sourceVerificationStatus,input.deployerAddress??null,input.initialHolderAddress??null,
     input.verificationMode,input.verificationWorkflowCommit??null,JSON.stringify(input.evidence)]
  );
}

export async function getCanonicalAsset(assetId = 'glr'): Promise<CanonicalAssetRecord | null> {
  await initializeAssetRegistry();
  const db = getPostgresPool();
  const asset = await db.query('SELECT * FROM canonical_asset_registry WHERE asset_id=$1',[assetId]);
  if (!asset.rows[0]) return null;
  const deployments = await db.query('SELECT * FROM canonical_asset_deployments WHERE asset_id=$1 ORDER BY chain_id',[assetId]);
  return {
    assetId: asset.rows[0].asset_id, namespace: asset.rows[0].namespace, name: asset.rows[0].name,
    symbol: asset.rows[0].symbol, assetClass: asset.rows[0].asset_class,
    canonicalStatus: asset.rows[0].canonical_status,
    decimals: asset.rows[0].decimals == null ? null : Number(asset.rows[0].decimals),
    supplyPolicy: asset.rows[0].supply_policy, metadata: asset.rows[0].canonical_metadata || {},
    deployments: deployments.rows.map(mapCanonicalDeployment)
  };
}

export async function listCanonicalAssets(): Promise<CanonicalAssetRecord[]> {
  await initializeAssetRegistry();
  const rows = await getPostgresPool().query('SELECT asset_id FROM canonical_asset_registry ORDER BY asset_id');
  const result: CanonicalAssetRecord[] = [];
  for (const row of rows.rows) {
    const asset = await getCanonicalAsset(row.asset_id);
    if (asset) result.push(asset);
  }
  return result;
}

function mapCanonicalDeployment(row: any): CanonicalAssetDeploymentRecord {
  return {
    deploymentId: row.deployment_id, network: row.network, chainId: row.chain_id == null ? null : Number(row.chain_id),
    networkFamily: row.network_family, networkId: row.network_id, identifierType: row.identifier_type,
    contractAddress: row.contract_address || null, assetIdentifier: row.asset_identifier, programId: row.program_id || null, deploymentTransaction: row.deployment_transaction,
    deploymentBlock: row.deployment_block == null ? null : Number(row.deployment_block),
    status: row.status, explorer: row.explorer, sourceVerificationStatus: row.source_verification_status,
    deployerAddress: row.deployer_address, initialHolderAddress: row.initial_holder_address,
    verificationMode: row.verification_mode, verificationWorkflowCommit: row.verification_workflow_commit,
    evidence: row.evidence || {},
    firstVerifiedAt: row.first_verified_at ? new Date(row.first_verified_at).toISOString() : null,
    lastVerifiedAt: row.last_verified_at ? new Date(row.last_verified_at).toISOString() : null
  };
}
