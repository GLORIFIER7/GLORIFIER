export function getBrandTermsUnavailableMessage(status, hasSecret, root) {
  if (status === 404) {
    return `Brand monitor is NOT OBSERVABLE: ${root}/api/brand-monitor/terms returned HTTP 404; the endpoint is missing or not routed.`;
  }
  if ((status === 401 || status === 403) && !hasSecret) {
    return `Brand monitor is NOT OBSERVABLE: ${root} requires authentication and BRAND_MONITOR_WEBHOOK_SECRET is not configured.`;
  }
  return null;
}
