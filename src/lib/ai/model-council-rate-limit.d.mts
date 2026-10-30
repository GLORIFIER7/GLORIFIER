import type { RequestHandler } from 'express';

export function createModelCouncilRateLimit(options?: {
  windowMs?: number;
  limit?: number;
  handler?: RequestHandler;
  production?: boolean;
  singleInstanceConfirmed?: boolean;
}): RequestHandler;

export function resolveIngressClientAddress(request: {
  ip?: string;
  socket?: { remoteAddress?: string };
}): string;
