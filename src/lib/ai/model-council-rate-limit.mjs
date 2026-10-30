import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

/** Use the observed socket peer; never trust client-supplied forwarded-IP headers. */
export function resolveIngressClientAddress(req) {
  return req.socket?.remoteAddress || 'unknown';
}

/**
 * Creates the spend guard for provider-fanout council requests.
 * Authenticated users receive independent quotas; trusted internal-service calls
 * without a user principal are grouped by normalized client IP.
 */
export function createModelCouncilRateLimit({
  windowMs = 60_000,
  limit = 2,
  handler,
  production = process.env.NODE_ENV === 'production',
  singleInstanceConfirmed = process.env.AI_COUNCIL_SINGLE_INSTANCE === 'true',
} = {}) {
  if (!Number.isInteger(windowMs) || windowMs <= 0) {
    throw new RangeError('windowMs must be a positive integer.');
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new RangeError('limit must be a positive integer.');
  }

  // express-rate-limit's default store is process-local. Production must explicitly
  // attest that this backend is constrained to one instance until a shared store is wired.
  if (production && !singleInstanceConfirmed) {
    return (_req, res) => res.status(503).json({
      ok: false,
      error: 'AI council is disabled: confirm this production deployment runs exactly one backend instance and set AI_COUNCIL_SINGLE_INSTANCE=true. Horizontal scaling is unsupported until a shared store is implemented.',
    });
  }

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => {
      const principalId = req.auth?.uid;
      if (typeof principalId === 'string' && principalId.trim()) {
        return `ai-council:user:${principalId}`;
      }
      return `ai-council:ip:${ipKeyGenerator(resolveIngressClientAddress(req))}`;
    },
    handler: handler || ((_req, res) => {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({
        ok: false,
        error: `AI council usage is limited to ${limit} requests per ${Math.ceil(windowMs / 1000)} seconds.`,
      });
    }),
  });
}
