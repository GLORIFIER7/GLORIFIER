/**
 * Keep authenticated Binance account reads on Binance's documented HTTPS API
 * origins. A configurable URL must never be allowed to receive the signed
 * query string or X-MBX-APIKEY header on an arbitrary host.
 */
const BINANCE_READ_ONLY_API_ORIGINS = new Set([
  'https://api.binance.com',
  'https://api-gcp.binance.com',
  'https://api1.binance.com',
  'https://api2.binance.com',
  'https://api3.binance.com',
  'https://api4.binance.com',
]);

const INVALID_ORIGIN = 'Binance API origin must be a permitted HTTPS root origin';

export function resolveBinanceReadOnlyApiOrigin(configuredValue?: string): string {
  const configured = configuredValue?.trim() || 'https://api.binance.com';
  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error(INVALID_ORIGIN);
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/' ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    !BINANCE_READ_ONLY_API_ORIGINS.has(parsed.origin)
  ) {
    throw new Error(INVALID_ORIGIN);
  }
  return parsed.origin;
}
