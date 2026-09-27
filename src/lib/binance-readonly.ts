import crypto from 'node:crypto';

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

async function signedGet<T>(path: string): Promise<T> {
  const auth = credentials();
  if (!auth) throw new Error('Binance read-only credentials are not configured');

  const params = new URLSearchParams({
    timestamp: String(Date.now()),
    recvWindow: '5000'
  });
  params.set('signature', sign(params.toString(), auth.apiSecret));

  const response = await fetch(`https://api.binance.com${path}?${params.toString()}`, {
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
      apiFixReadOnly: false
    },
    accountStatus: 'not-tested' as string,
    safeForReadOnly: false,
    checkedAt: new Date().toISOString()
  };

  if (!auth) return result;

  try {
    const permissions = await signedGet<BinancePermissionResponse>('/sapi/v1/account/apiRestrictions');
    const account = await signedGet<BinanceAccountStatus>('/sapi/v1/account/status');

    result.authentication = 'verified';
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
      apiFixReadOnly: permissions.enableFixReadOnly === true
    };
    result.accountStatus = account.data || 'unknown';

    result.safeForReadOnly =
      result.configuredReadOnlyFlag &&
      result.permissions.reading &&
      !result.permissions.withdrawals &&
      !result.permissions.internalTransfer &&
      !result.permissions.universalTransfer &&
      !result.permissions.margin &&
      !result.permissions.futures &&
      !result.permissions.options &&
      !result.permissions.spotAndMarginTrading &&
      !result.permissions.portfolioMarginTrading &&
      !result.permissions.apiTrade;
  } catch (error) {
    result.authentication = 'failed';
    const safeError = error as Error & { code?: number };
    result.authenticationErrorCode = typeof safeError.code === 'number' ? safeError.code : null;
    result.authenticationError = safeError.message || 'Binance authentication failed';
  }

  return result;
}