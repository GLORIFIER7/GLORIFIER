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
export function isProtectedApiReadPath(pathname: string): boolean {
  const normalizedPath = pathname.toLowerCase();
  return PROTECTED_READ_PREFIXES.some(
    (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
  );
}
