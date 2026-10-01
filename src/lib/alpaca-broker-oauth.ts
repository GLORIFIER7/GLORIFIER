import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { registerAssetAccount, recordAssetEvidence, recordAssetHolding } from './asset-registry';
import { registerConnection, recordConnectionEvent } from './connection-registry';

const ALPACA_AUTHORIZE_URL = 'https://app.alpaca.markets/oauth/authorize';
const ALPACA_TOKEN_URL = 'https://api.alpaca.markets/oauth/token';
const ALPACA_API_BASE = 'https://api.alpaca.markets';

type BrokerEnv = 'live' | 'paper';

function required(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(name + ' is not configured');
  return value;
}

function frontendUrl(): string {
  return String(process.env.GLORIFIER_FRONTEND_URL || 'https://glorifier.vercel.app').replace(/\/$/, '');
}

function callbackUrl(): string {
  return String(
    process.env.ALPACA_OAUTH_REDIRECT_URI ||
    ((process.env.GLORIFIER_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '') + '/auth/broker/callback')
  );
}

function encryptionKey(): Buffer {
  const raw = required('GLORIFIER_BROKER_TOKEN_ENCRYPTION_KEY');
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32) return decoded;
  throw new Error('GLORIFIER_BROKER_TOKEN_ENCRYPTION_KEY must be 32 bytes as 64 hex characters or base64');
}

function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}

function decrypt(payload: { ciphertext: string; iv: string; tag: string }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function hashState(state: string) {
  return crypto.createHash('sha256').update(state).digest('hex');
}

export async function initializeAlpacaBrokerOAuth() {
  const db = getPostgresPool();
  await db.query(`
    CREATE TABLE IF NOT EXISTS broker_oauth_states (
      state_hash TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      user_id TEXT NOT NULL,
      env TEXT NOT NULL,
      redirect_uri TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_broker_oauth_states_expiry ON broker_oauth_states(expires_at);

    CREATE TABLE IF NOT EXISTS broker_token_vault (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      user_id TEXT NOT NULL,
      connection_id TEXT,
      account_ref TEXT,
      env TEXT NOT NULL,
      access_ciphertext TEXT NOT NULL,
      access_iv TEXT NOT NULL,
      access_tag TEXT NOT NULL,
      refresh_ciphertext TEXT,
      refresh_iv TEXT,
      refresh_tag TEXT,
      scope TEXT,
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(provider, user_id, env)
    );
    CREATE INDEX IF NOT EXISTS idx_broker_token_vault_user ON broker_token_vault(user_id);

    CREATE TABLE IF NOT EXISTS broker_account_snapshots (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      user_id TEXT NOT NULL,
      connection_id TEXT,
      account_ref TEXT,
      env TEXT NOT NULL,
      account JSONB NOT NULL DEFAULT '{}',
      positions JSONB NOT NULL DEFAULT '[]',
      activities JSONB NOT NULL DEFAULT '[]',
      portfolio_history JSONB NOT NULL DEFAULT '{}',
      verification_status TEXT NOT NULL DEFAULT 'not_verified',
      evidence_ids JSONB NOT NULL DEFAULT '[]',
      observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_broker_account_snapshots_user ON broker_account_snapshots(user_id, observed_at DESC);
  `);
}

export async function buildAlpacaAuthorizationUrl(userId: string, env: BrokerEnv = 'live') {
  const clientId = required('ALPACA_OAUTH_CLIENT_ID');
  const redirectUri = callbackUrl();
  const state = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const db = getPostgresPool();
  await db.query(
    'INSERT INTO broker_oauth_states(state_hash,provider,user_id,env,redirect_uri,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
    [hashState(state), 'alpaca', userId, env, redirectUri, expiresAt]
  );

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    env
  });
  return { authorizationUrl: ALPACA_AUTHORIZE_URL + '?' + params.toString(), redirectUri, env };
}

async function exchangeCode(code: string, redirectUri: string) {
  const response = await fetch(ALPACA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: required('ALPACA_OAUTH_CLIENT_ID'),
      client_secret: required('ALPACA_OAUTH_CLIENT_SECRET'),
      redirect_uri: redirectUri
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Alpaca OAuth token exchange failed: HTTP ' + response.status);
  return body as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

async function alpacaGet(token: string, path: string, query?: Record<string, string>) {
  const url = new URL(ALPACA_API_BASE + path);
  for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Alpaca read request failed: HTTP ' + response.status);
  return body;
}

async function saveToken(userId: string, env: BrokerEnv, token: { access_token: string; refresh_token?: string; expires_in?: number; scope?: string }, connectionId?: string | null) {
  const access = encrypt(token.access_token);
  const refresh = token.refresh_token ? encrypt(token.refresh_token) : null;
  const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000) : null;
  const id = 'broker-token-' + crypto.randomUUID();
  const result = await getPostgresPool().query(
    `INSERT INTO broker_token_vault
      (id,provider,user_id,connection_id,env,access_ciphertext,access_iv,access_tag,refresh_ciphertext,refresh_iv,refresh_tag,scope,expires_at)
     VALUES($1,'alpaca',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT(provider,user_id,env) DO UPDATE SET
       connection_id=EXCLUDED.connection_id,
       access_ciphertext=EXCLUDED.access_ciphertext, access_iv=EXCLUDED.access_iv, access_tag=EXCLUDED.access_tag,
       refresh_ciphertext=EXCLUDED.refresh_ciphertext, refresh_iv=EXCLUDED.refresh_iv, refresh_tag=EXCLUDED.refresh_tag,
       scope=EXCLUDED.scope, expires_at=EXCLUDED.expires_at, revoked_at=NULL, updated_at=NOW()
     RETURNING id`,
    [id,userId,connectionId || null,env,access.ciphertext,access.iv,access.tag,refresh?.ciphertext || null,refresh?.iv || null,refresh?.tag || null,token.scope || null,expiresAt]
  );
  return result.rows[0].id as string;
}

async function getToken(userId: string, env: BrokerEnv) {
  const r = await getPostgresPool().query(
    'SELECT * FROM broker_token_vault WHERE provider=$1 AND user_id=$2 AND env=$3 AND revoked_at IS NULL',
    ['alpaca',userId,env]
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  return {
    id: row.id as string,
    connectionId: row.connection_id as string | null,
    accountRef: row.account_ref as string | null,
    token: decrypt({ ciphertext: row.access_ciphertext, iv: row.access_iv, tag: row.access_tag }),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null
  };
}

async function setAccountRef(vaultId: string, accountRef: string) {
  await getPostgresPool().query('UPDATE broker_token_vault SET account_ref=$2,updated_at=NOW() WHERE id=$1', [vaultId,accountRef]);
}

export async function handleAlpacaCallback(code: string, state: string) {
  await initializeAlpacaBrokerOAuth();
  const stateRow = await getPostgresPool().query(
    'SELECT * FROM broker_oauth_states WHERE state_hash=$1 AND expires_at>NOW()',
    [hashState(state)]
  );
  if (!stateRow.rows[0]) throw new Error('OAuth state is invalid or expired');
  const row = stateRow.rows[0] as { user_id: string; env: BrokerEnv; redirect_uri: string };
  await getPostgresPool().query('DELETE FROM broker_oauth_states WHERE state_hash=$1', [hashState(state)]);

  const token = await exchangeCode(code, row.redirect_uri);
  if (!token.access_token) throw new Error('Alpaca did not return an access token');

  const connection = await registerConnection({
    provider: 'alpaca',
    displayName: row.env === 'live' ? 'Alpaca Brokerage (Live, read-only)' : 'Alpaca Brokerage (Paper, read-only)',
    authType: 'oauth2',
    status: 'authorized',
    scopes: token.scope ? token.scope.split(/\s+/).filter(Boolean) : ['read-only'],
    risk: 'high',
    accountRef: null,
    requiresHumanApproval: true,
    metadata: { environment: row.env, tradingEnabled: false, fundMovementEnabled: false, tokenVault: 'encrypted' }
  });
  const vaultId = await saveToken(row.user_id, row.env, token, connection.id);

  try {
    const account = await alpacaGet(token.access_token, '/v2/account');
    const accountRef = String(account?.id || '').trim();
    if (!accountRef) throw new Error('Alpaca account response did not contain an account id');
    await setAccountRef(vaultId, accountRef);
    await getPostgresPool().query('UPDATE connection_registry SET account_ref=$2,status=$3,updated_at=NOW() WHERE id=$1',[connection.id,accountRef,'verified']);
    await recordConnectionEvent(connection.id,'verified','oauth-callback',{accountRef,environment:row.env,readOnly:true});
    await persistVerificationSnapshot(row.user_id,row.env,connection.id,accountRef,token.access_token);
  } catch (error) {
    await recordConnectionEvent(connection.id,'verification_failed','oauth-callback',{error:String(error instanceof Error ? error.message : error)});
    throw error;
  }

  return { userId: row.user_id, env: row.env, connectionId: connection.id };
}

async function persistVerificationSnapshot(userId: string, env: BrokerEnv, connectionId: string, accountRef: string, token: string) {
  const [account, positions, activities, portfolioHistory] = await Promise.all([
    alpacaGet(token, '/v2/account'),
    alpacaGet(token, '/v2/positions'),
    alpacaGet(token, '/v2/account/activities', { activity_types: 'TRANS', page_size: '100', direction: 'desc' }),
    alpacaGet(token, '/v2/account/portfolio/history', { period: '1M', timeframe: '1D' })
  ]);

  const evidenceIds: string[] = [];
  const baseDetails = { provider: 'alpaca', accountRef, environment: env, readOnly: true, observedAt: new Date().toISOString() };
  const evidence = await recordAssetEvidence({
    evidenceType: 'broker_account_snapshot',
    source: 'alpaca-oauth',
    sourceRef: accountRef,
    details: { ...baseDetails, account: { id: account.id, status: account.status, cash: account.cash, portfolio_value: account.portfolio_value } }
  });
  evidenceIds.push(String(evidence.id));

  const assetAccount = await registerAssetAccount({
    id: 'asset-account-alpaca-' + accountRef,
    provider: 'alpaca',
    displayName: 'Alpaca Brokerage — ' + (env === 'live' ? 'Live' : 'Paper'),
    assetClass: 'stock',
    status: 'authorized',
    accountRef,
    connectionId,
    custody: 'custodial',
    capabilities: ['account-read','cash-read','positions-read','activity-read','transfers-read','portfolio-history-read'],
    scopes: ['read:account','read:cash','read:positions','read:activities','read:transfers','read:portfolio'],
    priority: 100,
    risk: 'high',
    requiresHumanApproval: true,
    lastVerifiedAt: new Date().toISOString(),
    metadata: { environment: env, tradingEnabled: false, fundMovementEnabled: false, source: 'alpaca-oauth' }
  });

  for (const position of Array.isArray(positions) ? positions : []) {
    await recordAssetHolding({
      assetAccountId: assetAccount.id,
      symbol: String(position.symbol || ''),
      instrumentType: 'stock',
      name: position.symbol ? String(position.symbol) : undefined,
      quantity: position.qty != null ? Number(position.qty) : null,
      currency: 'USD',
      costBasis: position.cost_basis != null ? Number(position.cost_basis) : null,
      marketPrice: position.current_price != null ? Number(position.current_price) : null,
      marketValue: position.market_value != null ? Number(position.market_value) : null,
      valuationTime: new Date().toISOString(),
      source: 'alpaca-oauth',
      evidenceRef: String(evidence.id),
      verificationStatus: 'verified',
      metadata: { accountRef, environment: env }
    });
  }

  await getPostgresPool().query(
    `INSERT INTO broker_account_snapshots
      (id,provider,user_id,connection_id,account_ref,env,account,positions,activities,portfolio_history,verification_status,evidence_ids)
     VALUES($1,'alpaca',$2,$3,$4,$5,$6,$7,$8,$9,'verified',$10)`,
    ['broker-snapshot-' + crypto.randomUUID(),userId,connectionId,accountRef,env,JSON.stringify(account),JSON.stringify(positions),JSON.stringify(activities),JSON.stringify(portfolioHistory),JSON.stringify(evidenceIds)]
  );

  return { account, positions, activities, portfolioHistory, evidenceIds };
}

export async function verifyAlpacaBrokerAccount(userId: string, env: BrokerEnv = 'live') {
  const token = await getToken(userId, env);
  if (!token) throw new Error('No authorized Alpaca connection for this user and environment');
  if (token.expiresAt && new Date(token.expiresAt).getTime() < Date.now()) {
    throw new Error('Alpaca OAuth access token is expired; reconnect authorization');
  }
  return persistVerificationSnapshot(userId, env, token.connectionId || '', token.accountRef || '', token.token);
}

export async function getAlpacaBrokerStatus(userId: string) {
  const r = await getPostgresPool().query(
    `SELECT id,provider,user_id,connection_id,account_ref,env,scope,expires_at,revoked_at,created_at,updated_at
       FROM broker_token_vault WHERE provider='alpaca' AND user_id=$1 ORDER BY updated_at DESC`,
    [userId]
  );
  return r.rows.map((row: any) => ({
    id: row.id, provider: row.provider, connectionId: row.connection_id, accountRef: row.account_ref,
    environment: row.env, scope: row.scope, expiresAt: row.expires_at, revoked: Boolean(row.revoked_at),
    readOnly: true, tradingEnabled: false, fundMovementEnabled: false
  }));
}

export async function revokeAlpacaBrokerConnection(userId: string, env: BrokerEnv) {
  await getPostgresPool().query(
    'UPDATE broker_token_vault SET revoked_at=NOW(),updated_at=NOW() WHERE provider=\'alpaca\' AND user_id=$1 AND env=$2',
    [userId,env]
  );
  return { revoked: true, provider: 'alpaca', environment: env };
}

export function brokerCallbackSuccessUrl(params: { env: string; connectionId: string }) {
  const url = new URL(frontendUrl());
  url.searchParams.set('broker', 'alpaca');
  url.searchParams.set('status', 'connected');
  url.searchParams.set('environment', params.env);
  url.searchParams.set('connection', params.connectionId);
  return url.toString();
}
