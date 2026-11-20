import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { githubMcpRoute } from '../src/lib/github-mcp.ts';

const HOST = '127.0.0.1';
const PORT = Number(process.env.MCP_LOCAL_CONFORMANCE_PORT || 8787);
const MAX_HARNESS_BODY_BYTES = 1_048_576;

export const toLoopbackRequestUrl = (requestTarget) => {
  // This ephemeral CI harness binds only to 127.0.0.1; HTTP is confined to loopback.
  const loopbackOrigin = 'http://' + HOST + ':' + PORT; // NOSONAR -- intentional loopback-only transport; the server binds to 127.0.0.1.
  const parsedTarget = new URL(requestTarget || '/', loopbackOrigin);
  return new URL(parsedTarget.pathname + parsedTarget.search, loopbackOrigin);
};

export const isFetchUnsupportedMethod = (method) =>
  ['TRACE', 'CONNECT', 'TRACK'].includes(String(method).toUpperCase());

export const createHarnessErrorEnvelope = (statusCode) => ({
  jsonrpc: '2.0',
  id: null,
  error: statusCode === 413
    ? {
        code: -32600,
        message: 'Local MCP conformance request exceeds the 1,048,576-byte harness safety limit.',
      }
    : {
        code: -32603,
        message: 'Local MCP conformance adapter failed.',
      },
});

// The conformance harness runs against the actual MCP route implementation.
// It allows quota-safe local TCK execution without deploying a Worker or
// consuming the Cloudflare Workers Builds account quota.
const localRateLimiter = {
  async limit() {
    return { success: true };
  },
};

const readRequestBody = async (request) => {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_HARNESS_BODY_BYTES) {
      const error = new Error('Local MCP conformance request exceeds the harness safety limit.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, totalBytes);
};

const server = createServer(async (incoming, outgoing) => {
  try {
    const method = String(incoming.method || 'GET').toUpperCase();
    if (isFetchUnsupportedMethod(method)) {
      outgoing.writeHead(405, {
        Allow: 'POST',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      outgoing.end();
      return;
    }

    const rawBody = method === 'GET' || method === 'HEAD'
      ? undefined
      : await readRequestBody(incoming);
    const headers = new Headers();

    for (const [name, value] of Object.entries(incoming.headers)) {
      if (name === 'connection' || name === 'transfer-encoding') continue;
      if (typeof value === 'string') headers.set(name, value);
      else if (Array.isArray(value)) headers.set(name, value.join(', '));
    }

    // Keep the authority pinned to loopback even for absolute-form HTTP
    // request targets. Preserve Host separately for the route's authority check.
    const url = toLoopbackRequestUrl(incoming.url || '/');
    const request = new Request(url, {
      method,
      headers,
      ...(rawBody === undefined ? {} : { body: rawBody }),
    });
    // The repository is public. Do not forward any credential from the CI job
    // into code controlled by the pull request.
    const response = await githubMcpRoute(request, localRateLimiter);

    response.headers.forEach((value, name) => outgoing.setHeader(name, value));
    outgoing.writeHead(response.status);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Local MCP conformance adapter failed.';
    process.stderr.write(`Local MCP harness error: ${message}\n`);
    const statusCode = error && typeof error === 'object' && error.statusCode === 413 ? 413 : 500;
    outgoing.writeHead(statusCode, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    });
    outgoing.end(JSON.stringify(createHarnessErrorEnvelope(statusCode)));
  }
});

server.on('connect', (_incoming, socket) => {
  socket.end([
    'HTTP/1.1 405 Method Not Allowed',
    'Allow: POST',
    'Cache-Control: no-store',
    'Connection: close',
    'Content-Length: 0',
    '',
    '',
  ].join('\r\n'));
});

const isDirectExecution = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  server.listen(PORT, HOST, () => {
    process.stdout.write(`Local GLORIFIER MCP conformance server listening on http://${HOST}:${PORT}/mcp\n`);
  });
  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
