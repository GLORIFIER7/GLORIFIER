import { createServer } from 'node:http';
import { githubMcpRoute } from '../src/lib/github-mcp.ts';

const HOST = '127.0.0.1';
const PORT = Number(process.env.MCP_LOCAL_CONFORMANCE_PORT || 8787);
const MAX_HARNESS_BODY_BYTES = 1_048_576;

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
    const method = incoming.method || 'GET';
    const rawBody = method === 'GET' || method === 'HEAD'
      ? undefined
      : await readRequestBody(incoming);
    const headers = new Headers();

    for (const [name, value] of Object.entries(incoming.headers)) {
      if (name === 'connection' || name === 'host' || name === 'transfer-encoding') continue;
      if (typeof value === 'string') headers.set(name, value);
      else if (Array.isArray(value)) headers.set(name, value.join(', '));
    }

    const host = incoming.headers.host || `${HOST}:${PORT}`;
    const url = new URL(incoming.url || '/', `http://${host}`);
    const request = new Request(url, {
      method,
      headers,
      ...(rawBody === undefined ? {} : { body: rawBody }),
    });
    const response = await githubMcpRoute(
      request,
      localRateLimiter,
      process.env.GITHUB_MCP_READ_TOKEN,
    );

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
    });
    outgoing.end(JSON.stringify({ error: statusCode === 413
      ? 'Local MCP conformance request exceeds the harness safety limit.'
      : 'Local MCP conformance adapter failed.' }));
  }
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Local GLORIFIER MCP conformance server listening on http://${HOST}:${PORT}/mcp\n`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
