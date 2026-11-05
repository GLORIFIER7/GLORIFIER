import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from './worker.ts';
import { reportsSummaryResponse, runtimeVerificationResponse } from './worker.ts';
import type { NeonOperationalCounts } from './lib/neon-worker';
import type { CloudflareEnv } from './worker.ts';
import { A2A_AGENT_CARD_PATH, A2A_JSONRPC_PATH } from './lib/a2a-v1';
import { test } from 'node:test';

void test('worker regression suite', async () => {
type TestEnv = CloudflareEnv;

const originalFetch = globalThis.fetch;
let capturedRequest: Request | null = null;
let mcpRateLimitAllowed = true;
const mcpRateLimitKeys: string[] = [];
const requestedUrls: string[] = [];
let upstreamResponses: Response[] = [];
let openSeaResponseQueue: Response[] | null = null;
let openSeaFetchError: Error | null = null;
let upstreamResponse = new Response('{"ok":true}', {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
let shouldThrow = false;
let assetCalls = 0;
let returnHtmlForAssets = false;

const getCapturedRequest = (): Request => {
  if (!capturedRequest) throw new Error('Expected the Worker to call the backend.');
  return capturedRequest;
};

const mcpPost = (message: unknown, connectingIp?: string): Request => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (connectingIp) headers.set('CF-Connecting-IP', connectingIp);
  return new Request('https://glorifier.glorifier.workers.dev/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(message),
  });
};

const env: TestEnv = {
  GLORIFIER_BACKEND_ORIGIN: 'https://api.example.test',
  GLORIFIER_BACKEND_ALLOWED_HOSTS: 'api.example.test',
  GLORIFIER_NEURAL_ALLOWED_HOSTS: 'neural.example.test',
  ASSETS: {
    fetch() {
      assetCalls += 1;
      const response = returnHtmlForAssets
        ? new Response('<!doctype html><title>SPA</title>', { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
        : new Response('static asset', { status: 200 });
      return Promise.resolve(response);
    },
  },
  MCP_RATE_LIMITER: {
    limit({ key }: { key: string }) {
      mcpRateLimitKeys.push(key);
      return Promise.resolve({ success: mcpRateLimitAllowed });
    },
  },
};

const run = async (): Promise<void> => {
  let htmlResponseFixture: Response | undefined;
  const takeHtmlResponseFixture = (request: Request): Response | undefined => {
    if (!request.url.endsWith('/api/misrouted-endpoint') || !htmlResponseFixture) return undefined;
    const response = htmlResponseFixture;
    htmlResponseFixture = undefined;
    return response;
  };
  const isOpenSeaRequest = (url: string): boolean => url.startsWith('https://api.opensea.io/');
  const takeOpenSeaResponse = (request: Request): Response | undefined => {
    if (!isOpenSeaRequest(request.url)) return undefined;
    if (openSeaFetchError) throw openSeaFetchError;
    return openSeaResponseQueue?.shift();
  };
  const nextMockResponse = (request: Request): Response =>
    takeHtmlResponseFixture(request) ?? takeOpenSeaResponse(request) ?? upstreamResponses.shift() ?? upstreamResponse;
  const mockFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (shouldThrow) return Promise.reject(new Error('simulated upstream outage'));
    capturedRequest = input instanceof Request ? input : new Request(input, init);
    requestedUrls.push(capturedRequest.url);
    const request = capturedRequest;
    return Promise.resolve().then(() => nextMockResponse(request));
  };
  globalThis.fetch = mockFetch;
  const openSeaEnv = { ...env, OPENSEA_API_KEY: 'test-opensea-key' } as TestEnv & { OPENSEA_API_KEY?: string };

  try {
    const verifyWorkerAssetsAndPreviewIsolation = async (): Promise<void> => {
        const wranglerConfig = JSON.parse(readFileSync('wrangler.jsonc', 'utf8')) as {
          vars?: Record<string, string>;
          hyperdrive?: Array<{ binding: string; id: string }>;
          version_metadata?: { binding: string };
          assets?: { run_worker_first?: string[] };
          previews?: {
            vars?: Record<string, string>;
            hyperdrive?: Array<{ binding: string; id: string }>;
          };
        };
        assert.equal(wranglerConfig.vars?.GLORIFIER_DATABASE_PROVIDER, 'neon',
          'production must select the approved authoritative Neon database');
        const productionHyperdrive = wranglerConfig.hyperdrive?.find((binding) => binding.binding === 'HYPERDRIVE');
        assert.ok(productionHyperdrive?.id, 'production must bind the approved Neon Hyperdrive resource');
        assert.equal(wranglerConfig.version_metadata?.binding, 'CF_VERSION_METADATA',
          'production must expose the deployed Cloudflare Worker version metadata for source-provenance verification');
        assert.equal(wranglerConfig.previews?.vars?.GLORIFIER_DATABASE_PROVIDER, 'neon',
          'isolated Cloudflare Previews must use the approved Neon architecture without inheriting production provider settings');
        const previewHyperdrive = wranglerConfig.previews?.hyperdrive?.find((binding) => binding.binding === 'HYPERDRIVE');
        assert.equal(previewHyperdrive, undefined,
          'Cloudflare Previews must not bind the production Neon Hyperdrive resource; database access requires a separate non-production Hyperdrive configuration');
        assert.equal(wranglerConfig.previews?.vars?.GLORIFIER_SUPABASE_URL, undefined,
          'Preview configuration must not point to the production Supabase project');
        assert.equal(wranglerConfig.previews?.vars?.GLORIFIER_SUPABASE_SERVICE_ROLE_KEY, undefined,
          'Preview configuration must never include production database secrets');
        assert.equal((wranglerConfig as { observability?: { enabled?: boolean; logs?: { enabled?: boolean; invocation_logs?: boolean; head_sampling_rate?: number }; traces?: { enabled?: boolean; head_sampling_rate?: number }; issues?: { enabled?: boolean } } }).observability?.enabled, true,
          'production Worker observability must be enabled');
        const observability = (wranglerConfig as { observability?: { enabled?: boolean; logs?: { enabled?: boolean; invocation_logs?: boolean; head_sampling_rate?: number }; traces?: { enabled?: boolean; head_sampling_rate?: number }; issues?: { enabled?: boolean } } }).observability;
        assert.equal(observability?.logs?.enabled, true);
        assert.equal(observability?.logs?.invocation_logs, true);
        assert.equal(observability?.logs?.head_sampling_rate, 0.1,
          'Worker invocation logs must use a conservative 10% sampling rate');
        assert.equal(observability?.traces?.enabled, true);
        assert.equal(observability?.traces?.head_sampling_rate, 0.01,
          'Worker traces must use a conservative 1% sampling rate');
        assert.equal(observability?.issues?.enabled, true,
          'Cloudflare Workers Issues detection must be enabled');
        assert.ok(wranglerConfig.assets?.run_worker_first?.includes('/mcp'), 'Cloudflare assets must route /mcp through the Worker before SPA fallback');
        assert.ok(wranglerConfig.assets?.run_worker_first?.includes('/mcp/*'), 'Cloudflare assets must route nested /mcp paths through the Worker');

        const staticResponse = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/assets/app.js'),
          env,
        );
        assert.equal(await staticResponse.text(), 'static asset');
        assert.equal(assetCalls, 1);
        assert.equal(capturedRequest, null, 'static assets must not call the backend');

        returnHtmlForAssets = true;
        const missingAsset = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/assets/missing-chunk.js'),
          env,
        );
        assert.equal(missingAsset.status, 404, 'SPA HTML must not be served as a missing JavaScript asset');
        assert.match(missingAsset.headers.get('content-type') ?? '', /^text\/plain/i);
        returnHtmlForAssets = false;

        // Preview deployments do not inherit production bindings. Missing rate limiting
        // must fail closed with a deliberate service response, never an unhandled TypeError.
        const previewWithoutRateLimiter = {
          ...env,
          GLORIFIER_DATABASE_PROVIDER: 'neon',
          GLORIFIER_SUPABASE_URL: undefined,
          GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: undefined,
          HYPERDRIVE: undefined,
          MCP_RATE_LIMITER: undefined,
        } as unknown as TestEnv;
        const previewDatabaseStatus = await reportsSummaryResponse(previewWithoutRateLimiter);
        assert.equal(previewDatabaseStatus.status, 503,
          'Preview reporting must remain unavailable until an isolated Neon Hyperdrive binding is supplied');
        const previewDatabaseBody = await previewDatabaseStatus.json() as { code?: string };
        assert.equal(previewDatabaseBody.code, 'NEON_HYPERDRIVE_NOT_CONFIGURED',
          'Preview must not silently fall back to the production database');

        const previewMcpWithoutRateLimit = await worker.fetch(
          mcpPost({ jsonrpc: '2.0', id: 'preview', method: 'initialize', params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'preview-test', version: '1' },
          } }),
          previewWithoutRateLimiter,
        );
        assert.equal(previewMcpWithoutRateLimit.status, 503,
          'MCP must fail closed when an isolated Preview has no rate-limit binding');
        assert.equal(previewMcpWithoutRateLimit.headers.get('cache-control'), 'no-store');
        assert.equal(capturedRequest, null, 'missing preview rate limiting must not reach upstream services');

    };

    const verifyMcpTransportAndToolCalls = async (): Promise<void> => {
        // MCP must be a real read-only Streamable HTTP endpoint, not the SPA asset fallback.
        capturedRequest = null;
        const mcpInitialize = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: {
                protocolVersion: '2025-03-26',
                capabilities: {},
                clientInfo: { name: 'Claude', version: 'test' },
              },
            }),
          }),
          env,
        );
        assert.equal(mcpInitialize.status, 200, 'MCP initialize must be handled by the Worker');
        assert.match(mcpInitialize.headers.get('content-type') ?? '', /^application\/json/i);
        const mcpInitializeBody = await mcpInitialize.json() as {
          jsonrpc: string;
          id: number;
          result: { protocolVersion: string; capabilities: { tools?: unknown }; serverInfo: { name: string } };
        };
        assert.equal(mcpInitializeBody.jsonrpc, '2.0');
        assert.equal(mcpInitializeBody.id, 1);
        assert.equal(mcpInitializeBody.result.protocolVersion, '2025-03-26');
        assert.ok(mcpInitializeBody.result.capabilities.tools);
        assert.equal(mcpInitializeBody.result.serverInfo.name, 'GLORIFIER GitHub Read-Only');

        const mcpInitializedNotification = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
          }),
          env,
        );
        assert.equal(mcpInitializedNotification.status, 202, 'MCP initialization notification must not return a JSON-RPC result');

        const mcpToolsList = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
          }),
          env,
        );
        assert.equal(mcpToolsList.status, 200);
        const mcpToolsBody = await mcpToolsList.json() as {
          result: { tools: Array<{ name: string; annotations: { readOnlyHint?: boolean; destructiveHint?: boolean } }> };
        };
        assert.deepEqual(
          mcpToolsBody.result.tools.map((tool) => tool.name).sort(),
          ['github_get_repository', 'github_list_open_pull_requests', 'github_list_workflow_runs', 'github_read_file'].sort(),
          'MCP must expose the complete, fixed read-only GitHub tool surface',
        );
        assert.ok(mcpToolsBody.result.tools.length >= 3);
        assert.ok(mcpToolsBody.result.tools.every((tool) => tool.annotations.readOnlyHint === true));
        assert.ok(mcpToolsBody.result.tools.every((tool) => tool.annotations.destructiveHint === false));
        assert.ok(mcpToolsBody.result.tools.every((tool) => !/(write|create|update|delete|merge|push)/i.test(tool.name)));

        const modernMcpHeaders = {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'MCP-Protocol-Version': '2026-07-28',
        };
        const modernMetadata = {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        };
        const modernHeaderWithoutMetadata = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'Mcp-Method': 'server/discover' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'header-without-metadata',
              method: 'server/discover',
              params: {},
            }),
          }),
          env,
        );
        const modernHeaderWithoutMetadataBody = await modernHeaderWithoutMetadata.json() as {
          error: { code: number; message: string };
        };
        assert.equal(modernHeaderWithoutMetadata.status, 400);
        assert.equal(modernHeaderWithoutMetadataBody.error.code, -32020,
          'a modern HTTP request must carry the protocol version in per-request metadata as well as the header');
        assert.match(modernHeaderWithoutMetadataBody.error.message, /both .*_meta.*MCP-Protocol-Version/i);

        const modernMetadataWithoutHeader = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'Mcp-Method': 'server/discover' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'metadata-without-header',
              method: 'server/discover',
              params: { _meta: modernMetadata },
            }),
          }),
          env,
        );
        const modernMetadataWithoutHeaderBody = await modernMetadataWithoutHeader.json() as {
          error: { code: number; message: string };
        };
        assert.equal(modernMetadataWithoutHeader.status, 400);
        assert.equal(modernMetadataWithoutHeaderBody.error.code, -32020);
        assert.match(modernMetadataWithoutHeaderBody.error.message, /both .*_meta.*MCP-Protocol-Version/i);

        const mismatchedModernProtocolVersions = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'MCP-Protocol-Version': '2025-11-25', 'Mcp-Method': 'server/discover' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'mismatched-metadata-header',
              method: 'server/discover',
              params: { _meta: modernMetadata },
            }),
          }),
          env,
        );
        const mismatchedModernProtocolVersionsBody = await mismatchedModernProtocolVersions.json() as {
          error: { code: number; message: string; data?: { requested?: string } };
        };
        assert.equal(mismatchedModernProtocolVersions.status, 400);
        assert.equal(mismatchedModernProtocolVersionsBody.error.code, -32020);
        assert.match(mismatchedModernProtocolVersionsBody.error.message, /must match/i);

        const modernDiscover = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'Mcp-Method': 'server/discover' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'discover-1',
              method: 'server/discover',
              params: {
                _meta: {
                  ...modernMetadata,
                  'io.modelcontextprotocol/clientInfo': { name: 'GLORIFIER-test-client', version: '1.0.0' },
                  'io.modelcontextprotocol/clientCapabilities': {},
                },
              },
            }),
          }),
          env,
        );
        assert.equal(modernDiscover.status, 200,
          'MCP 2026-07-28 server discovery must be available without a legacy initialize handshake');
        const modernDiscoverBody = await modernDiscover.json() as {
          jsonrpc: string;
          id: string;
          result: {
            resultType: string;
            supportedVersions: string[];
            capabilities: { tools?: Record<string, unknown>; resources?: unknown; prompts?: unknown };
            _meta: Record<string, { name: string; version: string }>;
            ttlMs: number;
            cacheScope: string;
          };
        };
        assert.equal(modernDiscoverBody.jsonrpc, '2.0');
        assert.equal(modernDiscoverBody.id, 'discover-1');
        assert.equal(modernDiscoverBody.result.resultType, 'complete');
        assert.deepEqual(modernDiscoverBody.result.supportedVersions, ['2026-07-28']);
        assert.deepEqual(modernDiscoverBody.result.capabilities, { tools: {} },
          'modern discovery must advertise only the read-only tool capability actually implemented');
        assert.deepEqual(
          modernDiscoverBody.result._meta['io.modelcontextprotocol/serverInfo'],
          { name: 'GLORIFIER GitHub Read-Only', version: '1.1.0' },
        );
        assert.equal(modernDiscoverBody.result.ttlMs, 3_600_000);
        assert.equal(modernDiscoverBody.result.cacheScope, 'public');

        const missingModernClientCapabilities = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'Mcp-Method': 'server/discover' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'missing-client-capabilities',
              method: 'server/discover',
              params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } },
            }),
          }),
          env,
        );
        const missingModernClientCapabilitiesBody = await missingModernClientCapabilities.json() as {
          error: { code: number };
        };
        assert.equal(missingModernClientCapabilities.status, 400);
        assert.equal(missingModernClientCapabilitiesBody.error.code, -32602,
          'modern requests require clientCapabilities even when the object is empty');

        const mismatchedMcpMethod = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'Mcp-Method': 'resources/list' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'mismatched-mcp-method',
              method: 'tools/list',
              params: { _meta: modernMetadata },
            }),
          }),
          env,
        );
        const mismatchedMcpMethodBody = await mismatchedMcpMethod.json() as { error: { code: number } };
        assert.equal(mismatchedMcpMethod.status, 400);
        assert.equal(mismatchedMcpMethodBody.error.code, -32020);

        const missingMcpName = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'Mcp-Method': 'tools/call' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'missing-mcp-name',
              method: 'tools/call',
              params: { _meta: modernMetadata, name: 'github_get_repository', arguments: {} },
            }),
          }),
          env,
        );
        const missingMcpNameBody = await missingMcpName.json() as { error: { code: number } };
        assert.equal(missingMcpName.status, 400);
        assert.equal(missingMcpNameBody.error.code, -32020);

        const encodedMcpName = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'Mcp-Method': 'tools/call', 'Mcp-Name': '=?base64?5bel5YW3?=' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'encoded-mcp-name',
              method: 'tools/call',
              params: { _meta: modernMetadata, name: '工具', arguments: {} },
            }),
          }),
          env,
        );
        const encodedMcpNameBody = await encodedMcpName.json() as {
          result: { isError?: boolean; content: Array<{ text: string }> };
        };
        assert.equal(encodedMcpName.status, 200);
        assert.equal(encodedMcpNameBody.result.isError, true,
          'a valid base64-sentinel MCP name must pass header/body validation before normal tool lookup');

        const modernToolsList = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'Mcp-Method': 'tools/list' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'modern-list',
              method: 'tools/list',
              params: { _meta: modernMetadata },
            }),
          }),
          env,
        );
        const modernToolsBody = await modernToolsList.json() as {
          result: {
            resultType: string;
            tools: Array<{ name: string; annotations: { readOnlyHint?: boolean; destructiveHint?: boolean } }>;
            _meta: Record<string, { name: string; version: string }>;
          };
        };
        assert.equal(modernToolsList.status, 200);
        assert.equal(modernToolsBody.result.resultType, 'complete');
        assert.deepEqual(
          modernToolsBody.result.tools.map((tool) => tool.name).sort(),
          ['github_get_repository', 'github_list_open_pull_requests', 'github_list_workflow_runs', 'github_read_file'].sort(),
        );
        assert.ok(modernToolsBody.result.tools.every((tool) =>
          tool.annotations.readOnlyHint === true && tool.annotations.destructiveHint === false));
        assert.deepEqual(
          modernToolsBody.result._meta['io.modelcontextprotocol/serverInfo'],
          { name: 'GLORIFIER GitHub Read-Only', version: '1.1.0' },
        );

        const previousModernMcpUpstreamResponse = upstreamResponse;
        upstreamResponse = new Response(JSON.stringify({
          full_name: 'GLORIFIER7/GLORIFIER',
          visibility: 'public',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        const modernToolCall = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'Mcp-Method': 'tools/call', 'Mcp-Name': 'github_get_repository' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'modern-tool-call',
              method: 'tools/call',
              params: {
                _meta: modernMetadata,
                name: 'github_get_repository',
                arguments: {},
              },
            }),
          }),
          env,
        );
        const modernToolCallBody = await modernToolCall.json() as {
          result: {
            resultType: string;
            content: Array<{ type: string; text: string }>;
            isError?: boolean;
            _meta: Record<string, { name: string; version: string }>;
          };
        };
        assert.equal(modernToolCall.status, 200);
        assert.equal(modernToolCallBody.result.resultType, 'complete');
        assert.equal(modernToolCallBody.result.isError, undefined);
        assert.equal(JSON.parse(modernToolCallBody.result.content[0]?.text || '{}').full_name, 'GLORIFIER7/GLORIFIER');
        assert.deepEqual(
          modernToolCallBody.result._meta['io.modelcontextprotocol/serverInfo'],
          { name: 'GLORIFIER GitHub Read-Only', version: '1.1.0' },
        );
        assert.equal(new URL(getCapturedRequest().url).origin, 'https://api.github.com');
        assert.equal(getCapturedRequest().method, 'GET');
        assert.equal(getCapturedRequest().headers.get('authorization'), null);
        upstreamResponse = previousModernMcpUpstreamResponse;
        mcpRateLimitKeys.length = 0;

        const unsupportedModernVersion = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'MCP-Protocol-Version': '2026-01-01', 'Mcp-Method': 'server/discover' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'unsupported-version',
              method: 'server/discover',
              params: { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-01-01' } },
            }),
          }),
          env,
        );
        const unsupportedModernBody = await unsupportedModernVersion.json() as {
          error: { code: number; data: { supported: string[]; requested: string } };
        };
        assert.equal(unsupportedModernVersion.status, 400);
        assert.equal(unsupportedModernBody.error.code, -32022);
        assert.deepEqual(unsupportedModernBody.error.data.supported, ['2026-07-28']);
        assert.equal(unsupportedModernBody.error.data.requested, '2026-01-01');

        const modernUnknownMethod = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'Mcp-Method': 'resources/list' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'modern-unknown-method',
              method: 'resources/list',
              params: { _meta: modernMetadata },
            }),
          }),
          env,
        );
        const modernUnknownMethodBody = await modernUnknownMethod.json() as { error: { code: number } };
        assert.equal(modernUnknownMethod.status, 404);
        assert.equal(modernUnknownMethodBody.error.code, -32601,
          'modern Streamable HTTP method-not-found errors must use 404');

        const modernInitializeRejected = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'Mcp-Method': 'initialize' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'no-initialize',
              method: 'initialize',
              params: { _meta: modernMetadata },
            }),
          }),
          env,
        );
        const modernInitializeBody = await modernInitializeRejected.json() as {
          error: { code: number };
        };
        assert.equal(modernInitializeRejected.status, 404);
        assert.equal(modernInitializeBody.error.code, -32601,
          'modern stateless MCP clients must not be forced through legacy initialize');

        const modernPingRejected = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { ...modernMcpHeaders, 'Mcp-Method': 'ping' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'no-ping',
              method: 'ping',
              params: { _meta: modernMetadata },
            }),
          }),
          env,
        );
        const modernPingBody = await modernPingRejected.json() as { error: { code: number } };
        assert.equal(modernPingRejected.status, 404);
        assert.equal(modernPingBody.error.code, -32601, 'modern MCP must not advertise legacy ping');

        const unsupportedMcpMethod = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 90, method: 'resources/list' }),
          }),
          env,
        );
        assert.equal(unsupportedMcpMethod.status, 200, 'unsupported MCP methods must remain JSON-RPC errors, not transport failures');
        const unsupportedMcpBody = await unsupportedMcpMethod.json() as {
          jsonrpc: string;
          id: number;
          error: { code: number };
        };
        assert.equal(unsupportedMcpBody.jsonrpc, '2.0');
        assert.equal(unsupportedMcpBody.id, 90);
        assert.equal(unsupportedMcpBody.error.code, -32601);

        const previousMcpUpstreamResponse = upstreamResponse;
        upstreamResponse = new Response(JSON.stringify({ full_name: 'GLORIFIER7/GLORIFIER', visibility: 'public' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        const mcpGetRepository = await worker.fetch(
          mcpPost({
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'github_get_repository', arguments: {} },
          }, '203.0.113.42'),
          env,
        );
        assert.equal(mcpGetRepository.status, 200);
        const mcpGetRepositoryBody = await mcpGetRepository.json() as {
          result: { content: Array<{ type: string; text: string }>; isError?: boolean };
        };
        assert.equal(Object.prototype.hasOwnProperty.call(mcpGetRepositoryBody.result, 'isError'), false);
        assert.equal(JSON.parse(mcpGetRepositoryBody.result.content[0]?.text || '{}').full_name, 'GLORIFIER7/GLORIFIER');
        assert.equal(new URL(getCapturedRequest().url).origin, 'https://api.github.com');
        assert.equal(getCapturedRequest().method, 'GET');
        assert.equal(getCapturedRequest().headers.get('authorization'), null, 'public read-only GitHub access must not forward credentials');
        assert.deepEqual(mcpRateLimitKeys, ['203.0.113.42'], 'MCP upstream tool calls must be rate-limited per connecting client');
        upstreamResponse = previousMcpUpstreamResponse;

        capturedRequest = null;
        mcpRateLimitAllowed = false;
        const rateLimitedMcpToolCall = await worker.fetch(
          mcpPost({
            jsonrpc: '2.0',
            id: 7,
            method: 'tools/call',
            params: { name: 'github_get_repository', arguments: {} },
          }, '203.0.113.42'),
          env,
        );
        assert.equal(rateLimitedMcpToolCall.status, 429, 'MCP must stop tool calls when the Cloudflare rate limit is exhausted');
        assert.equal(rateLimitedMcpToolCall.headers.get('retry-after'), '60');
        assert.equal(capturedRequest, null, 'rate-limited MCP calls must not reach GitHub');
        mcpRateLimitAllowed = true;

        for (const inheritedToolName of ['constructor', 'toString', 'github_delete_repository']) {
          capturedRequest = null;
          const inheritedToolCall = await worker.fetch(
            mcpPost({
              jsonrpc: '2.0',
              id: 8,
              method: 'tools/call',
              params: { name: inheritedToolName, arguments: {} },
            }, '203.0.113.42'),
            env,
          );
          assert.equal(inheritedToolCall.status, 200);
          const inheritedToolBody = await inheritedToolCall.json() as {
            result: { isError?: boolean; content: Array<{ text: string }> };
          };
          assert.equal(inheritedToolBody.result.isError, true, 'prototype properties must not be callable as MCP tools');
          assert.match(inheritedToolBody.result.content[0]?.text || '', /Unknown or unsupported GitHub tool/);
          assert.equal(capturedRequest, null, 'prototype-property tool names must not reach GitHub');
        }

    };

    const verifyMcpMethodAndMediaValidation = async (): Promise<void> => {
        const mcpGetMethodNotAllowed = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp'),
          env,
        );
        assert.equal(mcpGetMethodNotAllowed.status, 405, 'MCP must reject non-POST requests');
        assert.equal(mcpGetMethodNotAllowed.headers.get('allow'), 'POST', 'MCP must advertise its supported method');

        const mcpWrongContentType = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: '{}',
          }),
          env,
        );
        assert.equal(mcpWrongContentType.status, 415, 'MCP must reject non-JSON content types');

        capturedRequest = null;
        const malformedMcpJson = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{invalid-json',
          }),
          env,
        );
        assert.equal(malformedMcpJson.status, 400, 'MCP must reject malformed JSON');
        assert.equal(capturedRequest, null, 'malformed MCP requests must not contact GitHub');

        const invalidMcpContentLength = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': 'invalid' },
            body: '{}',
          }),
          env,
        );
        assert.equal(invalidMcpContentLength.status, 400, 'MCP must reject invalid Content-Length headers');
        assert.equal(capturedRequest, null, 'invalid Content-Length requests must not contact GitHub');

    };

    const verifyMcpBodyLimitsAndCancellation = async (): Promise<void> => {
        let oversizedMcpRequestCancelled = false;
        const mcpOversizedRequest = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new Uint8Array(66_000));
                setTimeout(() => {
                  if (!oversizedMcpRequestCancelled) controller.close();
                }, 25);
              },
              cancel() {
                oversizedMcpRequestCancelled = true;
              },
            }),
            duplex: 'half',
          } as RequestInit),
          env,
        );
        assert.equal(mcpOversizedRequest.status, 413, 'MCP must reject request bodies above its byte limit');
        assert.equal(oversizedMcpRequestCancelled, true, 'MCP must cancel request streams as soon as the byte limit is exceeded');

        const previousOversizedMcpResponse = upstreamResponse;
        let oversizedUpstreamCancellationObserved = false;
        let oversizedUpstreamBodyCancelled = false;
        upstreamResponse = new Response(new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(1_000_001));
            setTimeout(() => {
              if (!oversizedUpstreamBodyCancelled) controller.close();
            }, 25);
          },
          cancel() {
            oversizedUpstreamBodyCancelled = true;
            oversizedUpstreamCancellationObserved = true;
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        const oversizedUpstreamCall = await worker.fetch(
          mcpPost({
            jsonrpc: '2.0',
            id: 6,
            method: 'tools/call',
            params: { name: 'github_get_repository', arguments: {} },
          }),
          env,
        );
        assert.equal(oversizedUpstreamCall.status, 200);
        const oversizedUpstreamBody = await oversizedUpstreamCall.json() as {
          result: { content: Array<{ text: string }>; isError?: boolean };
        };
        assert.equal(oversizedUpstreamBody.result.isError, true);
        assert.match(oversizedUpstreamBody.result.content[0]?.text || '', /response exceeded the configured size limit/i);
        assert.equal(oversizedUpstreamCancellationObserved, true, 'oversized upstream responses must be cancelled as soon as the byte limit is exceeded');
        upstreamResponse = previousOversizedMcpResponse;

        const previousInvalidContentLengthResponse = upstreamResponse;
        upstreamResponse = new Response(JSON.stringify({ full_name: 'GLORIFIER7/GLORIFIER' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Content-Length': 'not-a-number' },
        });
        const invalidUpstreamContentLengthCall = await worker.fetch(
          mcpPost({
            jsonrpc: '2.0',
            id: 12,
            method: 'tools/call',
            params: { name: 'github_get_repository', arguments: {} },
          }),
          env,
        );
        const invalidUpstreamContentLengthBody = await invalidUpstreamContentLengthCall.json() as {
          result: { isError?: boolean; content: Array<{ text: string }> };
        };
        assert.equal(invalidUpstreamContentLengthBody.result.isError, true);
        assert.match(invalidUpstreamContentLengthBody.result.content[0]?.text || '', /response exceeded the configured size limit/i);
        upstreamResponse = previousInvalidContentLengthResponse;

    };

    const verifyMcpGithubFileResults = async (): Promise<void> => {
        const previousValidGithubFileResponse = upstreamResponse;
        upstreamResponse = new Response(JSON.stringify({ content: 'b2s=', encoding: 'base64' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        capturedRequest = null;
        const validGithubFileCall = await worker.fetch(
          mcpPost({
            jsonrpc: '2.0',
            id: 13,
            method: 'tools/call',
            params: { name: 'github_read_file', arguments: { path: 'docs/architecture/README.md' } },
          }),
          env,
        );
        const validGithubFileBody = await validGithubFileCall.json() as {
          result: { content: Array<{ text: string }>; isError?: boolean };
        };
        const validGithubFileResult = JSON.parse(validGithubFileBody.result.content[0]?.text || '{}') as {
          path: string;
          ref: string;
          content: string;
        };
        assert.equal(Object.prototype.hasOwnProperty.call(validGithubFileBody.result, 'isError'), false);
        assert.equal(validGithubFileResult.path, 'docs/architecture/README.md');
        assert.equal(validGithubFileResult.ref, 'main');
        assert.equal(validGithubFileResult.content, 'ok');
        const githubFileRequestUrl = new URL(getCapturedRequest().url);
        assert.equal(githubFileRequestUrl.origin, 'https://api.github.com');
        assert.equal(githubFileRequestUrl.pathname, '/repos/GLORIFIER7/GLORIFIER/contents/docs/architecture/README.md');
        assert.equal(githubFileRequestUrl.searchParams.get('ref'), 'main');
        assert.equal(getCapturedRequest().headers.get('authorization'), null,
          'public MCP requests must remain anonymous when no explicit read token is configured');

        const tokenEnabledEnv = { ...env, GITHUB_MCP_READ_TOKEN: 'unit-test-token' } as TestEnv;
        const tokenBackedToolCases: Array<{
          name: string;
          arguments: Record<string, unknown>;
          pathname: string;
          body: unknown;
        }> = [
          {
            name: 'github_get_repository',
            arguments: { host: 'attacker.example', url: 'https://attacker.example/api' },
            pathname: '/repos/GLORIFIER7/GLORIFIER',
            body: { full_name: 'GLORIFIER7/GLORIFIER' },
          },
          {
            name: 'github_list_open_pull_requests',
            arguments: { state: 'open', per_page: 1, host: 'attacker.example', url: 'https://attacker.example/api' },
            pathname: '/repos/GLORIFIER7/GLORIFIER/pulls',
            body: [],
          },
          {
            name: 'github_list_workflow_runs',
            arguments: { per_page: 1, host: 'attacker.example', url: 'https://attacker.example/api' },
            pathname: '/repos/GLORIFIER7/GLORIFIER/actions/runs',
            body: { workflow_runs: [] },
          },
          {
            name: 'github_read_file',
            arguments: { path: 'README.md', ref: 'main', host: 'attacker.example', url: 'https://attacker.example/api' },
            pathname: '/repos/GLORIFIER7/GLORIFIER/contents/README.md',
            body: { content: 'b2s=', encoding: 'base64' },
          },
        ];

        for (const [index, toolCase] of tokenBackedToolCases.entries()) {
          upstreamResponse = new Response(JSON.stringify(toolCase.body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
          capturedRequest = null;
          const tokenBackedToolCall = await worker.fetch(
            mcpPost({
              jsonrpc: '2.0',
              id: `github-read-with-token-${index}`,
              method: 'tools/call',
              params: { name: toolCase.name, arguments: toolCase.arguments },
            }),
            tokenEnabledEnv,
          );
          const tokenBackedToolCallText = await tokenBackedToolCall.text();
          assert.equal(tokenBackedToolCall.status, 200, `${toolCase.name} must accept the configured read-only token`);
          const tokenRequestUrl = new URL(getCapturedRequest().url);
          assert.equal(tokenRequestUrl.origin, 'https://api.github.com',
            `${toolCase.name} must not allow tool arguments to redirect the upstream host`);
          assert.equal(tokenRequestUrl.pathname, toolCase.pathname);
          assert.equal(getCapturedRequest().headers.get('authorization'), 'Bearer unit-test-token',
            `${toolCase.name} must forward the token to the fixed GitHub API origin`);
          assert.equal(getCapturedRequest().method, 'GET');
          assert.ok(!tokenBackedToolCallText.includes('unit-test-token'),
            'the configured GitHub read token must never be included in an MCP response');
        }

        upstreamResponse = previousValidGithubFileResponse;

        capturedRequest = null;
        const rejectedGitReference = await worker.fetch(
          mcpPost({
            jsonrpc: '2.0',
            id: 14,
            method: 'tools/call',
            params: { name: 'github_read_file', arguments: { path: 'README.md', ref: '../main' } },
          }),
          env,
        );
        const rejectedGitReferenceBody = await rejectedGitReference.json() as {
          result: { isError?: boolean; content: Array<{ text: string }> };
        };
        assert.equal(rejectedGitReferenceBody.result.isError, true);
        assert.match(rejectedGitReferenceBody.result.content[0]?.text || '', /Invalid Git reference/);
        assert.equal(capturedRequest, null, 'invalid Git references must not reach GitHub');

        for (const invalidGitReference of ['main..evil', 'refs/heads/....']) {
          capturedRequest = null;
          const invalidGitReferenceResponse = await worker.fetch(
            mcpPost({
              jsonrpc: '2.0',
              id: 17,
              method: 'tools/call',
              params: { name: 'github_read_file', arguments: { path: 'README.md', ref: invalidGitReference } },
            }),
            env,
          );
          const invalidGitReferenceBody = await invalidGitReferenceResponse.json() as {
            result: { isError?: boolean; content: Array<{ text: string }> };
          };
          assert.equal(invalidGitReferenceBody.result.isError, true);
          assert.match(invalidGitReferenceBody.result.content[0]?.text || '', /Invalid Git reference/);
          assert.equal(capturedRequest, null, 'invalid Git references must not reach GitHub');
        }

        const previousWorkflowRunsResponse = upstreamResponse;
        upstreamResponse = new Response(JSON.stringify({ workflow_runs: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        capturedRequest = null;
        const paginatedWorkflowRuns = await worker.fetch(
          mcpPost({
            jsonrpc: '2.0',
            id: 15,
            method: 'tools/call',
            params: { name: 'github_list_workflow_runs', arguments: { per_page: 6 } },
          }),
          env,
        );
        const paginatedWorkflowRunsBody = await paginatedWorkflowRuns.json() as {
          result: { isError?: boolean; content: Array<{ text: string }> };
        };
        assert.equal(paginatedWorkflowRunsBody.result.isError, undefined);
        assert.equal(new URL(getCapturedRequest().url).searchParams.get('per_page'), '6');

        for (const invalidPerPage of [{}, '6', 0, 21, 1.5]) {
          capturedRequest = null;
          const invalidPagination = await worker.fetch(
            mcpPost({
              jsonrpc: '2.0',
              id: 16,
              method: 'tools/call',
              params: { name: 'github_list_workflow_runs', arguments: { per_page: invalidPerPage } },
            }),
            env,
          );
          const invalidPaginationBody = await invalidPagination.json() as {
            result: { isError?: boolean; content: Array<{ text: string }> };
          };
          assert.equal(invalidPaginationBody.result.isError, true);
          assert.match(invalidPaginationBody.result.content[0]?.text || '', /per_page must be an integer/);
          assert.equal(capturedRequest, null, 'invalid per_page values must not reach GitHub');
        }
        upstreamResponse = previousWorkflowRunsResponse;

        const previousMalformedGithubResponse = upstreamResponse;
        upstreamResponse = new Response('not-json', { status: 200, headers: { 'Content-Type': 'application/json' } });
        const malformedGithubJsonCall = await worker.fetch(
          mcpPost({
            jsonrpc: '2.0',
            id: 9,
            method: 'tools/call',
            params: { name: 'github_get_repository', arguments: {} },
          }),
          env,
        );
        const malformedGithubJsonBody = await malformedGithubJsonCall.json() as {
          result: { isError?: boolean; content: Array<{ text: string }> };
        };
        assert.equal(malformedGithubJsonBody.result.isError, true);
        assert.match(malformedGithubJsonBody.result.content[0]?.text || '', /invalid JSON/i);
        upstreamResponse = new Response(JSON.stringify({ content: '?', encoding: 'base64' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        const invalidGithubFileEncoding = await worker.fetch(
          mcpPost({
            jsonrpc: '2.0',
            id: 10,
            method: 'tools/call',
            params: { name: 'github_read_file', arguments: { path: 'README.md' } },
          }),
          env,
        );
        const invalidGithubFileBody = await invalidGithubFileEncoding.json() as {
          result: { isError?: boolean; content: Array<{ text: string }> };
        };
        assert.equal(invalidGithubFileBody.result.isError, true);
        assert.match(invalidGithubFileBody.result.content[0]?.text || '', /not valid Base64/i);
        upstreamResponse = new Response(JSON.stringify({ message: 'forbidden' }), { status: 403 });
        const failedGithubRequest = await worker.fetch(
          mcpPost({
            jsonrpc: '2.0',
            id: 11,
            method: 'tools/call',
            params: { name: 'github_get_repository', arguments: {} },
          }),
          env,
        );
        const failedGithubRequestBody = await failedGithubRequest.json() as {
          result: { isError?: boolean; content: Array<{ text: string }> };
        };
        assert.equal(failedGithubRequestBody.result.isError, true);
        assert.match(failedGithubRequestBody.result.content[0]?.text || '', /HTTP 403/i);
        upstreamResponse = previousMalformedGithubResponse;

        capturedRequest = null;
        const rejectedMcpOrigin = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/mcp', {
            method: 'POST',
            headers: { Origin: 'https://untrusted.example', 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/list' }),
          }),
          env,
        );
        assert.equal(rejectedMcpOrigin.status, 403, 'MCP must reject untrusted Origin values');
        assert.equal(capturedRequest, null, 'an untrusted MCP Origin must never reach GitHub');

        capturedRequest = null;

    };

    const verifyA2AProtocol = async (): Promise<void> => {
        capturedRequest = null;
        const a2aCardResponse = await worker.fetch(
          new Request(`https://glorifier.glorifier.workers.dev${A2A_AGENT_CARD_PATH}`),
          env,
        );
        assert.equal(a2aCardResponse.status, 200);
        assert.equal(a2aCardResponse.headers.get('cache-control'), 'no-store');
        assert.match(a2aCardResponse.headers.get('content-type') ?? '', /^application\/json/i);
        const a2aCard = await a2aCardResponse.json() as {
          name: string;
          supportedInterfaces: Array<{ url: string; protocolBinding: string; protocolVersion: string }>;
          capabilities: { streaming: boolean; pushNotifications: boolean; extendedAgentCard: boolean };
          securitySchemes: { bearer: { httpAuthSecurityScheme: { scheme: string; bearerFormat?: string } } };
        };
        assert.equal(a2aCard.name, 'GLORIFIER Services');
        assert.deepEqual(a2aCard.supportedInterfaces, [{
          url: `https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`,
          protocolBinding: 'JSONRPC',
          protocolVersion: '1.0',
        }]);
        assert.equal(a2aCard.capabilities.streaming, false);
        assert.equal(a2aCard.capabilities.pushNotifications, false);
        assert.equal(a2aCard.capabilities.extendedAgentCard, false);
        assert.equal(a2aCard.securitySchemes.bearer.httpAuthSecurityScheme.scheme, 'Bearer');
        assert.equal(a2aCard.securitySchemes.bearer.httpAuthSecurityScheme.bearerFormat, undefined,
          'Agent Card must not claim an unverified JWT bearer format');
        assert.equal(capturedRequest, null, 'Agent Card discovery must be served by the Worker without an upstream backend');

        const a2aCardHead = await worker.fetch(
          new Request(`https://glorifier.glorifier.workers.dev${A2A_AGENT_CARD_PATH}`, { method: 'HEAD' }),
          env,
        );
        assert.equal(a2aCardHead.status, 200);
        assert.equal(await a2aCardHead.text(), '');

        const a2aCardPost = await worker.fetch(
          new Request(`https://glorifier.glorifier.workers.dev${A2A_AGENT_CARD_PATH}`, { method: 'POST' }),
          env,
        );
        assert.equal(a2aCardPost.status, 405);
        assert.equal(a2aCardPost.headers.get('allow'), 'GET, HEAD');
        assert.equal(capturedRequest, null);

        const a2aMethodNotAllowed = await worker.fetch(
          new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, { method: 'GET' }),
          env,
        );
        assert.equal(a2aMethodNotAllowed.status, 405);
        assert.equal(a2aMethodNotAllowed.headers.get('allow'), 'POST');
        assert.equal(capturedRequest, null);

        const a2aTrailingSlashMissingAuth = await worker.fetch(
          new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'slash-auth', method: 'GetTask', params: { id: 'x' } }),
          }),
          env,
        );
        assert.equal(a2aTrailingSlashMissingAuth.status, 401, 'trailing slash must not bypass A2A authentication');
        assert.equal(capturedRequest, null, 'trailing-slash unauthenticated request must not reach backend');

        const a2aMissingAuth = await worker.fetch(
          new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'x', method: 'GetTask', params: { id: 'x' } }),
          }),
          env,
        );
        assert.equal(a2aMissingAuth.status, 401);
        assert.equal(a2aMissingAuth.headers.get('www-authenticate'), 'Bearer');
        assert.equal(capturedRequest, null, 'unauthenticated A2A requests must not reach the backend');

        for (const malformedAuthorization of ['Basic caller-token', 'Bearer', 'Bearer token extra', 'Bearer\ttoken']) {
          const rejectedAuthorization = await worker.fetch(
            new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
              method: 'POST',
              headers: {
                Authorization: malformedAuthorization,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ jsonrpc: '2.0', id: 'auth-invalid', method: 'GetTask', params: { id: 'x' } }),
            }),
            env,
          );
          assert.equal(rejectedAuthorization.status, 401, `malformed authorization must be rejected: ${malformedAuthorization}`);
          assert.equal(capturedRequest, null, 'malformed authorization must not reach the backend');
        }

        const a2aUnsupportedMediaType = await worker.fetch(
          new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
            method: 'POST',
            headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'text/plain' },
            body: '{}',
          }),
          env,
        );
        assert.equal(a2aUnsupportedMediaType.status, 415);
        assert.equal(capturedRequest, null);

        const a2aPreferredMediaType = await worker.fetch(
          new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
            method: 'POST',
            headers: {
              Authorization: 'Bearer caller-token',
              'Content-Type': 'application/a2a+json',
              'A2A-Version': '1.0',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'a2a-media', method: 'GetTask', params: { id: 'missing' } }),
          }),
          env,
        );
        assert.equal(a2aPreferredMediaType.status, 200,
          'A2A 1.0.1 preferred application/a2a+json must be accepted');
        const a2aPreferredRequest = getCapturedRequest();
        assert.equal(a2aPreferredRequest.headers.get('content-type'), 'application/a2a+json',
          'the preferred A2A JSON media type must reach the backend parser unchanged');
        assert.match(a2aPreferredRequest.headers.get('accept') ?? '', /application\/a2a\+json/);
        assert.equal(a2aPreferredRequest.headers.get('authorization'), 'Bearer caller-token');
        capturedRequest = null;

        const a2aOversized = await worker.fetch(
          new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
            method: 'POST',
            headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
            body: ' '.repeat(65_537),
          }),
          env,
        );
        assert.equal(a2aOversized.status, 413);
        assert.equal(capturedRequest, null, 'oversized A2A requests must not reach the backend');

        const a2aInvalidJson = await worker.fetch(
          new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
            method: 'POST',
            headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
            body: '{invalid',
          }),
          env,
        );
        assert.equal(a2aInvalidJson.status, 400);
        assert.equal(capturedRequest, null);

        capturedRequest = null;
        const a2aForwarded = await worker.fetch(
          new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}`, {
            method: 'POST',
            headers: {
              Authorization: 'bEaReR caller-token',
              'Content-Type': 'application/json',
              'A2A-Version': '1.0',
              Cookie: 'session=should-not-forward',
              'X-Private-Header': 'should-not-forward',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'send-1',
              method: 'SendMessage',
              params: { message: { messageId: 'm-1', role: 'ROLE_USER', parts: [{ text: 'Review this' }] } },
            }),
          }),
          env,
        );
        assert.equal(a2aForwarded.status, 200);
        const a2aUpstreamRequest = getCapturedRequest();
        assert.equal(new URL(a2aUpstreamRequest.url).origin, 'https://api.example.test');
        assert.equal(new URL(a2aUpstreamRequest.url).pathname, A2A_JSONRPC_PATH);

        capturedRequest = null;
        const a2aTrailingSlashForwarded = await worker.fetch(
          new Request(`https://glorifier.glorifier.workers.dev${A2A_JSONRPC_PATH}/`, {
            method: 'POST',
            headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json', 'A2A-Version': '1.0' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 'slash-send', method: 'SendMessage', params: { message: { messageId: 'slash-m', role: 'ROLE_USER', parts: [{ text: 'Slash route' }] } } }),
          }),
          env,
        );
        assert.equal(a2aTrailingSlashForwarded.status, 200);
        assert.equal(new URL(getCapturedRequest().url).pathname, A2A_JSONRPC_PATH, 'trailing-slash A2A calls must be canonicalized before backend forwarding');
        assert.equal(a2aUpstreamRequest.headers.get('authorization'), 'Bearer caller-token', 'mixed-case bearer schemes must be canonicalized before backend forwarding');
        assert.equal(a2aUpstreamRequest.headers.get('content-type'), 'application/json');
        assert.equal(a2aUpstreamRequest.headers.get('a2a-version'), '1.0', 'the negotiated A2A protocol version must cross the Worker boundary');
        assert.equal(a2aUpstreamRequest.headers.get('cookie'), null, 'A2A proxy must not forward caller cookies');
        assert.equal(a2aUpstreamRequest.headers.get('x-private-header'), null, 'A2A proxy must not forward unrelated headers');
        assert.match(await a2aUpstreamRequest.text(), /SendMessage/);

        capturedRequest = null;

    };

    const verifyWorkerIdentityAndNativeRoutes = async (): Promise<void> => {
        const healthAssetCallsBefore = assetCalls;
        const workerHealth = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/health'),
          env,
        );
        assert.equal(workerHealth.status, 200);
        assert.equal(workerHealth.headers.get('cache-control'), 'no-store, max-age=0');
        const workerHealthBody = await workerHealth.json() as {
          ok: boolean;
          status: string;
          layer: string;
          dependencies: { backend: string; authentication: string; databases: string };
        };
        assert.equal(workerHealthBody.ok, true);
        assert.equal(workerHealthBody.status, 'worker-ready');
        assert.equal(workerHealthBody.layer, 'cloudflare-worker');
        assert.equal(workerHealthBody.dependencies.backend, 'not-probed');
        assert.equal(workerHealthBody.dependencies.authentication, 'not-probed');
        assert.equal(workerHealthBody.dependencies.databases, 'not-probed');
        assert.equal(capturedRequest, null, 'Worker health must not call an upstream backend');
        assert.equal(assetCalls, healthAssetCallsBefore, 'Worker health must not fall through to static assets');

        const headHealth = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/health', { method: 'HEAD' }),
          env,
        );
        assert.equal(headHealth.status, 200);
        assert.equal(await headHealth.text(), '');

        const invalidHealthMethod = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/health', { method: 'POST' }),
          env,
        );
        assert.equal(invalidHealthMethod.status, 405);
        assert.equal(invalidHealthMethod.headers.get('allow'), 'GET, HEAD');
        assert.equal(capturedRequest, null, 'unsupported health methods must not fall through to an upstream backend');

        const buildInfoUnavailable = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/build-info'),
          env,
        );
        assert.equal(buildInfoUnavailable.status, 503);
        const unavailableBuildInfoBody = await buildInfoUnavailable.json() as {
          ok: boolean;
          status: string;
          code: string;
        };
        assert.equal(unavailableBuildInfoBody.ok, false);
        assert.equal(unavailableBuildInfoBody.status, 'source-provenance-unavailable');
        assert.equal(unavailableBuildInfoBody.code, 'RELEASE_PROVENANCE_NOT_CONFIGURED');

        const buildInfoResponse = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/build-info'),
          {
            ...env,
            GLORIFIER_RELEASE_COMMIT: 'a'.repeat(40),
            GLORIFIER_RELEASE_REF: 'refs/heads/main',
            GLORIFIER_RELEASE_RUN_ID: '41429999999',
            CF_VERSION_METADATA: {
              id: '1acafc15-ead8-431e-8813-d51ea11da51f',
              tag: 'main',
              timestamp: '2026-11-03T06:23:28.838Z',
            },
          },
        );
        assert.equal(buildInfoResponse.status, 200);
        const buildInfoBody = await buildInfoResponse.json() as {
          ok: boolean;
          status: string;
          repository: string;
          git: { commit: string; ref: string; runId: string };
          worker: { versionId: string; versionTag: string | null; versionTimestamp: string };
        };
        assert.equal(buildInfoBody.ok, true);
        assert.equal(buildInfoBody.status, 'source-provenance-verified');
        assert.equal(buildInfoBody.repository, 'https://github.com/GLORIFIER7/GLORIFIER');
        assert.equal(buildInfoBody.git.commit, 'a'.repeat(40));
        assert.equal(buildInfoBody.git.ref, 'refs/heads/main');
        assert.equal(buildInfoBody.git.runId, '41429999999');
        assert.equal(buildInfoBody.worker.versionId, '1acafc15-ead8-431e-8813-d51ea11da51f');
        assert.equal(buildInfoBody.worker.versionTag, 'main');
        assert.equal(buildInfoBody.worker.versionTimestamp, '2026-11-03T06:23:28.838Z');

        const validReleaseEnvironment: Partial<CloudflareEnv> = {
          GLORIFIER_RELEASE_COMMIT: 'a'.repeat(40),
          GLORIFIER_RELEASE_REF: 'refs/heads/main',
          GLORIFIER_RELEASE_RUN_ID: '41429999999',
          CF_VERSION_METADATA: {
            id: '1acafc15-ead8-431e-8813-d51ea11da51f',
            tag: 'main',
            timestamp: '2026-11-03T06:23:28.838Z',
          },
        };
        const invalidReleaseEnvironments: Partial<CloudflareEnv>[] = [
          { GLORIFIER_RELEASE_COMMIT: 'a'.repeat(39) + 'Ａ' },
          { GLORIFIER_RELEASE_RUN_ID: '４１４２９９９９９９９' },
          { GLORIFIER_RELEASE_RUN_ID: '1'.repeat(21) },
          {
            CF_VERSION_METADATA: {
              id: '１acafc15-ead8-431e-8813-d51ea11da51f',
              tag: 'main',
              timestamp: '2026-11-03T06:23:28.838Z',
            },
          },
        ];
        for (const invalidOverride of invalidReleaseEnvironments) {
          const invalidBuildInfo = await worker.fetch(
            new Request('https://glorifier.glorifier.workers.dev/api/build-info'),
            { ...env, ...validReleaseEnvironment, ...invalidOverride },
          );
          assert.equal(invalidBuildInfo.status, 503,
            'build provenance must reject non-ASCII identifiers and out-of-range run IDs');
        }

        const buildInfoHead = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/build-info', { method: 'HEAD' }),
          {
            ...env,
            GLORIFIER_RELEASE_COMMIT: 'a'.repeat(40),
            GLORIFIER_RELEASE_REF: 'refs/heads/main',
            GLORIFIER_RELEASE_RUN_ID: '41429999999',
            CF_VERSION_METADATA: {
              id: '1acafc15-ead8-431e-8813-d51ea11da51f',
              tag: 'main',
              timestamp: '2026-11-03T06:23:28.838Z',
            },
          },
        );
        assert.equal(buildInfoHead.status, 200);
        assert.equal(await buildInfoHead.text(), '');

        const buildInfoPost = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/build-info', { method: 'POST' }),
          env,
        );
        assert.equal(buildInfoPost.status, 405);
        assert.equal(buildInfoPost.headers.get('allow'), 'GET, HEAD');

        const assetCallsBeforeIdentity = assetCalls;
        const identityResponse = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/identity'),
          env,
        );
        assert.equal(identityResponse.status, 503);
        assert.equal(identityResponse.headers.get('cache-control'), 'no-store');
        const identityBody = await identityResponse.json() as { ok: boolean; identity: { organization: string; ready: boolean; domainStatus: string; nextAction: string } };
        assert.equal(identityBody.ok, false);
        assert.equal(identityBody.identity.organization, 'GLORIFIER');
        assert.equal(identityBody.identity.ready, false, 'identity must not be called ready without verified environment configuration');
        assert.equal(identityBody.identity.domainStatus, 'not-configured');
        assert.match(identityBody.identity.nextAction, /Set GLORIFIER_CANONICAL_DOMAIN/);
        assert.equal(capturedRequest, null, 'identity endpoint must not call an upstream backend');
        assert.equal(assetCalls, assetCallsBeforeIdentity, 'identity endpoint must not fall through to static assets');

        const configuredIdentityResponse = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/identity'),
          {
            ...env,
            GLORIFIER_CANONICAL_DOMAIN: 'Example.org',
            GLORIFIER_ORG_EMAIL: 'Owner@Example.org',
            GLORIFIER_DOMAIN_STATUS: 'verified',
            GLORIFIER_PUBLIC_URL: 'https://example.org',
          },
        );
        const configuredIdentity = await configuredIdentityResponse.json() as { identity: { ready: boolean; canonicalDomain: string; primaryEmail: string; domainOwnedOrVerified: boolean } };
        assert.equal(configuredIdentity.identity.ready, true);
        assert.equal(configuredIdentity.identity.canonicalDomain, 'example.org');
        assert.equal(configuredIdentity.identity.primaryEmail, 'owner@example.org');
        assert.equal(configuredIdentity.identity.domainOwnedOrVerified, true);
        assert.equal(capturedRequest, null, 'configured identity endpoint must remain Worker-native');

        const assetCallsBeforeBusinessModel = assetCalls;
        const businessModelResponse = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/business-model'),
          env,
        );
        assert.equal(businessModelResponse.status, 200);
        assert.equal(businessModelResponse.headers.get('cache-control'), 'no-store');
        const businessModelBody = await businessModelResponse.json() as {
          ok: boolean;
          model: { version: string; economicTruth: { verifiedRevenue: string }; governance: { autonomousFundMovement: boolean } };
        };
        assert.equal(businessModelBody.ok, true);
        assert.equal(businessModelBody.model.version, 'GBM-2.0');
        assert.equal(businessModelBody.model.economicTruth.verifiedRevenue, 'requires qualifying payment evidence');
        assert.equal(businessModelBody.model.governance.autonomousFundMovement, false);
        assert.equal(capturedRequest, null, 'business model endpoint must remain Worker-native');
        assert.equal(assetCalls, assetCallsBeforeBusinessModel, 'business model endpoint must not fall through to static assets');

        const workerNativeReadOnlyRoutes: Array<{
          path: string;
          verify: (payload: Record<string, unknown>) => void;
        }> = [
          {
            path: '/api/governance/architecture',
            verify: (body) => {
              assert.equal(body.ok, true);
              assert.equal(body.version, 'GLORIFIER-ARCH-3.1');
              const trustLayer = body.trustLayer as { databaseAuthority?: string } | undefined;
              assert.match(trustLayer?.databaseAuthority ?? '', /Neon.*target.*cutover.*not verified/i);
            },
          },
          {
            path: '/api/governance/policy',
            verify: (body) => {
              assert.equal(body.ok, true);
              const policy = body.policy as { version?: string; principles?: string[] } | undefined;
              assert.equal(policy?.version, 'GEAS-3.0');
              assert.ok(policy?.principles?.includes('human authority remains final'));
            },
          },
          {
            path: '/api/architecture/permanent-stack',
            verify: (body) => {
              assert.equal(body.ok, true);
              const stack = body.stack as { schemaVersion?: string } | undefined;
              const validation = body.validation as { valid?: boolean } | undefined;
              assert.equal(stack?.schemaVersion, 'GLORIFIER-STACK-1.0');
              assert.equal(validation?.valid, true);
            },
          },
          {
            path: '/api/governance/geas/reconciliation/manifest',
            verify: (body) => {
              assert.equal(body.ok, true);
              const manifest = body.manifest as { nodes?: Array<{ id?: string; name?: string }> } | undefined;
              const neonNode = manifest?.nodes?.find((node) => node.id === 'neon');
              assert.match(neonNode?.name ?? '', /canonical.*target.*cutover.*not verified/i);
              const validation = body.validation as { valid?: boolean } | undefined;
              assert.equal(validation?.valid, true);
            },
          },
          {
            path: '/api/governance/geas/reconciliation/degraded-modes',
            verify: (body) => {
              assert.equal(body.ok, true);
              assert.ok(Array.isArray(body.contracts));
              assert.ok((body.contracts as unknown[]).length > 0);
            },
          },
          {
            path: '/api/assets/verification/policy',
            verify: (body) => {
              assert.equal(body.ok, true);
              const policy = body.policy as { version?: string; humanAuthority?: boolean } | undefined;
              assert.equal(policy?.version, 'GAV-1.1');
              assert.equal(policy?.humanAuthority, true);
            },
          },
          {
            path: '/api/assets/verification/crypto/policy',
            verify: (body) => {
              assert.equal(body.ok, true);
              const policy = body.policy as { version?: string; noBypassOfProviderAuthorization?: boolean } | undefined;
              assert.equal(policy?.version, 'GCAV-1.0');
              assert.equal(policy?.noBypassOfProviderAuthorization, true);
            },
          },
          {
            path: '/api/business-intelligence/architecture',
            verify: (body) => {
              assert.equal(body.ok, true);
              const architecture = body.architecture as {
                version?: string;
                sourceOfTruth?: { revenue?: string };
              } | undefined;
              assert.equal(architecture?.version, 'GBIS-2.0');
              assert.match(architecture?.sourceOfTruth?.revenue ?? '', /Neon.*target.*cutover.*pending verification/i);
            },
          },
        ];

        for (const route of workerNativeReadOnlyRoutes) {
          capturedRequest = null;
          const assetsBeforeRoute: number = assetCalls;
          const response = await worker.fetch(
            new Request(`https://glorifier.glorifier.workers.dev${route.path}`),
            env,
          );
          assert.equal(response.status, 200, `${route.path} must be served natively by the Worker`);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          route.verify(await response.json() as Record<string, unknown>);
          assert.equal(capturedRequest, null, `${route.path} must not call the legacy backend`);
          assert.equal(assetCalls, assetsBeforeRoute, `${route.path} must not fall through to static assets`);
        }

    };

    const verifyGovernanceAndNativeRuntime = async (): Promise<void> => {
        const governanceHead = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/governance/policy', { method: 'HEAD' }),
          env,
        );
        assert.equal(governanceHead.status, 200);
        assert.equal(await governanceHead.text(), '');
        const rejectedGovernanceWrite = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/governance/policy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ policy: 'should-not-be-applied' }),
          }),
          env,
        );
        assert.equal(rejectedGovernanceWrite.status, 405);
        assert.equal(rejectedGovernanceWrite.headers.get('allow'), 'GET, HEAD');
        assert.equal(capturedRequest, null, 'read-only governance routes must reject writes without contacting the legacy backend');

        const nativeRuntimeWithoutSupabase = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
          { ...env, GLORIFIER_DATABASE_PROVIDER: 'supabase', GLORIFIER_BACKEND_ORIGIN: undefined, GLORIFIER_SUPABASE_URL: undefined, GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: undefined },
        );
        assert.equal(nativeRuntimeWithoutSupabase.status, 503);
        const nativeRuntimeWithoutSupabaseBody = await nativeRuntimeWithoutSupabase.json() as {
          checks?: { database?: { code?: string }; neural?: { ok: boolean | null; status: string; code?: string } };
        };
        assert.equal(nativeRuntimeWithoutSupabaseBody.checks?.database?.code, 'SUPABASE_NOT_CONFIGURED');
        assert.deepEqual(nativeRuntimeWithoutSupabaseBody.checks?.neural, {
          ok: false,
          status: 'not-configured',
          code: 'NEURAL_ORIGIN_NOT_CONFIGURED',
        });
        assert.equal(capturedRequest, null, 'native runtime verification must not proxy to a legacy backend');

    };

    const verifyDatabaseAndRuntimeContracts = async (): Promise<void> => {
        // Reject any Supabase destination that is not a canonical HTTPS project origin.
        const invalidSupabaseOrigins = [
          'http://project.supabase.co',
          'https://project.supabase.co:8443',
          'https://nested.project.supabase.co',
          'https://metadata.google.internal',
          'https://127.0.0.1',
          'https://project.supabase.co.attacker.test',
          'https://user:password@project.supabase.co',
          'https://project.supabase.co/rest/v1',
          'https://project.supabase.co?target=https://127.0.0.1',
        ];
        for (const invalidSupabaseOrigin of invalidSupabaseOrigins) {
          capturedRequest = null;
          requestedUrls.length = 0;
          const rejectedSupabaseOrigin = await worker.fetch(
            new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
            {
              ...env,
              GLORIFIER_DATABASE_PROVIDER: 'supabase',
              GLORIFIER_SUPABASE_URL: invalidSupabaseOrigin,
              GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
            },
          );
          assert.equal(rejectedSupabaseOrigin.status, 503, invalidSupabaseOrigin);
          const rejectedSupabaseBody = await rejectedSupabaseOrigin.json() as {
            checks?: { database?: { code?: string } };
          };
          assert.equal(rejectedSupabaseBody.checks?.database?.code, 'SUPABASE_NOT_CONFIGURED', invalidSupabaseOrigin);
          assert.equal(capturedRequest, null, `invalid Supabase origin must not be contacted: ${invalidSupabaseOrigin}`);
          assert.deepEqual(requestedUrls, [], `invalid Supabase origin must not generate any outbound request: ${invalidSupabaseOrigin}`);
        }

        // A failed Supabase probe must not erase the independent Neural configuration status.
        const previousUnhealthyRuntimeResponse = upstreamResponse;
        upstreamResponse = new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
        capturedRequest = null;
        const runtimeWithFailedSupabaseProbe = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
          {
            ...env,
            GLORIFIER_DATABASE_PROVIDER: 'supabase',
            GLORIFIER_SUPABASE_URL: 'https://project.supabase.co',
            GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
            GLORIFIER_NEURAL_ORIGIN: undefined,
            GLORIFIER_NEURAL_ALLOWED_HOSTS: undefined,
          },
        );
        assert.equal(runtimeWithFailedSupabaseProbe.status, 502);
        const runtimeWithFailedSupabaseProbeBody = await runtimeWithFailedSupabaseProbe.json() as {
          checks: { database?: { code?: string }; neural?: { ok: boolean | null; status: string; code?: string } };
        };
        assert.equal(runtimeWithFailedSupabaseProbeBody.checks.database?.code, 'SUPABASE_PROBE_FAILED');
        assert.deepEqual(runtimeWithFailedSupabaseProbeBody.checks.neural, {
          ok: false,
          status: 'not-configured',
          code: 'NEURAL_ORIGIN_NOT_CONFIGURED',
        });
        assert.equal(
          getCapturedRequest().url,
          'https://project.supabase.co/rest/v1/connection_registry?select=*&limit=0',
        );
        upstreamResponse = previousUnhealthyRuntimeResponse;

        // A successful database probe must still disclose an unconfigured Neural execution plane.
        const previousRuntimeResponse = upstreamResponse;
        upstreamResponse = new Response(null, {
          status: 200,
          headers: { 'content-range': '0-0/0' },
        });
        capturedRequest = null;
        const runtimeWithSupabaseButNoNeural = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
          {
            ...env,
            GLORIFIER_DATABASE_PROVIDER: 'supabase',
            GLORIFIER_SUPABASE_URL: 'https://project.supabase.co',
            GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
            GLORIFIER_NEURAL_ORIGIN: undefined,
            GLORIFIER_NEURAL_ALLOWED_HOSTS: undefined,
          },
        );
        assert.equal(runtimeWithSupabaseButNoNeural.status, 200);
        const runtimeWithSupabaseButNoNeuralBody = await runtimeWithSupabaseButNoNeural.json() as {
          checks: { neural?: { ok: boolean | null; status: string; code?: string } };
        };
        assert.deepEqual(runtimeWithSupabaseButNoNeuralBody.checks.neural, {
          ok: false,
          status: 'not-configured',
          code: 'NEURAL_ORIGIN_NOT_CONFIGURED',
        });
        assert.equal(
          getCapturedRequest().url,
          'https://project.supabase.co/rest/v1/connection_registry?select=*&limit=0',
          'runtime verification must perform only its existing Supabase read-only probe when Neural is not configured',
        );
        // Runtime configuration reporting must distinguish invalid, blocked, and merely configured states.
        const neuralConfigurationCases = [
          {
            name: 'invalid origin',
            env: { GLORIFIER_NEURAL_ORIGIN: 'http://neural.example.test', GLORIFIER_NEURAL_ALLOWED_HOSTS: 'neural.example.test' },
            expected: { ok: false, status: 'invalid-origin', code: 'NEURAL_ORIGIN_INVALID' },
          },
          {
            name: 'missing allowlist',
            env: { GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test', GLORIFIER_NEURAL_ALLOWED_HOSTS: undefined },
            expected: { ok: false, status: 'allowlist-not-configured', code: 'NEURAL_EGRESS_ALLOWLIST_NOT_CONFIGURED' },
          },
          {
            name: 'host not allowlisted',
            env: { GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test', GLORIFIER_NEURAL_ALLOWED_HOSTS: 'other.example.test' },
            expected: { ok: false, status: 'not-allowlisted', code: 'NEURAL_ORIGIN_NOT_ALLOWLISTED' },
          },
          {
            name: 'origin and allowlist configured',
            env: { GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test', GLORIFIER_NEURAL_ALLOWED_HOSTS: 'neural.example.test' },
            expected: { ok: null, status: 'configured-not-probed' },
          },
        ] as const;

        upstreamResponse = new Response(null, {
          status: 200,
          headers: { 'content-range': '0-0/0' },
        });
        for (const neuralCase of neuralConfigurationCases) {
          capturedRequest = null;
          requestedUrls.length = 0;
          const runtimeResponse = await worker.fetch(
            new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
            {
              ...env,
              ...neuralCase.env,
              GLORIFIER_DATABASE_PROVIDER: 'supabase',
              GLORIFIER_SUPABASE_URL: 'https://project.supabase.co',
              GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
            },
          );
          assert.equal(runtimeResponse.status, 200, neuralCase.name);
          const runtimeBody = await runtimeResponse.json() as {
            checks: { neural?: { ok: boolean | null; status: string; code?: string } };
          };
          assert.deepEqual(runtimeBody.checks.neural, neuralCase.expected, neuralCase.name);
          assert.deepEqual(
            requestedUrls,
            ['https://project.supabase.co/rest/v1/connection_registry?select=*&limit=0'],
            `runtime verification must issue only the Supabase probe and no Neural request: ${neuralCase.name}`,
          );
        }
        upstreamResponse = previousRuntimeResponse;
        assert.equal(
          getCapturedRequest().url,
          'https://project.supabase.co/rest/v1/connection_registry?select=*&limit=0',
          'the last configuration-only probe must be the Supabase request',
        );
        capturedRequest = null;

        const nativeReportsWithoutSupabase = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/reports/summary'),
          { ...env, GLORIFIER_DATABASE_PROVIDER: 'supabase', GLORIFIER_BACKEND_ORIGIN: undefined, GLORIFIER_SUPABASE_URL: undefined, GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: undefined },
        );
        assert.equal(nativeReportsWithoutSupabase.status, 503);
        assert.equal(await nativeReportsWithoutSupabase.json().then((body: { code?: string }) => body.code), 'SUPABASE_NOT_CONFIGURED');
        assert.equal(capturedRequest, null, 'native reports must not proxy to a legacy backend');

        const expectedNeonCounts: NeonOperationalCounts = {
          connection_approvals: 9,
          connection_events: 251212,
          connection_registry: 30,
          intelligence_analyses: 266,
          intelligence_evidence: 1099,
          intelligence_reports: 133,
        };
        const neonEnvironment: TestEnv = {
          ...env,
          GLORIFIER_DATABASE_PROVIDER: 'neon',
          GLORIFIER_SUPABASE_URL: 'https://project.supabase.co',
          GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: 'test-only-service-key',
          HYPERDRIVE: { connectionString: 'postgresql://hyperdrive.test/glorifier' },
        };
        let neonCountReaderCalls = 0;
        const neonCountReader = (binding: { connectionString: string }) => {
          neonCountReaderCalls += 1;
          assert.equal(binding.connectionString, 'postgresql://hyperdrive.test/glorifier');
          return Promise.resolve(expectedNeonCounts);
        };

        const neonReportsResponse = await reportsSummaryResponse(neonEnvironment, neonCountReader);
        assert.equal(neonReportsResponse.status, 200);
        const neonReportsBody = await neonReportsResponse.json() as {
          ok: boolean;
          status: string;
          summary: { connectionEvents: number; registeredConnections: number };
          evidence: { source: string; exactRowCounts: boolean };
        };
        assert.equal(neonReportsBody.ok, true);
        assert.equal(neonReportsBody.status, 'operational-data-observed');
        assert.equal(neonReportsBody.summary.connectionEvents, 251212);
        assert.equal(neonReportsBody.summary.registeredConnections, 30);
        assert.equal(neonReportsBody.evidence.source, 'neon-hyperdrive');
        assert.equal(neonReportsBody.evidence.exactRowCounts, true);
        assert.equal(neonCountReaderCalls, 1);

        const neonRuntimeResponse = await runtimeVerificationResponse(
          new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
          neonEnvironment,
          neonCountReader,
        );
        assert.equal(neonRuntimeResponse.status, 200);
        const neonRuntimeBody = await neonRuntimeResponse.json() as {
          ok: boolean;
          checks: { database: { ok: boolean; source: string; connectionRegistryRows: number } };
        };
        assert.equal(neonRuntimeBody.ok, true);
        assert.equal(neonRuntimeBody.checks.database.ok, true);
        assert.equal(neonRuntimeBody.checks.database.source, 'neon-hyperdrive');
        assert.equal(neonRuntimeBody.checks.database.connectionRegistryRows, 30);
        assert.equal(neonCountReaderCalls, 2);

        // Selecting Neon must never silently query Supabase when the Hyperdrive
        // binding is absent, even if Supabase configuration is still present.
        requestedUrls.length = 0;
        const neonWithoutHyperdrive: TestEnv = { ...neonEnvironment, HYPERDRIVE: undefined };
        const missingNeonBinding = await reportsSummaryResponse(neonWithoutHyperdrive, neonCountReader);
        assert.equal(missingNeonBinding.status, 503);
        assert.equal(await missingNeonBinding.json().then((body: { code?: string }) => body.code), 'NEON_HYPERDRIVE_NOT_CONFIGURED');
        const missingNeonRuntime = await runtimeVerificationResponse(
          new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
          neonWithoutHyperdrive,
          neonCountReader,
        );
        assert.equal(missingNeonRuntime.status, 503);
        assert.equal(await missingNeonRuntime.json().then((body: { checks: { database: { code?: string } } }) => body.checks.database.code), 'NEON_HYPERDRIVE_NOT_CONFIGURED');
        assert.deepEqual(requestedUrls, [], 'Neon mode must not fall back to Supabase PostgREST');
        assert.equal(neonCountReaderCalls, 2);

        const invalidDatabaseProvider = await reportsSummaryResponse({
          ...env,
          GLORIFIER_DATABASE_PROVIDER: 'unknown-provider',
        });
        assert.equal(invalidDatabaseProvider.status, 503);
        assert.equal(await invalidDatabaseProvider.json().then((body: { code?: string }) => body.code), 'DATABASE_PROVIDER_INVALID');

        // An omitted database provider must fail closed; it must never select the legacy
        // Supabase adapter implicitly when Neon is the authoritative operational store.
        const missingDatabaseProvider = await reportsSummaryResponse({
          ...env,
          GLORIFIER_DATABASE_PROVIDER: undefined,
          GLORIFIER_SUPABASE_URL: undefined,
          GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: undefined,
        });
        assert.equal(missingDatabaseProvider.status, 503);
        assert.equal(await missingDatabaseProvider.json().then((body: { code?: string }) => body.code), 'DATABASE_PROVIDER_INVALID');

        const missingProviderRuntime = await runtimeVerificationResponse(
          new Request('https://glorifier.glorifier.workers.dev/api/runtime-verification?probeAi=false'),
          {
            ...env,
            GLORIFIER_DATABASE_PROVIDER: undefined,
            GLORIFIER_SUPABASE_URL: undefined,
            GLORIFIER_SUPABASE_SERVICE_ROLE_KEY: undefined,
          },
          neonCountReader,
        );
        assert.equal(missingProviderRuntime.status, 503);
        assert.equal(
          await missingProviderRuntime.json().then((body: { checks: { database: { code?: string } } }) => body.checks.database.code),
          'DATABASE_PROVIDER_INVALID',
        );

        const neonQueryFailure = await reportsSummaryResponse(
          neonEnvironment,
          () => Promise.reject(new Error('simulated Neon query failure')),
        );
        assert.equal(neonQueryFailure.status, 502);
        assert.equal(await neonQueryFailure.json().then((body: { code?: string }) => body.code), 'NEON_REPORTS_QUERY_FAILED');

    };

    const verifyBackendAndNeuralRoutes = async (): Promise<void> => {
        // With no backend configured, unauthenticated app-state requests must be rejected
        // by the authentication boundary rather than surfacing as a generic upstream 502.
        const unauthenticatedAppState = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/app-state'),
          { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
        );
        assert.equal(unauthenticatedAppState.status, 401);
        assert.equal(await unauthenticatedAppState.json().then((body: { code?: string }) => body.code), 'AUTHENTICATION_REQUIRED');
        assert.equal(capturedRequest, null, 'unauthenticated app-state must be rejected before upstream routing');

        const emptyBearerAppState = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
            headers: { Authorization: 'Bearer ' },
          }),
          { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
        );
        assert.equal(emptyBearerAppState.status, 401, 'an empty bearer token is not a credential');
        assert.equal(await emptyBearerAppState.json().then((body: { code?: string }) => body.code), 'AUTHENTICATION_REQUIRED');

        const unrelatedCookieAppState = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
            headers: { Cookie: 'old-session-data=anything; theme=dark' },
          }),
          { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
        );
        assert.equal(unrelatedCookieAppState.status, 401, 'unrelated cookie names are not session credentials');
        assert.equal(await unrelatedCookieAppState.json().then((body: { code?: string }) => body.code), 'AUTHENTICATION_REQUIRED');

        for (const cookie of ['session', 'session=', 'session=   ', 'auth-token=', 'access-token']) {
          const emptySessionCookie = await worker.fetch(
            new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
              headers: { Cookie: cookie },
            }),
            { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
          );
          assert.equal(emptySessionCookie.status, 401, `empty cookie value must not count as a credential: ${cookie}`);
          assert.equal(await emptySessionCookie.json().then((body: { code?: string }) => body.code), 'AUTHENTICATION_REQUIRED');
        }

        const exactSessionCookieWithoutBackend = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
            headers: { Cookie: 'session=test-value' },
          }),
          { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
        );
        assert.equal(exactSessionCookieWithoutBackend.status, 503, 'valid session credentials cannot make an unconfigured backend available');
        assert.equal(await exactSessionCookieWithoutBackend.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_NOT_CONFIGURED');

        const credentialedAppStateWithoutBackend = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/app-state', {
            headers: { Authorization: 'Bearer test-token' },
          }),
          { ...env, GLORIFIER_BACKEND_ORIGIN: undefined },
        );
        assert.equal(credentialedAppStateWithoutBackend.status, 503, 'authenticated app-state must report the unavailable backend as service unavailable');
        assert.equal(await credentialedAppStateWithoutBackend.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_NOT_CONFIGURED');

        upstreamResponse = new Response('{"ok":true}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        capturedRequest = null;
        const configuredBackendResponse = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/configurable-backend?mode=probe'),
          { ...env, GLORIFIER_BACKEND_ORIGIN: 'https://api.example.test' },
        );
        assert.equal(configuredBackendResponse.status, 200);
        assert.equal(getCapturedRequest().url, 'https://api.example.test/api/configurable-backend?mode=probe');

        capturedRequest = null;
        const missingBackendAllowlist = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/allowlist-missing'),
          { ...env, GLORIFIER_BACKEND_ALLOWED_HOSTS: undefined },
        );
        assert.equal(missingBackendAllowlist.status, 502);
        assert.equal(await missingBackendAllowlist.json().then((body: { code?: string }) => body.code), 'BACKEND_EGRESS_ALLOWLIST_NOT_CONFIGURED');
        assert.equal(capturedRequest, null, 'backend egress must fail closed if no explicit allowlist exists');

        const nonAllowlistedBackend = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/host-not-allowed'),
          { ...env, GLORIFIER_BACKEND_ALLOWED_HOSTS: 'other.example.test' },
        );
        assert.equal(nonAllowlistedBackend.status, 502);
        assert.equal(await nonAllowlistedBackend.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_NOT_ALLOWLISTED');
        assert.equal(capturedRequest, null, 'backend requests must not reach hosts outside the exact allowlist');

        capturedRequest = null;
        const invalidBackendResponse = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/invalid-backend-config'),
          { ...env, GLORIFIER_BACKEND_ORIGIN: 'http://insecure.example.test' },
        );
        assert.equal(invalidBackendResponse.status, 502);
        assert.equal(await invalidBackendResponse.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_INVALID');
        assert.equal(capturedRequest, null, 'invalid backend origins must fail closed without making a request');

        const nonstandardBackendPort = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/nonstandard-port'),
          { ...env, GLORIFIER_BACKEND_ORIGIN: 'https://api.example.test:8443' },
        );
        assert.equal(nonstandardBackendPort.status, 502);
        assert.equal(await nonstandardBackendPort.json().then((body: { code?: string }) => body.code), 'BACKEND_ORIGIN_INVALID');
        assert.equal(capturedRequest, null, 'nonstandard HTTPS ports must be rejected before backend egress');

        upstreamResponse = new Response('{"ok":false,"error":"not found"}', {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
        const missingRoute = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/route-that-does-not-exist'),
          env,
        );
        assert.equal(missingRoute.status, 404, 'unknown API routes must stay backend errors, not SPA success');
        assert.equal(await missingRoute.json().then((body: { ok?: boolean; code?: string }) => body.ok), false);

        htmlResponseFixture = new Response('<!doctype html><title>SPA</title>', {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
        const misroutedApiResponse = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/misrouted-endpoint'),
          env,
        );
        const misroutedApiStatus = misroutedApiResponse.status;
        assert.equal(misroutedApiStatus, 502, 'An upstream document must be rejected as an API response');
        assert.equal(await misroutedApiResponse.json().then((body: { code?: string }) => body.code), 'API_HTML_RESPONSE');
        htmlResponseFixture = undefined;

        upstreamResponse = new Response('{"ok":true}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        const postResponse = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/test-write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'observe' }),
          }),
          env,
        );
        assert.equal(postResponse.status, 200);
        assert.equal(getCapturedRequest().method, 'POST');
        assert.deepEqual(JSON.parse(await getCapturedRequest().text()), { action: 'observe' });

        upstreamResponse = new Response(JSON.stringify({ id: '123' }), {
          status: 201,
          headers: {
            'Content-Type': 'application/json',
            Location: '/api/items/123',
          },
        });
        const createdResource = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'resource' }),
          }),
          env,
        );
        assert.equal(createdResource.status, 201, 'a successful creation response must not be converted to a redirect-policy error');
        assert.equal(createdResource.headers.get('location'), '/api/items/123', 'a non-redirect Location resource reference must retain its HTTP semantics');
        assert.equal(new URL(getCapturedRequest().url).origin, 'https://api.example.test');
        assert.equal(new URL(getCapturedRequest().url).pathname, '/api/items');

        upstreamResponse = new Response(null, {
          status: 302,
          headers: {
            Location: 'https://api.example.test/auth/broker/callback?state=test',
          },
        });
        const assetCallsBeforeAuth = assetCalls;
        const authRedirect = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
          env,
        );
        assert.equal(authRedirect.status, 302);
        assert.equal(
          authRedirect.headers.get('location'),
          'https://glorifier.glorifier.workers.dev/auth/broker/callback?state=test',
          'backend auth redirects must be rewritten to the current public origin',
        );
        assert.equal(
          getCapturedRequest().url,
          'https://api.example.test/auth/provider/start',
        );
        assert.equal(getCapturedRequest().redirect, 'manual', 'backend redirects must not cause the Worker to follow a second outbound request');
        assert.equal(assetCalls, assetCallsBeforeAuth, 'auth routes must not fall through to the SPA assets');

        upstreamResponse = new Response(null, {
          status: 302,
          headers: {
            Location: 'https://api.example.test/auth/broker/callback?state=approved&next=https%3A%2F%2Fevil.example#untrusted-fragment',
          },
        });
        const sanitizedAuthRedirect = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
          env,
        );
        assert.equal(sanitizedAuthRedirect.status, 302);
        assert.equal(
          sanitizedAuthRedirect.headers.get('location'),
          'https://glorifier.glorifier.workers.dev/auth/broker/callback?state=approved',
          'same-origin redirects must use a Worker-approved route and only approved OAuth callback parameters',
        );

        upstreamResponse = new Response(null, {
          status: 302,
          headers: { Location: 'https://api.example.test/internal/admin?next=https://evil.example' },
        });
        const blockedInternalRedirect = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
          env,
        );
        assert.equal(blockedInternalRedirect.status, 502);
        assert.equal(
          await blockedInternalRedirect.json().then((body: { code?: string }) => body.code),
          'BACKEND_REDIRECT_NOT_ALLOWED',
        );
        assert.equal(blockedInternalRedirect.headers.get('location'), null);

        upstreamResponse = new Response(null, {
          status: 302,
          headers: { Location: 'https://login.example.test/oauth/authorize?client_id=glorifier' },
        });
        const blockedExternalRedirect = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
          env,
        );
        assert.equal(blockedExternalRedirect.status, 502);
        assert.equal(
          await blockedExternalRedirect.json().then((body: { code?: string }) => body.code),
          'BACKEND_REDIRECT_NOT_ALLOWED',
        );

        const allowedExternalRedirect = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
          { ...env, GLORIFIER_BACKEND_REDIRECT_ALLOWED_HOSTS: 'login.example.test' },
        );
        assert.equal(allowedExternalRedirect.status, 302);
        assert.equal(
          allowedExternalRedirect.headers.get('location'),
          'https://login.example.test/oauth/authorize?client_id=glorifier',
          'external OAuth redirects must require an explicit exact-host allowlist',
        );

        for (const rejectedLocation of [
          'http://login.example.test/oauth/authorize',
          'https://login.example.test:8443/oauth/authorize',
          'https://user:password@login.example.test/oauth/authorize',
          'https://evil.example/oauth/authorize',
          'https://api.example.test/auth/broker/callback?state=one&state=two',
        ]) {
          upstreamResponse = new Response(null, { status: 302, headers: { Location: rejectedLocation } });
          const rejectedRedirect = await worker.fetch(
            new Request('https://glorifier.glorifier.workers.dev/auth/provider/start'),
            { ...env, GLORIFIER_BACKEND_REDIRECT_ALLOWED_HOSTS: 'login.example.test' },
          );
          assert.equal(rejectedRedirect.status, 502, rejectedLocation);
          assert.equal(
            await rejectedRedirect.json().then((body: { code?: string }) => body.code),
            'BACKEND_REDIRECT_NOT_ALLOWED',
            rejectedLocation,
          );
          assert.equal(rejectedRedirect.headers.get('location'), null, rejectedLocation);
        }

        // An attacker-controlled leading double slash is not a backend route and must
        // never be interpreted as an absolute URL by the upstream request constructor.
        capturedRequest = null;
        const assetCallsBeforeDoubleSlashPath = assetCalls;
        const doubleSlashPath = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev//attacker.example/steal?host=evil'),
          env,
        );
        assert.equal(doubleSlashPath.status, 200);
        assert.equal(capturedRequest, null, 'leading double-slash paths must not reach the backend');
        assert.equal(assetCalls, assetCallsBeforeDoubleSlashPath + 1);

        upstreamResponse = new Response('{"ok":true}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        capturedRequest = null;
        const upstreamQueryCannotChangeHost = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/test-routing?target=https%3A%2F%2Fevil.example%2Fpath'),
          env,
        );
        assert.equal(upstreamQueryCannotChangeHost.status, 200);
        assert.equal(new URL(getCapturedRequest().url).origin, 'https://api.example.test');
        assert.equal(new URL(getCapturedRequest().url).pathname, '/api/test-routing');
        assert.equal(new URL(getCapturedRequest().url).searchParams.get('target'), 'https://evil.example/path');

        upstreamResponse = new Response('{"ok":true}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        upstreamResponse = new Response('upstream failure', { status: 500, headers: { 'Content-Type': 'text/plain' } });

        const openSeaServerError = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
          openSeaEnv,
        );
        assert.equal(openSeaServerError.status, 502);
        const openSeaServerErrorBody = await openSeaServerError.json() as { code?: string; upstreamStatus?: number };
        assert.equal(openSeaServerErrorBody.code, 'OPENSEA_UPSTREAM_ERROR');
        assert.equal('upstreamStatus' in openSeaServerErrorBody, false, 'provider internals must not be disclosed');

        shouldThrow = true;
        const unavailable = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/test-unavailable'),
          env,
        );
        assert.equal(unavailable.status, 502);
        assert.equal(await unavailable.json().then((body: { ok?: boolean; code?: string }) => body.code), 'UPSTREAM_UNAVAILABLE');
        shouldThrow = false; // Restore the mocked upstream before testing Neural status forwarding.

        // Neural adapter exposes only the three documented routes, never a generic proxy.
        capturedRequest = null;
        const neuralNotConfigured = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/health'), { ...env, GLORIFIER_NEURAL_ORIGIN: undefined });
        assert.equal(neuralNotConfigured.status, 503);
        assert.equal(await neuralNotConfigured.json().then((body: { code?: string }) => body.code), 'NEURAL_ORIGIN_NOT_CONFIGURED');
        assert.equal(capturedRequest, null);

        const neuralInvalidOrigin = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/health'), { ...env, GLORIFIER_NEURAL_ORIGIN: 'http://neural.example.test' });
        assert.equal(neuralInvalidOrigin.status, 503);
        assert.equal(await neuralInvalidOrigin.json().then((body: { code?: string }) => body.code), 'NEURAL_ORIGIN_INVALID');

        const neuralNonstandardPort = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/neural/health'),
          { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test:8443' },
        );
        assert.equal(neuralNonstandardPort.status, 503);
        assert.equal(await neuralNonstandardPort.json().then((body: { code?: string }) => body.code), 'NEURAL_ORIGIN_INVALID');

        capturedRequest = null;
        const neuralMissingAllowlist = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/neural/health'),
          { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test', GLORIFIER_NEURAL_ALLOWED_HOSTS: undefined },
        );
        assert.equal(neuralMissingAllowlist.status, 503);
        assert.equal(await neuralMissingAllowlist.json().then((body: { code?: string }) => body.code), 'NEURAL_EGRESS_ALLOWLIST_NOT_CONFIGURED');
        assert.equal(capturedRequest, null, 'Neural egress must fail closed without an allowlist');

        const neuralHostNotAllowed = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/neural/health'),
          { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test', GLORIFIER_NEURAL_ALLOWED_HOSTS: 'another.example.test' },
        );
        assert.equal(neuralHostNotAllowed.status, 503);
        assert.equal(await neuralHostNotAllowed.json().then((body: { code?: string }) => body.code), 'NEURAL_ORIGIN_NOT_ALLOWLISTED');
        assert.equal(capturedRequest, null, 'Neural requests must not reach hosts outside the exact allowlist');

        const neuralTaskNoAuth = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', { method: 'POST', body: '{"task":"summarize"}' }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
        assert.equal(neuralTaskNoAuth.status, 401);
        assert.equal(capturedRequest, null, 'unauthenticated task requests must not reach Neural');

        capturedRequest = null;
        const declaredOversizeBody = new Uint8Array(65_536 + 1);
        const declaredOversizeTask = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer caller-token',
            'Content-Type': 'application/json',
            'Content-Length': String(declaredOversizeBody.byteLength),
          },
          body: declaredOversizeBody,
        }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
        assert.equal(declaredOversizeTask.status, 413, 'declared oversized task bodies must be rejected before upstream forwarding');
        assert.equal(await declaredOversizeTask.json().then((body: { code?: string }) => body.code), 'REQUEST_BODY_TOO_LARGE');
        assert.equal(capturedRequest, null, 'declared oversized bodies must never reach Neural');

        capturedRequest = null;
        const streamedOversizeBody = new Uint8Array(65_536 + 1);
        const streamedOversizeTask = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
          method: 'POST',
          headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
          body: streamedOversizeBody,
        }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
        assert.equal(streamedOversizeTask.status, 413, 'actual streamed size must be enforced even without a trusted Content-Length');
        assert.equal(await streamedOversizeTask.json().then((body: { code?: string }) => body.code), 'REQUEST_BODY_TOO_LARGE');
        assert.equal(capturedRequest, null, 'oversized streamed bodies must never reach Neural');

        let streamedBodyCancellationObserved = false;
        const cancellationAwareBody = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(65_537));
          },
          cancel() {
            streamedBodyCancellationObserved = true;
          },
        });
        const cancellationAwareOversizeTask = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
          method: 'POST',
          headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
          body: cancellationAwareBody,
          duplex: 'half',
        } as RequestInit), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
        assert.equal(cancellationAwareOversizeTask.status, 413, 'oversized streamed bodies must return 413');
        assert.equal(streamedBodyCancellationObserved, true, 'the oversized input stream must be cancelled after the byte limit is exceeded');
        assert.equal(capturedRequest, null, 'cancelled oversized request bodies must never reach Neural');

        capturedRequest = null;
        const unsupportedTaskMediaType = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
          method: 'POST',
          headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'text/plain' },
          body: '{"task":"summarize"}',
        }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
        assert.equal(unsupportedTaskMediaType.status, 415, 'task requests must use JSON media types');
        assert.equal(await unsupportedTaskMediaType.json().then((body: { code?: string }) => body.code), 'UNSUPPORTED_MEDIA_TYPE');
        assert.equal(capturedRequest, null, 'non-JSON task bodies must never reach Neural');

        capturedRequest = null;
        const malformedJsonTask = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
          method: 'POST',
          headers: { Authorization: 'Bearer caller-token', 'Content-Type': 'application/json' },
          body: '{"task":',
        }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
        assert.equal(malformedJsonTask.status, 400, 'invalid JSON must be rejected locally');
        assert.equal(await malformedJsonTask.json().then((body: { code?: string }) => body.code), 'INVALID_JSON_BODY');
        assert.equal(capturedRequest, null, 'malformed JSON must never reach Neural');

        upstreamResponse = new Response('{"status":"not-ready"}', { status: 503, headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'must-not-forward=yes' } });
        const neuralReady = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/ready'), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
        assert.equal(neuralReady.status, 503, 'Neural readiness status must be preserved');
        assert.equal(getCapturedRequest().url, 'https://neural.example.test/ready');
        assert.match(neuralReady.headers.get('x-correlation-id') ?? '', /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
        assert.equal(getCapturedRequest().headers.get('x-correlation-id'), neuralReady.headers.get('x-correlation-id'), 'the same correlation ID must cross the Worker and Neural boundary');
        assert.equal(neuralReady.headers.get('set-cookie'), null, 'upstream cookies must not be forwarded');

        upstreamResponse = new Response('{"accepted":true}', { status: 202, headers: { 'Content-Type': 'application/json' } });
        const callerCorrelationId = '550e8400-e29b-41d4-a716-446655440000';
        const neuralTask = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/v1/tasks', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer caller-token',
            'Content-Type': 'application/json',
            'X-Correlation-ID': callerCorrelationId,
          },
          body: '{"task":"summarize"}',
        }), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
        assert.equal(neuralTask.status, 202);
        assert.equal(getCapturedRequest().url, 'https://neural.example.test/v1/tasks');
        assert.equal(neuralTask.headers.get('x-correlation-id'), callerCorrelationId);
        assert.equal(getCapturedRequest().headers.get('x-correlation-id'), callerCorrelationId, 'validated correlation ID must be forwarded unchanged');
        assert.equal(getCapturedRequest().headers.get('authorization'), 'Bearer caller-token', 'caller token must be forwarded unchanged');
        assert.deepEqual(JSON.parse(await getCapturedRequest().text()), { task: 'summarize' });

        const neuralUnknown = await worker.fetch(new Request('https://glorifier.glorifier.workers.dev/api/neural/admin'), { ...env, GLORIFIER_NEURAL_ORIGIN: 'https://neural.example.test' });
        assert.equal(neuralUnknown.status, 404, 'unmapped Neural namespace paths must not fall through to the legacy backend');
        assert.equal(await neuralUnknown.json().then((body: { code?: string }) => body.code), 'NEURAL_ROUTE_NOT_FOUND');
        assert.equal(getCapturedRequest().url, 'https://neural.example.test/v1/tasks', 'unknown routes must not trigger another upstream request');
        // The last valid upstream request remains the task request; unknown routes must not replace it.


        upstreamResponse = new Response(JSON.stringify({ collection: 'glorifier7', name: 'GLORIFIER' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
        capturedRequest = null;
    };

    const verifyOpenSeaRoutes = async (): Promise<void> => {
        const openSeaCollection = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
          openSeaEnv,
        );
        assert.equal(openSeaCollection.status, 200);
        assert.equal(getCapturedRequest().url, 'https://api.opensea.io/api/v2/collections/glorifier7');
        assert.equal(getCapturedRequest().headers.get('x-api-key'), 'test-opensea-key');
        assert.equal(getCapturedRequest().headers.get('accept'), 'application/json');
        assert.equal(openSeaCollection.headers.get('cache-control'), 'public, max-age=60');
        assert.equal(JSON.stringify(await openSeaCollection.json()).includes('test-opensea-key'), false);

        capturedRequest = null;
        const openSeaMissingKey = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
          { ...env, OPENSEA_API_KEY: undefined } as TestEnv & { OPENSEA_API_KEY?: string },
        );
        assert.equal(openSeaMissingKey.status, 503);
        assert.equal(await openSeaMissingKey.json().then((body: { code?: string }) => body.code), 'OPENSEA_API_KEY_NOT_CONFIGURED');
        assert.equal(capturedRequest, null, 'OpenSea requests must fail closed when the API key is absent');

        const openSeaInvalidSlug = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/INVALID_SLUG'),
          openSeaEnv,
        );
        assert.equal(openSeaInvalidSlug.status, 400, 'invalid collection slugs must be rejected locally');
        assert.equal(await openSeaInvalidSlug.json().then((body: { code?: string }) => body.code), 'INVALID_COLLECTION_SLUG');

        // Account routes must be handled before the collection-only OpenSea adapter.
        capturedRequest = null;
        const openSeaInvalidAccountRoute = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/invalid%20name'),
          openSeaEnv,
        );
        assert.equal(openSeaInvalidAccountRoute.status, 400);
        assert.equal(await openSeaInvalidAccountRoute.json().then((body: { code?: string }) => body.code), 'INVALID_OPENSEA_ACCOUNT_IDENTIFIER');
        assert.equal(capturedRequest, null, 'invalid account identifiers must be rejected locally');

        const openSeaInvalidAccountCollectionsRoute = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/invalid%20name/collections'),
          openSeaEnv,
        );
        assert.equal(openSeaInvalidAccountCollectionsRoute.status, 400);
        assert.equal(await openSeaInvalidAccountCollectionsRoute.json().then((body: { code?: string }) => body.code), 'INVALID_OPENSEA_ACCOUNT_IDENTIFIER');
        assert.equal(capturedRequest, null, 'invalid account collection identifiers must be rejected locally');

        // Only explicitly registered GLORIFIER collection slugs may reach OpenSea.
        capturedRequest = null;
        const openSeaUnregisteredSlug = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/a'),
          openSeaEnv,
        );
        assert.equal(openSeaUnregisteredSlug.status, 404);
        assert.equal(await openSeaUnregisteredSlug.json().then((body: { code?: string }) => body.code), 'OPENSEA_ROUTE_NOT_FOUND');
        assert.equal(capturedRequest, null, 'unregistered collection slugs must not reach OpenSea');

        const openSeaWrongMethod = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7', { method: 'POST' }),
          openSeaEnv,
        );
        assert.equal(openSeaWrongMethod.status, 405);
        assert.equal(openSeaWrongMethod.headers.get('allow'), 'GET, HEAD');

        upstreamResponse = new Response(JSON.stringify({ detail: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
        const openSeaUnauthorized = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
          openSeaEnv,
        );
        assert.equal(openSeaUnauthorized.status, 502);
        assert.equal(await openSeaUnauthorized.json().then((body: { code?: string }) => body.code), 'OPENSEA_API_KEY_REJECTED');


        upstreamResponse = new Response(JSON.stringify({ detail: 'rate limited' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Retry-After': '7' },
        });
        const openSeaRateLimited = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
          openSeaEnv,
        );
        assert.equal(openSeaRateLimited.status, 503);
        assert.equal(openSeaRateLimited.headers.get('retry-after'), '7');
        assert.equal(await openSeaRateLimited.json().then((body: { code?: string }) => body.code), 'OPENSEA_RATE_LIMITED');

        upstreamResponse = new Response(JSON.stringify({ collection: 'missing' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        const openSeaNotFound = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier1'),
          openSeaEnv,
        );
        assert.equal(openSeaNotFound.status, 404);
        assert.equal(await openSeaNotFound.json().then((body: { code?: string }) => body.code), 'OPENSEA_COLLECTION_NOT_FOUND');

        upstreamResponse = new Response(JSON.stringify({ collection: 'glorifier7' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        const openSeaHead = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7', { method: 'HEAD' }),
          openSeaEnv,
        );
        assert.equal(openSeaHead.status, 200);
        assert.equal(await openSeaHead.text(), '');
        assert.equal(openSeaHead.headers.get('content-type'), 'application/json');

        upstreamResponse = new Response('not-json', { status: 200, headers: { 'Content-Type': 'text/plain' } });
        const openSeaInvalidContentType = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
          openSeaEnv,
        );
        assert.equal(openSeaInvalidContentType.status, 502);
        assert.equal(await openSeaInvalidContentType.json().then((body: { code?: string }) => body.code), 'OPENSEA_INVALID_RESPONSE');

        upstreamResponse = new Response('x'.repeat(1_048_577), { status: 200, headers: { 'Content-Type': 'application/json' } });
        const openSeaOversized = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
          openSeaEnv,
        );
        assert.equal(openSeaOversized.status, 502);
        assert.equal(await openSeaOversized.json().then((body: { code?: string }) => body.code), 'OPENSEA_RESPONSE_TOO_LARGE');

        shouldThrow = true;
        const openSeaUnavailable = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/collections/glorifier7'),
          openSeaEnv,
        );
        shouldThrow = false;
        assert.equal(openSeaUnavailable.status, 502);
        assert.equal(await openSeaUnavailable.json().then((body: { code?: string }) => body.code), 'OPENSEA_UPSTREAM_UNAVAILABLE');


        // Resolve the actual OpenSea username, then enumerate collections for its canonical wallet.
        upstreamResponses = [
          new Response(JSON.stringify({ address: '0xAbCd000000000000000000000000000000001234', username: 'GLORIFIER', ens_name: null }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          }),
          new Response(JSON.stringify({ collections: [{ collection: 'glorifier-services', name: 'GLORIFIER Services' }], next: null }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          }),
        ];
        capturedRequest = null;
        const glorifierCollections = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections?limit=10'),
          openSeaEnv,
        );
        assert.equal(glorifierCollections.status, 200);
        const glorifierCollectionsBody = await glorifierCollections.json() as {
          account?: { address?: string; username?: string };
          collections?: Array<{ collection?: string }>;
        };
        assert.equal(glorifierCollectionsBody.account?.username, 'GLORIFIER');
        assert.equal(glorifierCollectionsBody.account?.address, '0xAbCd000000000000000000000000000000001234');
        assert.equal(glorifierCollectionsBody.collections?.[0]?.collection, 'glorifier-services');
        assert.deepEqual(requestedUrls.slice(-2), [
          'https://api.opensea.io/api/v2/accounts/resolve/GLORIFIER',
          'https://api.opensea.io/api/v2/account/0xAbCd000000000000000000000000000000001234/collections?limit=10',
        ]);
        assert.equal(getCapturedRequest().headers.get('x-api-key'), 'test-opensea-key');

        upstreamResponses = [
          new Response(JSON.stringify({ address: '0xAbCd000000000000000000000000000000001234', username: 'somebody-else' }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
          }),
        ];
        const wrongAccountIdentity = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections'),
          openSeaEnv,
        );
        assert.equal(wrongAccountIdentity.status, 409, 'an identity mismatch must return Conflict and must not enumerate collections');
        assert.equal(await wrongAccountIdentity.json().then((body: { code?: string }) => body.code), 'OPENSEA_ACCOUNT_IDENTITY_MISMATCH');


        upstreamResponses = [];
        capturedRequest = null;
        const missingOpenSeaAccountKey = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections'),
          { ...env, OPENSEA_API_KEY: undefined } as TestEnv & { OPENSEA_API_KEY?: string },
        );
        assert.equal(missingOpenSeaAccountKey.status, 503);
        assert.equal(capturedRequest, null, 'account resolution must fail closed without the API key');

        upstreamResponses = [];
        const invalidAccountLimit = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections?limit=51'),
          openSeaEnv,
        );
        assert.equal(invalidAccountLimit.status, 400);
        assert.equal(await invalidAccountLimit.json().then((body: { code?: string }) => body.code), 'INVALID_OPENSEA_PAGE_LIMIT');

        upstreamResponses = [
          new Response(JSON.stringify({ detail: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } }),
        ];
        const missingOpenSeaAccount = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections'),
          openSeaEnv,
        );
        assert.equal(missingOpenSeaAccount.status, 404);
        assert.equal(await missingOpenSeaAccount.json().then((body: { code?: string }) => body.code), 'OPENSEA_ACCOUNT_NOT_FOUND');

        upstreamResponses = [];
        capturedRequest = null;
        const invalidAccountIdentifier = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/%2Fbad/collections'),
          openSeaEnv,
        );
        assert.equal(invalidAccountIdentifier.status, 400);
        assert.equal(capturedRequest, null, 'invalid account identifiers must be rejected before upstream access');
        // The GLORIFIER OpenSea username must be resolved to the canonical wallet address
        // before retrieving that account's owned collections.
        const openSeaAccountStart = requestedUrls.length;
        openSeaResponseQueue = [
          new Response(JSON.stringify({ address: '0x1234567890abcdef1234567890abcdef12345678', username: 'GLORIFIER', ens_name: 'glorifier.eth' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
          new Response(JSON.stringify({ collections: [{ collection: 'glorifier-services', name: 'GLORIFIER Services' }], next: 'next-cursor-1' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ];
        const openSeaAccountCollections = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections?limit=25&after=cursor-one'),
          openSeaEnv,
        );
        assert.equal(openSeaAccountCollections.status, 200);
        const openSeaAccountBody = await openSeaAccountCollections.json() as {
          ok?: boolean;
          account?: { username?: string; address?: string; ens_name?: string | null };
          collections?: Array<{ collection?: string; name?: string }>;
          next?: string | null;
        };
        assert.equal(openSeaAccountBody.ok, true);
        assert.equal(openSeaAccountBody.account?.username, 'GLORIFIER');
        assert.equal(openSeaAccountBody.account?.address, '0x1234567890abcdef1234567890abcdef12345678');
        assert.equal(openSeaAccountBody.collections?.[0]?.collection, 'glorifier-services');
        assert.equal(openSeaAccountBody.next, 'next-cursor-1');
        assert.deepEqual(requestedUrls.slice(openSeaAccountStart), [
          'https://api.opensea.io/api/v2/accounts/resolve/GLORIFIER',
          'https://api.opensea.io/api/v2/account/0x1234567890abcdef1234567890abcdef12345678/collections?limit=25&after=cursor-one',
        ]);
        assert.equal(openSeaResponseQueue.length, 0);
        openSeaResponseQueue = null;

        // An account lookup that resolves to a different username must not enumerate that wallet.
        const openSeaMismatchStart = requestedUrls.length;
        openSeaResponseQueue = [
          new Response(JSON.stringify({ address: '0x1234567890abcdef1234567890abcdef12345678', username: 'not-glorifier', ens_name: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ];
        const openSeaAccountMismatch = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections'),
          openSeaEnv,
        );
        assert.equal(openSeaAccountMismatch.status, 409);
        assert.equal(await openSeaAccountMismatch.json().then((body: { code?: string }) => body.code), 'OPENSEA_ACCOUNT_IDENTITY_MISMATCH');
        assert.equal(requestedUrls.length, openSeaMismatchStart + 1, 'a mismatched identity must not trigger the collections request');
        openSeaResponseQueue = null;

        // Account identifiers and pagination inputs are validated before any provider call.
        const openSeaInvalidLimitStart = requestedUrls.length;
        const openSeaInvalidLimit = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/collections?limit=0'),
          openSeaEnv,
        );
        assert.equal(openSeaInvalidLimit.status, 400);
        assert.equal(await openSeaInvalidLimit.json().then((body: { code?: string }) => body.code), 'INVALID_OPENSEA_PAGE_LIMIT');
        assert.equal(requestedUrls.length, openSeaInvalidLimitStart);

        const openSeaInvalidAccount = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER%2Fother/collections'),
          openSeaEnv,
        );
        assert.equal(openSeaInvalidAccount.status, 400);
        assert.equal(await openSeaInvalidAccount.json().then((body: { code?: string }) => body.code), 'INVALID_OPENSEA_ACCOUNT_IDENTIFIER');

        // Direct resolution exposes the account record without assuming a collection slug.
        const openSeaResolveStart = requestedUrls.length;
        openSeaResponseQueue = [
          new Response(JSON.stringify({ address: '0x1234567890abcdef1234567890abcdef12345678', username: 'GLORIFIER', ens_name: 'glorifier.eth' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ];
        const openSeaResolvedAccount = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
          openSeaEnv,
        );
        assert.equal(openSeaResolvedAccount.status, 200);
        assert.equal(await openSeaResolvedAccount.json().then((body: { account?: { username?: string } }) => body.account?.username), 'GLORIFIER');
        assert.deepEqual(requestedUrls.slice(openSeaResolveStart, openSeaResolveStart + 1), ['https://api.opensea.io/api/v2/accounts/resolve/GLORIFIER']);
        openSeaResponseQueue = null;

        // A username named "resolve" must still reach the owned-collections route.
        const reservedUsernameStart = requestedUrls.length;
        openSeaResponseQueue = [
          new Response(JSON.stringify({ address: '0x1234567890abcdef1234567890abcdef12345678', username: 'resolve', ens_name: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
          new Response(JSON.stringify({ collections: [{ collection: 'resolve-account-collection', name: 'Resolve Account Collection' }], next: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ];
        const reservedUsernameCollections = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/collections?limit=5'),
          openSeaEnv,
        );
        assert.equal(reservedUsernameCollections.status, 200);
        assert.equal(await reservedUsernameCollections.json().then((body: { account?: { username?: string }; collections?: Array<{ collection?: string }> }) => body.account?.username), 'resolve');
        assert.deepEqual(requestedUrls.slice(reservedUsernameStart), [
          'https://api.opensea.io/api/v2/accounts/resolve/resolve',
          'https://api.opensea.io/api/v2/account/0x1234567890abcdef1234567890abcdef12345678/collections?limit=5',
        ]);
        openSeaResponseQueue = null;

        // Percent-encoded account identifiers are decoded before local validation.
        const encodedUsernameStart = requestedUrls.length;
        openSeaResponseQueue = [
          new Response(JSON.stringify({ address: '0x1234567890abcdef1234567890abcdef12345678', username: 'GLORIFIER', ens_name: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
          new Response(JSON.stringify({ collections: [{ collection: 'glorifier7', name: 'GLORIFIER' }], next: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        ];
        const encodedUsernameCollections = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/%47LORIFIER/collections?limit=5'),
          openSeaEnv,
        );
        assert.equal(encodedUsernameCollections.status, 200);
        assert.equal(await encodedUsernameCollections.json().then((body: { account?: { username?: string } }) => body.account?.username), 'GLORIFIER');
        assert.deepEqual(requestedUrls.slice(encodedUsernameStart), [
          'https://api.opensea.io/api/v2/accounts/resolve/GLORIFIER',
          'https://api.opensea.io/api/v2/account/0x1234567890abcdef1234567890abcdef12345678/collections?limit=5',
        ]);
        openSeaResponseQueue = null;

        // Malformed percent escapes fail closed, and HEAD route errors never include a body.
        const malformedEncodedHead = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/%E0%A4%A/collections', { method: 'HEAD' }),
          openSeaEnv,
        );
        assert.equal(malformedEncodedHead.status, 400);
        assert.equal(await malformedEncodedHead.text(), '');

        const missingAccountRouteHead = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/GLORIFIER/unknown', { method: 'HEAD' }),
          openSeaEnv,
        );
        assert.equal(missingAccountRouteHead.status, 404);
        assert.equal(await missingAccountRouteHead.text(), '');

        // Missing account identities retain their endpoint-specific error code.
        openSeaResponseQueue = [
          new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } }),
        ];
        const missingCollectionsAccount = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/NO_SUCH_ACCOUNT/collections'),
          openSeaEnv,
        );
        assert.equal(missingCollectionsAccount.status, 404);
        assert.equal(await missingCollectionsAccount.json().then((body: { code?: string }) => body.code), 'OPENSEA_ACCOUNT_NOT_FOUND');
        openSeaResponseQueue = null;

        // HEAD requests must not leak a response body on upstream errors.
        openSeaResponseQueue = [
          new Response('unauthorized', { status: 401, headers: { 'Content-Type': 'text/plain' } }),
        ];
        const accountHeadError = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER', { method: 'HEAD' }),
          openSeaEnv,
        );
        assert.equal(accountHeadError.status, 502);
        assert.equal(await accountHeadError.text(), '');
        openSeaResponseQueue = null;

        // Retry-After may be a delay or an HTTP date; preserve a valid HTTP date.
        openSeaResponseQueue = [
          new Response('rate limited', {
            status: 429,
            headers: { 'Retry-After': 'Wed, 21 Oct 2015 07:28:00 GMT' },
          }),
        ];
        const accountRetryAfterDate = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
          openSeaEnv,
        );
        assert.equal(accountRetryAfterDate.status, 429);
        assert.equal(accountRetryAfterDate.headers.get('retry-after'), 'Wed, 21 Oct 2015 07:28:00 GMT');
        openSeaResponseQueue = null;

        // JSON-seq is not a JSON document and must be rejected.
        openSeaResponseQueue = [
          new Response('{"address":"0x1234567890abcdef1234567890abcdef12345678","username":"GLORIFIER"}', {
            status: 200,
            headers: { 'Content-Type': 'application/json-seq' },
          }),
        ];
        const invalidJsonSequence = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
          openSeaEnv,
        );
        assert.equal(invalidJsonSequence.status, 502);
        assert.equal(await invalidJsonSequence.json().then((body: { code?: string }) => body.code), 'OPENSEA_INVALID_CONTENT_TYPE');
        openSeaResponseQueue = null;

        // Request timeouts are surfaced as HTTP 504 with a stable machine-readable code.
        const openSeaTimeout = new Error('simulated OpenSea request timeout');
        openSeaTimeout.name = 'TimeoutError';
        openSeaFetchError = openSeaTimeout;
        const openSeaTimedOut = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
          openSeaEnv,
        );
        assert.equal(openSeaTimedOut.status, 504);
        assert.equal(await openSeaTimedOut.json().then((body: { code?: string }) => body.code), 'OPENSEA_REQUEST_TIMEOUT');
        openSeaFetchError = null;

        // Reject malformed Retry-After values rather than forwarding JavaScript Date.parse quirks.
        for (const invalidRetryAfter of ['1.5', '-5', 'banana 1', 'Mon, 32 Nov 2015 07:28:00 GMT', 'Tue, 21 Oct 2015 07:28:00 GMT']) {
          openSeaResponseQueue = [
            new Response('rate limited', { status: 429, headers: { 'Retry-After': invalidRetryAfter } }),
          ];
          const malformedRetryAfter = await worker.fetch(
            new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
            openSeaEnv,
          );
          assert.equal(malformedRetryAfter.status, 429);
          assert.equal(malformedRetryAfter.headers.get('retry-after'), null, invalidRetryAfter);
          openSeaResponseQueue = null;
        }

        // A non-timeout network failure remains a 502 and is not mislabeled as a timeout.
        openSeaFetchError = new Error('simulated OpenSea network failure');
        const openSeaUnavailableAccount = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
          openSeaEnv,
        );
        assert.equal(openSeaUnavailableAccount.status, 502);
        assert.equal(await openSeaUnavailableAccount.json().then((body: { code?: string }) => body.code), 'OPENSEA_UPSTREAM_UNAVAILABLE');
        openSeaFetchError = null;

        // Invalid JSON and oversized account responses fail closed with stable error codes.
        openSeaResponseQueue = [
          new Response('{invalid', { status: 200, headers: { 'Content-Type': 'application/json' } }),
        ];
        const malformedAccountJson = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
          openSeaEnv,
        );
        assert.equal(malformedAccountJson.status, 502);
        assert.equal(await malformedAccountJson.json().then((body: { code?: string }) => body.code), 'OPENSEA_INVALID_RESPONSE');
        openSeaResponseQueue = null;

        openSeaResponseQueue = [
          new Response('x'.repeat(1_048_577), { status: 200, headers: { 'Content-Type': 'application/json' } }),
        ];
        const oversizedAccountJson = await worker.fetch(
          new Request('https://glorifier.glorifier.workers.dev/api/opensea/accounts/resolve/GLORIFIER'),
          openSeaEnv,
        );
        assert.equal(oversizedAccountJson.status, 502);
        assert.equal(await oversizedAccountJson.json().then((body: { code?: string }) => body.code), 'OPENSEA_RESPONSE_TOO_LARGE');
        openSeaResponseQueue = null;

    };

    await verifyWorkerAssetsAndPreviewIsolation();
    await verifyMcpTransportAndToolCalls();
    await verifyMcpMethodAndMediaValidation();
    await verifyMcpBodyLimitsAndCancellation();
    await verifyMcpGithubFileResults();
    await verifyA2AProtocol();
    await verifyWorkerIdentityAndNativeRoutes();
    await verifyGovernanceAndNativeRuntime();
    await verifyDatabaseAndRuntimeContracts();
    await verifyBackendAndNeuralRoutes();
    await verifyOpenSeaRoutes();
    console.log('Cloudflare Worker proxy tests passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }
};
await run();

});
