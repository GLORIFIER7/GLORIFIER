import crypto from 'node:crypto';
import { registerAssetAccount, recordAssetAccountEvent, recordAssetEvidence } from './asset-registry';

type BinancePermissionResponse = {
  ipRestrict?: boolean;
  enableReading?: boolean;
  enableWithdrawals?: boolean;
  enableInternalTransfer?: boolean;
  enableMargin?: boolean;
  enableFutures?: boolean;
  permitsUniversalTransfer?: boolean;
  enableVanillaOptions?: boolean;
  enableFixApiTrade?: boolean;
  enableFixReadOnly?: boolean;
  enableSpotAndMarginTrading?: boolean;
  enablePortfolioMarginTrading?: boolean;
};

type BinanceAccountStatus = { data?: string };
type BinanceSpotAccount = { balances?: Array<{ asset: string; free: string; locked: string }>; accountType?: string; canTrade?: boolean; canWithdraw?: boolean; canDeposit?: boolean; };
type BinanceApiError = { code?: number; msg?: string };

function credentials() {
  const apiKey = process.env.BINANCE_API_KEY?.trim();
  const apiSecret = process.env.BINANCE_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

function sign(query: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

function addDecimalStrings(a: string, b: string) {
  const [ai = '0', af = ''] = String(a || '0').split('.');
  const [bi = '0', bf = ''] = String(b || '0').split('.');
  const scale = Math.max(af.length, bf.length);
  const toUnits = (whole: string, fraction: string) => BigInt(whole || '0') * (10n ** BigInt(scale)) + BigInt((fraction || '').padEnd(scale, '0') || '0');
  const units = toUnits(ai, af) + toUnits(bi, bf);
  const divisor = 10n ** BigInt(scale);
  const whole = units / divisor;
  if (scale === 0) return whole.toString();
  const fraction = (units % divisor).toString().padStart(scale, '0').replace(/0+$/, '');
  return fraction ? whole.toString() + '.' + fraction : whole.toString();
}

async function signedGet<T>(path: string): Promise<T> {
  const auth = credentials();
  if (!auth) throw new Error('Binance read-only credentials are not configured');

  const params = new URLSearchParams({
    timestamp: String(Date.now()),
    recvWindow: '5000'
  });
  params.set('signature', sign(params.toString(), auth.apiSecret));

  const baseUrl = String(process.env.BINANCE_BASE_URL || 'https://api.binance.com').replace(/\/$/, '');
  const response = await fetch(`${baseUrl}${path}?${params.toString()}`, {
    headers: {
      'X-MBX-APIKEY': auth.apiKey,
      Accept: 'application/json'
    }
  });
  const body = await response.text();

  if (!response.ok) {
    let apiError: BinanceApiError = {};
    try { apiError = body ? JSON.parse(body) as BinanceApiError : {}; } catch {}
    const error = new Error(apiError.msg || `Binance API ${response.status}`);
    (error as Error & { status?: number; code?: number }).status = response.status;
    (error as Error & { status?: number; code?: number }).code = apiError.code;
    throw error;
  }

  return body ? JSON.parse(body) as T : {} as T;
}

function configuredReadOnlyFlag() {
  return String(process.env.BINANCE_READ_ONLY || '').trim().toLowerCase() === 'true';
}

export async function verifyBinanceReadOnlyConnection() {
  const auth = credentials();
  const result = {
    provider: 'binance',
    configured: Boolean(auth),
    configuredReadOnlyFlag: configuredReadOnlyFlag(),
    credentialsExposed: false,
    authentication: 'not-tested' as 'not-tested' | 'verified' | 'failed',
    authenticationErrorCode: null as number | null,
    authenticationError: null as string | null,
    permissions: {
      reading: false,
      withdrawals: false,
      internalTransfer: false,
      universalTransfer: false,
      margin: false,
      futures: false,
      options: false,
      spotAndMarginTrading: false,
      portfolioMarginTrading: false,
      apiTrade: false,
      apiFixReadOnly: false,
      ipRestricted: false
    },
    accountStatus: 'not-tested' as string,
    spotAccount: { accountType: null as string | null, canTrade: null as boolean | null, canWithdraw: null as boolean | null, canDeposit: null as boolean | null },
    balances: [] as Array<{ asset: string; free: string; locked: string; total: string }>,
    safeForReadOnly: false,
    evidenceRecorded: false,
    evidenceId: null as string | null,
    checkedAt: new Date().toISOString()
  };

  if (!auth) return result;

  try {
    const permissions = await signedGet<BinancePermissionResponse>('/sapi/v1/account/apiRestrictions');
    result.permissions = {
      reading: permissions.enableReading === true,
      withdrawals: permissions.enableWithdrawals === true,
      internalTransfer: permissions.enableInternalTransfer === true,
      universalTransfer: permissions.permitsUniversalTransfer === true,
      margin: permissions.enableMargin === true,
      futures: permissions.enableFutures === true,
      options: permissions.enableVanillaOptions === true,
      spotAndMarginTrading: permissions.enableSpotAndMarginTrading === true,
      portfolioMarginTrading: permissions.enablePortfolioMarginTrading === true,
      apiTrade: permissions.enableFixApiTrade === true,
      apiFixReadOnly: permissions.enableFixReadOnly === true,
      ipRestricted: permissions.ipRestrict === true
    };
    result.safeForReadOnly =
      result.configuredReadOnlyFlag && result.permissions.reading &&
      !result.permissions.withdrawals && !result.permissions.internalTransfer &&
      !result.permissions.universalTransfer && !result.permissions.margin &&
      !result.permissions.futures && !result.permissions.options &&
      !result.permissions.spotAndMarginTrading && !result.permissions.portfolioMarginTrading &&
      !result.permissions.apiTrade;
    result.authentication = 'verified';

    const account = await signedGet<BinanceAccountStatus>('/sapi/v1/account/status');
    result.accountStatus = account.data || 'unknown';
    if (result.safeForReadOnly) {
      const spotAccount = await signedGet<BinanceSpotAccount>('/api/v3/account');
      result.spotAccount = {
        accountType: spotAccount.accountType || null,
        canTrade: spotAccount.canTrade ?? null,
        canWithdraw: spotAccount.canWithdraw ?? null,
        canDeposit: spotAccount.canDeposit ?? null
      };
      result.balances = (spotAccount.balances || [])
        .map((item) => ({ asset: item.asset, free: item.free, locked: item.locked, total: addDecimalStrings(item.free || '0', item.locked || '0') }))
        .filter((item) => item.total !== '0');

      try {
        const assetAccount = await registerAssetAccount({
          provider: 'binance', displayName: 'Binance Crypto', assetClass: 'crypto', status: 'authorized',
          custody: 'custodial', capabilities: ['balances','portfolio-metadata','market-data'],
          scopes: ['read:balances','read:portfolio'], priority: 100, risk: 'high', requiresHumanApproval: true,
          metadata: { integrationType: 'exchange', credentialsStoredOutsideRegistry: true, fundMovementEnabled: false, verificationMethod: 'signed Binance USER_DATA API', permissionPolicy: 'read-only' }
        });
        const payload = JSON.stringify({ provider: 'binance', accountType: result.spotAccount.accountType, balanceCount: result.balances.length, permissions: result.permissions, observedAt: result.checkedAt });
        const evidence = await recordAssetEvidence({
          assetAccountId: assetAccount.id,
          evidenceType: 'exchange_read_only_account_verification', source: 'binance',
          sourceRef: 'GET /sapi/v1/account/apiRestrictions + GET /api/v3/account', observedAt: result.checkedAt,
          payloadHash: crypto.createHash('sha256').update(payload).digest('hex'),
          details: { authentication: 'verified', safeForReadOnly: true, balanceCount: result.balances.length, permissions: result.permissions, accountType: result.spotAccount.accountType, credentialsExposed: false }
        });
        await recordAssetAccountEvent(assetAccount.id, 'read_only_verified', 'system', { evidenceId: evidence.id, observedAt: result.checkedAt });
        result.evidenceRecorded = true;
        result.evidenceId = evidence.id;
      } catch {
        result.authenticationError = 'Authenticated Binance response received, but evidence persistence failed';
      }
    }

  } catch (error) {
    result.authentication = 'failed';
    const safeError = error as Error & { code?: number };
    result.authenticationErrorCode = typeof safeError.code === 'number' ? safeError.code : null;
    result.authenticationError = safeError.message || 'Binance authentication failed';
  }

  return result;
}