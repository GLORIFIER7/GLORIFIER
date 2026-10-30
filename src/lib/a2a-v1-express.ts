import express, { type Express, type Request, type Response } from 'express';
import {
  buildA2AAgentCard,
  createA2AJsonRpcHandler,
  A2A_PROTOCOL_VERSION,
  isCompatibleA2AProtocolVersion,
  type A2ACreateTaskInput,
  type A2ATaskLike,
} from './a2a-v1';

export interface A2AExpressAuthenticatedRequest extends Request {
  auth?: { uid?: string };
}

export interface A2AExpressDependencies {
  getPublicBaseUrl(): string;
  getAgentVersion(): string;
  isPersistenceConfigured(): boolean;
  initializePersistence(): Promise<void>;
  createTask(input: A2ACreateTaskInput): A2ATaskLike | Promise<A2ATaskLike>;
  getTask(id: string): A2ATaskLike | null | Promise<A2ATaskLike | null>;
}

function jsonRpcHttpError(
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


/**
 * Install the exact production JSON parser and protocol-safe error mapping
 * used by the backend A2A route. Keep this shared with HTTP-level tests.
 */
export function configureA2AJsonRpcBodyParsing(app: Express): void {
  app.use('/api/a2a/v1', express.json({ limit: '64kb', strict: false, type: 'application/json' }));
  app.use('/api/a2a/v1', (error: unknown, _req: Request, res: Response, next: express.NextFunction) => {
    const parserError = error as { type?: string } | null;
    if (parserError?.type === 'entity.too.large') {
      return res.status(413).type('application/json').json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32602, message: 'A2A request body exceeds 65,536 bytes.' },
      });
    }
    if (parserError?.type === 'entity.parse.failed' || parserError?.type === 'entity.verify.failed') {
      return res.status(400).type('application/json').json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: request body must be valid JSON.' },
      });
    }
    return next(error);
  });
}

async function initializeIfConfigured(dependencies: A2AExpressDependencies): Promise<boolean> {
  if (!dependencies.isPersistenceConfigured()) return false;
  await dependencies.initializePersistence();
  return true;
}

export function createA2AExpressRouter(dependencies: A2AExpressDependencies) {
  const router = express.Router();

  router.get('/.well-known/agent-card.json', (_req: Request, res: Response) => {
    const publicBaseUrl = dependencies.getPublicBaseUrl().trim();
    if (!publicBaseUrl) {
      return res.status(503).json({ ok: false, code: 'A2A_PUBLIC_URL_NOT_CONFIGURED' });
    }
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.json(buildA2AAgentCard(publicBaseUrl, dependencies.getAgentVersion()));
    } catch {
      return res.status(503).json({ ok: false, code: 'A2A_PUBLIC_URL_INVALID' });
    }
  });

  router.post('/api/a2a/v1', async (req: A2AExpressAuthenticatedRequest, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const requestedVersion = req.get('A2A-Version') || String(req.query['A2A-Version'] || '');
    // The protocol defines an omitted version as 0.3; this interface only
    // advertises 1.0, so reject omitted and unsupported versions explicitly.
    if (!isCompatibleA2AProtocolVersion(requestedVersion)) {
      return res.status(400).type('application/problem+json').json({
        type: 'https://a2a-protocol.org/errors/version-not-supported',
        title: 'Protocol Version Not Supported',
        status: 400,
        detail: `The requested A2A protocol version ${requestedVersion || '0.3'} is not supported by this agent.`,
        supportedVersions: [A2A_PROTOCOL_VERSION],
      });
    }

    try {
      if (!(await initializeIfConfigured(dependencies))) {
        return jsonRpcHttpError(res, 503, -32000, 'A2A persistent task storage is not configured.', { code: 'A2A_PERSISTENCE_NOT_CONFIGURED' });
      }
    } catch {
      return jsonRpcHttpError(res, 503, -32000, 'A2A persistent task storage is unavailable.', { code: 'A2A_PERSISTENCE_UNAVAILABLE' });
    }

    if (!req.is('application/json')) {
      return jsonRpcHttpError(res, 415, -32600, 'Content-Type must be application/json.');
    }

    let bodyBytes: number;
    try {
      bodyBytes = Buffer.byteLength(JSON.stringify(req.body ?? null), 'utf8');
    } catch {
      return jsonRpcHttpError(res, 400, -32600, 'Invalid JSON-RPC request body.');
    }
    if (bodyBytes > 65_536) {
      return jsonRpcHttpError(res, 413, -32602, 'A2A request body exceeds 65,536 bytes.');
    }

    const requesterAgentId = String(req.auth?.uid || '').trim();
    const handle = createA2AJsonRpcHandler({
      requesterAgentId,
      createTask: dependencies.createTask,
      getTask: dependencies.getTask,
    });
    try {
      const response = await handle(req.body);
      return res.status(200).type('application/json').json(response);
    } catch {
      return jsonRpcHttpError(res, 500, -32603, 'A2A request failed unexpectedly.');
    }
  });

  return router;
}
