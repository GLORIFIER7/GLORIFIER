import crypto from 'node:crypto';
import { getConnection } from './connection-registry';
import {
  getAssetAccount,
  registerAssetAccount,
  recordAssetAccountEvent,
  recordAssetEvidence,
  recordAssetHolding
} from './asset-registry';

type ProviderPosition = {
  symbol?: string;
  qty?: string | number;
  avg_entry_price?: string | number;
  market_value?: string | number;
  current_price?: string | number;
  asset_class?: string;
  name?: string;
  exchange?: string;
  cost_basis?: string | number;
  unrealized_pl?: string | number;
  unrealized_plpc?: string | number;
};

type AlpacaAccount = {
  id?: string;
  account_number?: string;
  status?: string;
  currency?: string;
  buying_power?: string;
  cash?: string;
  portfolio_value?: string;
  equity?: string;
  last_equity?: string;
};

function requireAlpacaCredentials() {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) {
    throw new Error('ALPACA_API_KEY and ALPACA_API_SECRET are required for live Alpaca synchronization');
  }
  return { key, secret };
}

function alpacaBaseUrl() {
  return process.env.ALPACA_BROKER_BASE_URL || 'https://paper-api.alpaca.markets';
}

async function alpacaGet<T>(path: string): Promise<T> {
  const { key, secret } = requireAlpacaCredentials();
  const response = await fetch(`${alpacaBaseUrl()}${path}`, {
    headers: {
      'APCA-API-KEY-ID': key,
      'APCA-API-SECRET-KEY': secret,
      Accept: 'application/json'
    }
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Alpaca API ${response.status}: ${body.slice(0, 500)}`);
  }
  return body ? JSON.parse(body) as T : {} as T;
}

function instrumentType(position: ProviderPosition): 'stock' | 'bond' | 'etf' | 'crypto' | 'other' {
  const cls = String(position.asset_class || '').toLowerCase();
  if (cls.includes('crypto')) return 'crypto';
  const symbol = String(position.symbol || '').toUpperCase();
  if (symbol.endsWith('ETF') || ['SPY','QQQ','VTI','VOO','IVV','IWM','DIA'].includes(symbol)) return 'etf';
  // Alpaca positions expose asset class rather than a universal bond flag. Preserve
  // unknown fixed-income instruments as "other" until provider metadata identifies them.
  if (cls.includes('bond') || cls.includes('fixed')) return 'bond';
  if (cls.includes('us_equity') || cls.includes('equity')) return 'stock';
  return 'other';
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function payloadHash(payload: unknown) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

export async function syncAlpacaAssets(input: {
  connectionId: string;
  assetAccountId?: string;
  actor?: string;
}) {
  const actor = input.actor || 'alpaca-asset-adapter';
  const connection = await getConnection(input.connectionId);
  if (!connection) throw new Error('Connection not found');
  if (connection.provider.toLowerCase() !== 'alpaca') {
    throw new Error('Connection provider must be alpaca');
  }
  if (connection.status !== 'authorized') {
    throw new Error('Alpaca connection is not authorized');
  }

  const account = await alpacaGet<AlpacaAccount>('/v2/account');
  const positions = await alpacaGet<ProviderPosition[]>('/v2/positions');

  let assetAccount = input.assetAccountId ? await getAssetAccount(input.assetAccountId) : null;
  if (assetAccount && assetAccount.connectionId !== input.connectionId) {
    throw new Error('Asset account is linked to a different connection');
  }

  if (!assetAccount) {
    assetAccount = await registerAssetAccount({
      provider: 'alpaca',
      displayName: 'Alpaca Brokerage',
      assetClass: 'stock',
      status: 'authorized',
      accountRef: account.account_number || account.id || null,
      connectionId: input.connectionId,
      custody: 'custodial',
      capabilities: ['account-read','positions-read','market-data'],
      scopes: ['read:account','read:positions'],
      priority: 100,
      risk: 'high',
      requiresHumanApproval: true,
      lastVerifiedAt: new Date().toISOString(),
      metadata: {
        integrationType: 'broker',
        credentialsStoredOutsideRegistry: true,
        fundMovementEnabled: false
      }
    });
  }

  const observedAt = new Date().toISOString();
  const sourceRef = `alpaca:${account.id || account.account_number || 'account'}:${observedAt}`;
  const evidence = await recordAssetEvidence({
    assetAccountId: assetAccount.id,
    evidenceType: 'broker_snapshot',
    source: 'alpaca',
    sourceRef,
    observedAt,
    payloadHash: payloadHash({ account, positions }),
    details: {
      account: {
        id: account.id || null,
        accountNumberPresent: Boolean(account.account_number),
        status: account.status || null,
        currency: account.currency || null,
        portfolioValue: num(account.portfolio_value),
        equity: num(account.equity)
      },
      positionCount: positions.length
    }
  });

  const holdings = [];
  for (const position of positions) {
    if (!position.symbol) continue;
    const type = instrumentType(position);
    const holding = await recordAssetHolding({
      assetAccountId: assetAccount.id,
      symbol: position.symbol,
      instrumentType: type,
      name: position.name || undefined,
      quantity: num(position.qty),
      currency: account.currency || 'USD',
      costBasis: num(position.cost_basis) ?? (
        num(position.avg_entry_price) !== null && num(position.qty) !== null
          ? Number(position.avg_entry_price) * Number(position.qty)
          : null
      ),
      marketPrice: num(position.current_price),
      marketValue: num(position.market_value),
      valuationTime: observedAt,
      source: 'alpaca',
      evidenceRef: evidence.id,
      metadata: {
        exchange: position.exchange || null,
        providerAssetClass: position.asset_class || null,
        unrealizedPl: num(position.unrealized_pl),
        unrealizedPlpc: num(position.unrealized_plpc)
      }
    });
    holdings.push(holding);
  }

  await recordAssetAccountEvent(assetAccount.id, 'provider_sync_completed', actor, {
    provider: 'alpaca',
    connectionId: input.connectionId,
    evidenceId: evidence.id,
    positionCount: holdings.length,
    observedAt
  });

  return {
    provider: 'alpaca',
    connectionId: input.connectionId,
    assetAccountId: assetAccount.id,
    observedAt,
    account: {
      status: account.status || null,
      currency: account.currency || null,
      portfolioValue: num(account.portfolio_value),
      equity: num(account.equity)
    },
    holdings,
    evidenceId: evidence.id,
    verification: {
      status: 'source_recorded',
      evidenceRequiredForVerification: true,
      revenueVerified: false,
      marketValueIsNotRevenue: true
    }
  };
}

export async function getAlpacaStockQuote(symbol: string) {
  const clean = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,20}$/.test(clean)) throw new Error('Invalid stock symbol');
  const data = await alpacaGet<any>(`/v2/stocks/${encodeURIComponent(clean)}/quotes/latest`);
  return {
    provider: 'alpaca',
    symbol: clean,
    source: 'alpaca',
    observedAt: new Date().toISOString(),
    quote: data
  };
}


export type AssetProviderCapabilities = {
  accountRead: boolean;
  holdingsRead: boolean;
  marketData: boolean;
  ordersEnabled: boolean;
  fundMovementEnabled: boolean;
};

export type AssetProviderDescriptor = {
  id: string;
  displayName: string;
  assetClasses: Array<'stock' | 'bond' | 'etf' | 'crypto' | 'other'>;
  capabilities: AssetProviderCapabilities;
  connectionRequired: boolean;
};

export const assetProviderRegistry: AssetProviderDescriptor[] = [
  {
    id: 'alpaca',
    displayName: 'Alpaca',
    assetClasses: ['stock', 'bond', 'etf', 'crypto', 'other'],
    capabilities: {
      accountRead: true,
      holdingsRead: true,
      marketData: true,
      ordersEnabled: false,
      fundMovementEnabled: false
    },
    connectionRequired: true
  },
  {
    id: 'binance-public',
    displayName: 'Binance Public Market Data',
    assetClasses: ['crypto'],
    capabilities: {
      accountRead: false,
      holdingsRead: false,
      marketData: true,
      ordersEnabled: false,
      fundMovementEnabled: false
    },
    connectionRequired: false
  }
];

export function listAssetProviderAdapters() {
  return assetProviderRegistry.map((provider) => ({ ...provider }));
}

export function getAssetProviderAdapter(providerId: string) {
  return assetProviderRegistry.find((provider) => provider.id === providerId) || null;
}

async function binancePublicGet<T>(path: string): Promise<T> {
  // Binance documents multiple equivalent REST base endpoints. Try the
  // primary endpoint first, then documented alternates so a transient
  // hostname/edge issue does not make public market data unavailable.
  const baseUrls = [
    'https://api.binance.com',
    'https://api1.binance.com',
    'https://api2.binance.com',
    'https://api3.binance.com',
    'https://api4.binance.com',
    'https://api-gcp.binance.com'
  ];
  let lastError = 'Binance public API unavailable';
  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      const body = await response.text();
      if (response.ok) return body ? JSON.parse(body) as T : {} as T;
      lastError = `Binance public API ${response.status}: ${body.slice(0, 500)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError);
}

export async function getBinancePublicQuote(symbol: string) {
  const clean = symbol.trim().toUpperCase();
  if (!/^[A-Z0-9]{5,20}$/.test(clean)) throw new Error('Invalid Binance symbol');
  const ticker = await binancePublicGet<{ symbol: string; price: string }>(
    `/api/v3/ticker/price?symbol=${encodeURIComponent(clean)}`
  );
  return {
    provider: 'binance-public',
    symbol: ticker.symbol,
    price: Number(ticker.price),
    source: 'binance-public',
    observedAt: new Date().toISOString(),
    evidence: {
      status: 'source_recorded',
      marketValueIsNotRevenue: true,
      revenueVerified: false
    }
  };
}
