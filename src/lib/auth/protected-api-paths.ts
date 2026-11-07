const PROTECTED_READ_PREFIXES = [
  '/payouts',
  '/monetization/subscription',
  '/connections',
  '/llama-cloud',
  '/agents',
  '/a2a/tasks',
  '/federated-a2a/v3/tasks',
  '/governance',
  '/control-plane',
  '/app-state',
  '/auth/session',
  // Payment-intent reads expose payer/payee and settlement metadata; require identity.
  '/economy/glr/intents',
  // Legacy A2A task reads expose requester-scoped state and require authentication.
  '/a2a/tasks',
] as const;

/**
 * Match protected API read paths case-insensitively, consistent with Express's
 * default case-insensitive route matching. Prefix boundaries prevent similarly
 * named public paths (for example, /intents-export) from being misclassified.
 */
export const isProtectedApiReadPath = (pathname: string): boolean => {
  const normalizedPath = pathname.toLowerCase();
  return PROTECTED_READ_PREFIXES.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
};
/**
 * Agent routes use a per-host 256-bit bearer credential and perform their own
 * constant-time credential verification. Exempt only the three exact POST
 * shapes; every other mutation remains behind user identity authentication.
 */
const LINUX_HOST_AGENT_POST_PATH =
  /^\/linux\/agent\/linux-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/(?:heartbeat|tasks\/claim|tasks\/linux-task-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/result)$/i;

/**
 * Public API authentication bypass policy. Only preflight requests and
 * unprotected read-only paths bypass identity verification; all mutations
 * and protected reads continue through the authentication middleware.
 */
export const shouldBypassApiAuthentication = (method: string, pathname: string): boolean => {
  if (method.toUpperCase() === 'OPTIONS') return true;
  if (method.toUpperCase() === 'POST' && LINUX_HOST_AGENT_POST_PATH.test(pathname)) return true;
  if (method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') return false;
  return !isProtectedApiReadPath(pathname);
};
