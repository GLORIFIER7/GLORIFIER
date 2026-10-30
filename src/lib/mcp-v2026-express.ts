import express, { type Request, type Response } from 'express';
import {
  MCPJsonRpcHeaders,
  MCPJsonRpcResponse,
  createMCPJsonRpcHandler,
  MCP_MAX_REQUEST_BYTES,
} from './mcp-v2026';
import type { MCPJsonRpcDependencies } from './mcp-v2026';

export interface MCPExpressAuthenticatedRequest extends Request {
  auth?: { uid?: string };
}

export interface MCPExpressDependencies extends Omit<MCPJsonRpcDependencies, 'requesterAgentId'> {
  getAllowedOrigins(): string[];
}

function rpcHttpError(
  res: Response,
  status: number,
  code: number,
  message: string,
  data?: unknown,
) {
  return res.status(status).type('application/json').json({
    jsonrpc: '2.0',
    id: null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  });
}

function responseStatus(response: MCPJsonRpcResponse): number {
  if (!('error' in response) || !response.error) return 200;
  if (response.error.code === -32601) return 404;
  if (response.error.code === -32020 || response.error.code === -32022 || response.error.code === -32600) return 400;
  return 200;
}

function validOrigin(origin: string, allowed: string[]): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || parsed.username || parsed.password) return false;
    return allowed.some((candidate) => {
      try {
        const allowedOrigin = new URL(candidate);
        return allowedOrigin.origin === candidate && allowedOrigin.origin === parsed.origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export function createMCPExpressRouter(dependencies: MCPExpressDependencies) {
  const router = express.Router();

  router.post('/api/mcp/v1', async (req: MCPExpressAuthenticatedRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (!req.is('application/json')) {
      return rpcHttpError(res, 415, -32600, 'Content-Type must be application/json.');
    }

    const accept = (req.get('accept') || '').split(',').map((value) => value.split(';', 1)[0].trim().toLowerCase());
    if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
      return rpcHttpError(res, 406, -32600, 'Accept must include application/json and text/event-stream.');
    }

    const origin = req.get('origin');
    if (origin && !validOrigin(origin, dependencies.getAllowedOrigins())) {
      return rpcHttpError(res, 403, -32000, 'Origin is not allowed.');
    }

    const requesterAgentId = String(req.auth?.uid || '').trim();
    if (!requesterAgentId) {
      return rpcHttpError(res, 401, -32000, 'Authentication is required.');
    }

    let bodyBytes: number;
    try {
      bodyBytes = Buffer.byteLength(JSON.stringify(req.body ?? null), 'utf8');
    } catch {
      return rpcHttpError(res, 400, -32600, 'Invalid JSON-RPC request body.');
    }
    if (bodyBytes > MCP_MAX_REQUEST_BYTES) {
      return rpcHttpError(res, 413, -32602, 'MCP request body exceeds 65,536 bytes.');
    }

    const headers: MCPJsonRpcHeaders = {
      protocolVersion: req.get('MCP-Protocol-Version') || null,
      method: req.get('Mcp-Method') || null,
      name: req.get('Mcp-Name') || null,
    };
    const handle = createMCPJsonRpcHandler({
      requesterAgentId,
      getTask: dependencies.getTask,
    });
    const response = await handle(req.body, headers);
    return res.status(responseStatus(response)).type('application/json').json(response);
  });

  return router;
}
