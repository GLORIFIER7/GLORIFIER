import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  validateDataStatus,
  validateIntegrationRegistry,
  validateMcpInitialize,
  validateMcpReadOnlyTools,
  validateOperationalSummary,
  validateRuntimeVerification,
  requestJson,
  verifyPublicReadModels,
  validateBuildInfo,
  verifyBuildProvenance,
  formatSmokeFailure,
} from './cloudflare-production-smoke.mjs';

const normalizeFetchInput = (input, options = {}) => {
  const request = input instanceof Request ? input : null;
  const rawTarget = input instanceof URL ? input.href : request ? request.url : input;
  return {
    target: new URL(rawTarget),
    method: options.method ?? request?.method ?? 'GET',
  };
};

test('smoke fetch harness normalizes URL and Request inputs and preserves Request methods', () => {
  const urlInput = new URL('https://glorifier.pages.dev/api/health');
  const normalizedUrl = normalizeFetchInput(urlInput);
  assert.equal(normalizedUrl.target.href, urlInput.href);
  assert.equal(normalizedUrl.method, 'GET');

  const requestInput = new Request('https://glorifier.pages.dev/api/app-state', { method: 'POST' });
  const normalizedRequest = normalizeFetchInput(requestInput);
  assert.equal(normalizedRequest.target.href, requestInput.url);
  assert.equal(normalizedRequest.method, 'POST');
  assert.equal(normalizeFetchInput(requestInput, { method: 'GET' }).method, 'GET');
});

const findProductionDeployCommand = (stepText) =>
  /^[ \t]*if wrangler deploy[ \t]*\\[ \t]*$/m.exec(stepText);

test('production smoke probes never send HTTP mutation methods to the live Worker', () => {
  const workflow = readFileSync(new URL('../.github/workflows/cloudflare-worker.yml', import.meta.url), 'utf8');
  const smokeSource = readFileSync(new URL('./cloudflare-production-smoke.mjs', import.meta.url), 'utf8');

  assert.doesNotMatch(smokeSource, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/i,
    'the production smoke script must not issue HTTP mutation methods');
  assert.doesNotMatch(workflow, /--request\s+(?:POST|PUT|PATCH|DELETE)\b/i,
    'the production deployment workflow must not issue HTTP mutation methods');
  assert.equal(smokeSource.includes('fetchProductionMcp'), false,
    'production smoke must not make MCP POST requests');
  const validationJobIndex = workflow.indexOf('\n  validate-and-build:');
  const deployJobIndex = workflow.indexOf('\n  deploy-production:');
  assert.ok(validationJobIndex >= 0 && deployJobIndex > validationJobIndex,
    'the workflow must keep validation/build separate from production deployment');
  const validationJobText = workflow.slice(validationJobIndex, deployJobIndex);
  const productionJobText = workflow.slice(deployJobIndex);
  const requiredReleaseVariables = [
    '--var "GLORIFIER_RELEASE_COMMIT:${GITHUB_SHA}"',
    '--var "GLORIFIER_RELEASE_REF:${GITHUB_REF}"',
    '--var "GLORIFIER_RELEASE_RUN_ID:${GITHUB_RUN_ID}"',
  ];
  assert.ok(validationJobText.includes('wrangler deploy --dry-run'),
    'the validation job must dry-run the Wrangler deploy command');
  for (const argument of requiredReleaseVariables) {
    assert.ok(validationJobText.includes(argument),
      'the no-deploy Wrangler validation must pass ' + argument);
    assert.ok(productionJobText.includes(argument),
      'the production deploy must pass ' + argument);
  }
  assert.ok(smokeSource.includes('verifyBuildProvenance'),
    'production smoke must verify the deployed source commit against the expected GitHub SHA');
  const deployStepIndex = workflow.indexOf(
    '\n      - name: Deploy Cloudflare Worker',
    deployJobIndex,
  );
  const nextWorkflowStepIndex = workflow.indexOf('\n      - name:', deployStepIndex + 1);
  const deploymentStepText = workflow.slice(
    deployStepIndex,
    nextWorkflowStepIndex === -1 ? undefined : nextWorkflowStepIndex,
  );
  const deploymentCommandMatch = findProductionDeployCommand(deploymentStepText);
  const deployCommandIndex = deploymentCommandMatch
    ? deployStepIndex + deploymentCommandMatch.index
    : -1;
  assert.ok(deploymentCommandMatch,
    'the production deployment step must contain the exact Wrangler deploy command line');
  assert.ok(findProductionDeployCommand('            if wrangler deploy ' + '\\'),
    'the exact Wrangler deploy command line must be recognized');
  assert.equal(findProductionDeployCommand('            if wrangler deployment ' + '\\'), null,
    'a similarly prefixed command must not satisfy the production deployment contract');
  const releaseSmokeStepIndex = workflow.indexOf(
    '\n      - name: Verify all deployed production read-only contracts',
    deployCommandIndex,
  );
  const releaseSmokeCommandIndex = workflow.indexOf(
    'run: node scripts/cloudflare-production-smoke.mjs',
    releaseSmokeStepIndex,
  );
  const validationJobSmokeIndex = workflow.indexOf(
    'run: node scripts/cloudflare-production-smoke.mjs',
    validationJobIndex,
  );
  assert.ok(validationJobIndex >= 0 && deployJobIndex > validationJobIndex &&
    deployStepIndex > deployJobIndex && deployCommandIndex > deployStepIndex &&
    releaseSmokeStepIndex > deployCommandIndex &&
    releaseSmokeCommandIndex > releaseSmokeStepIndex &&
    (validationJobSmokeIndex === -1 || validationJobSmokeIndex > deployJobIndex),
  'the GET-only production smoke suite must run only after the real deployment step');
});

const reports = {
  ok: true,
  status: 'operational-data-observed',
  evidence: { source: 'neon-hyperdrive', exactRowCounts: true },
  summary: {
    connectionApprovals: 9,
    connectionEvents: 251212,
    registeredConnections: 30,
    intelligenceAnalyses: 266,
    intelligenceEvidence: 1099,
    intelligenceReports: 133,
  },
};

const runtime = {
  ok: true,
  status: 'verified-for-probed-dependencies',
  checks: {
    worker: { ok: true },
    assets: { ok: true },
    database: { ok: true, source: 'neon-hyperdrive', connectionRegistryRows: 30, latencyMs: 100 },
    neural: { ok: false, status: 'not-configured' },
    authentication: { ok: null, status: 'not-probed' },
    ai: { ok: null, executed: false, status: 'not-probed' },
  },
};

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  result: {
    protocolVersion: '2025-03-26',
    serverInfo: { name: 'GLORIFIER GitHub Read-Only' },
    capabilities: { tools: {} },
  },
};

const tools = {
  jsonrpc: '2.0',
  id: 2,
  result: {
    tools: [
      'github_get_repository',
      'github_list_open_pull_requests',
      'github_list_workflow_runs',
      'github_read_file',
    ].map((name) => ({
      name,
      annotations: { readOnlyHint: true, destructiveHint: false },
    })),
  },
};

test('production reports require exact Neon count evidence for all six tables', () => {
  assert.equal(validateOperationalSummary(reports).connectionEvents, 251212);
  assert.throws(() => validateOperationalSummary({
    ...reports,
    evidence: { source: 'supabase-postgrest', exactRowCounts: true },
  }), /Neon Hyperdrive/);
  assert.throws(() => validateOperationalSummary({
    ...reports,
    summary: { ...reports.summary, connectionEvents: -1 },
  }), /safe non-negative exact count/);
});

test('production runtime must prove the live database source is Neon Hyperdrive', () => {
  assert.equal(validateRuntimeVerification(runtime).database.source, 'neon-hyperdrive');
  assert.throws(() => validateRuntimeVerification({
    ...runtime,
    checks: { ...runtime.checks, database: { ok: true, source: 'supabase-postgrest' } },
  }), /Neon/);
});

test('production MCP initialization must advertise the approved protocol and server', () => {
  assert.equal(validateMcpInitialize(initialize).protocolVersion, '2025-03-26');
  assert.throws(() => validateMcpInitialize({
    ...initialize,
    result: { ...initialize.result, protocolVersion: 'unapproved' },
  }), /2025-03-26/);
});

test('production MCP tool surface must be the exact read-only allowlist', () => {
  assert.equal(validateMcpReadOnlyTools(tools).length, 4);
  assert.throws(() => validateMcpReadOnlyTools({
    ...tools,
    result: { tools: [...tools.result.tools, {
      name: 'github_delete_repository',
      annotations: { readOnlyHint: false, destructiveHint: true },
    }] },
  }), /four approved read-only GitHub tools/);
});

test('full-stack smoke extends only the Neon reports deadline', () => {
  const smokeSource = readFileSync(new URL('./full-stack-smoke.mjs', import.meta.url), 'utf8');
  assert.match(smokeSource,
    /const requestTimeoutMs = check\.name === 'cloudflare-operational-reports' \? 35_000 : 10_000;/);
  assert.match(smokeSource, /signal: AbortSignal\.timeout\(requestTimeoutMs\)/);
  assert.doesNotMatch(smokeSource, /signal: AbortSignal\.timeout\(30_000\)/,
    'other smoke probes must retain their original 10-second deadline');
});

test('production smoke request fails immediately for deterministic client errors', async () => {
  let attempts = 0;
  const fetchNotFound = async () => {
    attempts += 1;
    return new Response(JSON.stringify({ code: 'NOT_FOUND' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  await assert.rejects(requestJson(fetchNotFound), /HTTP 404/);
  assert.equal(attempts, 1, 'a deterministic 4xx must not be retried');
});

test('production smoke request fails immediately for non-JSON error responses', async () => {
  let attempts = 0;
  const fetchHtmlError = async () => {
    attempts += 1;
    return new Response('<html>not found</html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
  };
  await assert.rejects(requestJson(fetchHtmlError), /non-JSON content/);
  assert.equal(attempts, 1, 'a non-JSON error response must not be retried');
});

test('production smoke failure diagnostics retain safe HTTP codes without response values', () => {
  const knownCode = new Error('Production endpoint returned HTTP 503: NEON_HYPERDRIVE_NOT_CONFIGURED');
  assert.equal(formatSmokeFailure(knownCode), 'HTTP 503: NEON_HYPERDRIVE_NOT_CONFIGURED');

  const untrustedResponseText = new Error('Production endpoint returned HTTP 503: customer-email@example.test');
  assert.equal(formatSmokeFailure(untrustedResponseText), 'HTTP 503');
  assert.doesNotMatch(formatSmokeFailure(untrustedResponseText), /customer-email/);

  const untrustedUppercaseCode = new Error('Production endpoint returned HTTP 503: CUSTOMER_EMAIL_EXPOSED');
  assert.equal(formatSmokeFailure(untrustedUppercaseCode), 'HTTP 503');
  assert.doesNotMatch(formatSmokeFailure(untrustedUppercaseCode), /CUSTOMER_EMAIL/);

  const multilineResponseText = new Error('Production endpoint returned HTTP 503: untrusted response\nprivate detail');
  assert.equal(formatSmokeFailure(multilineResponseText), 'HTTP 503');
  assert.doesNotMatch(formatSmokeFailure(multilineResponseText), /private detail/);

  const assertionFailure = new Error('smoke contract failed');
  assertionFailure.name = 'AssertionError';
  assert.equal(formatSmokeFailure(assertionFailure), 'assertion failed');

  const forgedErrorName = new Error('network failure');
  forgedErrorName.name = 'customer\\nPRIVATE_PAYLOAD';
  assert.equal(formatSmokeFailure(forgedErrorName), 'smoke failed (unexpected error)');
  assert.doesNotMatch(formatSmokeFailure(forgedErrorName), /customer|PRIVATE_PAYLOAD/);
  assert.equal(formatSmokeFailure({ message: 'untrusted response payload' }), 'unknown error');
});


const privateRuntimeIds = [
  'neon',
  'opensea',
  'github-mcp',
  'identity',
  'neural',
  'ai-providers',
];

const integrationRows = [
  ...privateRuntimeIds.map((id) => ({
    id, name: id, category: 'test', status: 'not-observable',
    detail: 'Private runtime configuration is not exposed.',
    publicUrl: 'https://example.test/',
  })),
  {
    id: 'cloudflare-worker', name: 'Cloudflare Workers', category: 'compute',
    status: 'responding', detail: 'This request reached the Worker.',
    publicUrl: 'https://developers.cloudflare.com/workers/',
  },
  {
    id: 'railway', name: 'Railway', category: 'compute', status: 'disabled',
    detail: 'Not a production runtime.', publicUrl: 'https://railway.app/',
  },
  {
    id: 'vercel', name: 'Vercel', category: 'frontend', status: 'disabled',
    detail: 'Not a production frontend.', publicUrl: 'https://vercel.com/',
  },
  {
    id: 'netlify-preview', name: 'Netlify previews', category: 'ci-preview',
    status: 'configured', detail: 'Configured for preview-only builds.',
    publicUrl: 'https://www.netlify.com/',
  },
  {
    id: 'netlify-production', name: 'Netlify production', category: 'frontend',
    status: 'disabled', detail: 'Not a production frontend.',
    publicUrl: 'https://www.netlify.com/',
  },
];

const integrationRegistry = {
  ok: true,
  policy: {
    secretsExposed: false,
    privateCredentialsReturned: false,
    privateRuntimeConfigurationIsNotExposed: true,
  },
  integrations: integrationRows,
};

const dataRows = integrationRows.map((item) => ({
  ...item,
  configurationStatus: item.status === 'responding' || item.status === 'not-observable'
    ? 'not-observable'
    : item.status,
  verificationStatus: 'not-verified',
  verificationEvidence: null,
  truthRule: 'Only qualifying external evidence may change verificationStatus to verified.',
}));

const dataStatus = {
  ok: true,
  policy: {
    verifiedMeansEvidenceBacked: true,
    configuredDoesNotMeanVerified: true,
    estimatedDoesNotMeanVerified: true,
    humanFinalAuthority: true,
    privateRuntimeConfigurationIsNotExposed: true,
  },
  summary: {
    total: dataRows.length,
    verified: 0,
    notVerified: dataRows.length,
    configured: 1,
    needsConfiguration: 0,
    notObservable: dataRows.filter((item) => item.configurationStatus === 'not-observable').length,
  },
  data: dataRows,
};

test('production integration registry exposes only the reviewed static, non-secret contract', () => {
  assert.equal(validateIntegrationRegistry(integrationRegistry).length, integrationRows.length);
  assert.throws(() => validateIntegrationRegistry({
    ...integrationRegistry,
    integrations: integrationRows.map((item) =>
      item.id === 'neon' ? { ...item, status: 'configured' } : item),
  }), /private runtime integration/);
  assert.throws(() => validateIntegrationRegistry({
    ...integrationRegistry,
    integrations: integrationRows.map((item) =>
      item.id === 'opensea' ? { ...item, apiKey: 'must-not-be-returned' } : item),
  }), /private fields/);
  assert.throws(() => validateIntegrationRegistry({
    ...integrationRegistry,
    integrations: integrationRows.map((item) =>
      item.id === 'opensea'
        ? { ...item, metadata: { providers: [{ runtimeToken: 'nested-secret' }] } }
        : item),
  }), /private fields/);
});

test('production data-status keeps every source not-verified and summaries exact', () => {
  assert.equal(validateDataStatus(dataStatus).length, dataRows.length);
  assert.throws(() => validateDataStatus({
    ...dataStatus,
    data: dataRows.map((item) =>
      item.id === 'neon' ? { ...item, verificationStatus: 'verified' } : item),
  }), /must remain not-verified/);
  assert.throws(() => validateDataStatus({
    ...dataStatus,
    summary: { ...dataStatus.summary, notObservable: 0 },
  }), /notObservable summary/);
});


test('production read-model smoke fetches both deployed GET endpoints and validates their responses', async () => {
  const requests = [];
  const fetchRequest = async (url, options) => {
    requests.push({
      pathname: new URL(url).pathname,
      method: options?.method || 'GET',
    });
    const body = new URL(url).pathname === '/api/integrations'
      ? integrationRegistry
      : dataStatus;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await verifyPublicReadModels(fetchRequest);
  assert.deepEqual(requests, [
    { pathname: '/api/integrations', method: 'GET' },
    { pathname: '/api/data-status', method: 'GET' },
  ]);
  assert.deepEqual(result, {
    integrations: integrationRows.length,
    dataRows: dataRows.length,
  });
});

test('production read-model smoke fails closed when either deployed endpoint is unavailable', async () => {
  let dataStatusAttempts = 0;
  const fetchRequest = async (url) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/api/integrations') {
      return new Response(JSON.stringify(integrationRegistry), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    dataStatusAttempts += 1;
    return new Response(JSON.stringify({ ok: false, code: 'NOT_FOUND' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await assert.rejects(verifyPublicReadModels(fetchRequest), /HTTP 404/);
  assert.equal(dataStatusAttempts, 1, 'a deterministic 404 must not be retried');
});


const buildInfo = {
  ok: true,
  status: 'source-provenance-verified',
  repository: 'https://github.com/GLORIFIER7/GLORIFIER',
  git: {
    commit: 'a'.repeat(40),
    ref: 'refs/heads/main',
    runId: '41429999999',
  },
  worker: {
    versionId: '1acafc15-ead8-431e-8813-d51ea11da51f',
    versionTag: 'main',
    versionTimestamp: '2026-11-03T06:23:28.838Z',
  },
};

test('build-info accepts exact main-branch source and Worker version provenance', () => {
  assert.equal(validateBuildInfo(buildInfo, 'a'.repeat(40)).worker.versionId, buildInfo.worker.versionId);
});

test('build-info rejects missing, malformed, wrong-branch, or mismatched provenance', () => {
  assert.throws(() => validateBuildInfo(buildInfo, undefined), /expected Git commit SHA/);
  assert.throws(() => validateBuildInfo({ ...buildInfo, git: { ...buildInfo.git, commit: 'bad' } }, 'a'.repeat(40)), /40-character/);
  assert.throws(() => validateBuildInfo({ ...buildInfo, git: { ...buildInfo.git, ref: 'refs/heads/feature' } }, 'a'.repeat(40)), /refs\/heads\/main/);
  assert.throws(() => validateBuildInfo(buildInfo, 'b'.repeat(40)), /does not match the expected commit/);
  assert.throws(
    () => validateBuildInfo(buildInfo, 'b'.repeat(40)),
    (error) => {
      assert.equal(error.name, 'AssertionError');
      assert.equal(formatSmokeFailure(error), 'assertion failed');
      return true;
    },
    'a production source-commit mismatch must remain distinguishable from an unexpected smoke-test crash',
  );
  assert.throws(() => validateBuildInfo({ ...buildInfo, worker: { ...buildInfo.worker, versionId: 'not-a-uuid' } }, 'a'.repeat(40)), /Worker version ID/);
  assert.throws(() => validateBuildInfo({
    ...buildInfo,
    git: { ...buildInfo.git, commit: 'a'.repeat(39) + 'Ａ' },
  }, 'a'.repeat(40)), /40-character/);
  assert.throws(() => validateBuildInfo(buildInfo, 'a'.repeat(39) + 'Ａ'), /40-character/);
  assert.throws(() => validateBuildInfo({
    ...buildInfo,
    git: { ...buildInfo.git, runId: '４１４２９９９９９９９' },
  }, 'a'.repeat(40)), /GitHub Actions run ID/);
  assert.throws(() => validateBuildInfo({
    ...buildInfo,
    git: { ...buildInfo.git, runId: '1'.repeat(21) },
  }, 'a'.repeat(40)), /GitHub Actions run ID/);
  assert.throws(() => validateBuildInfo({
    ...buildInfo,
    worker: { ...buildInfo.worker, versionId: '１' + buildInfo.worker.versionId.slice(1) },
  }, 'a'.repeat(40)), /Worker version ID/);
  assert.throws(() => validateBuildInfo(null, 'a'.repeat(40)), /object/);
  assert.throws(() => validateBuildInfo({ ...buildInfo, git: null }, 'a'.repeat(40)), /git object/);
  assert.throws(() => validateBuildInfo({ ...buildInfo, worker: null }, 'a'.repeat(40)), /worker object/);
});

test('production build provenance uses a GET request and validates the live response', async () => {
  const requests = [];
  const result = await verifyBuildProvenance(async (url, options) => {
    requests.push({ pathname: new URL(url).pathname, method: options?.method || 'GET' });
    return new Response(JSON.stringify(buildInfo), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }, 'a'.repeat(40));

  assert.deepEqual(requests, [{ pathname: '/api/build-info', method: 'GET' }]);
  assert.equal(result.git.commit, 'a'.repeat(40));
});



test('full-stack smoke sends every probe only to the fixed public Pages origin', () => {
  const smokePath = fileURLToPath(new URL('./full-stack-smoke.mjs', import.meta.url));
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'glorifier-smoke-targets-'));
  const preloadPath = join(temporaryDirectory, 'preload.mjs');
  const capturePath = join(temporaryDirectory, 'targets.jsonl');
  const responseEntries = [
    ['https://glorifier.pages.dev/', { status: 200, type: 'text/html', body: '<!doctype html>' }],
    ['https://glorifier.pages.dev/api/health', { status: 200, type: 'application/json', body: { ok: true, status: 'worker-ready', layer: 'cloudflare-worker' } }],
    ['https://glorifier.pages.dev/api/app-state', { status: 401, type: 'application/json', body: { ok: false, code: 'AUTHENTICATION_REQUIRED' } }],
    ['https://glorifier.pages.dev/api/identity', { status: 503, type: 'application/json', body: { ok: false, status: 'not-ready', identity: { ready: false, domainConfigured: false, domainStatus: 'not-configured' } } }],
    ['https://glorifier.pages.dev/api/reports/summary', { status: 200, type: 'application/json', body: { ok: true, status: 'operational-data-observed', evidence: { exactRowCounts: true } } }],
    ['https://glorifier.pages.dev/api/runtime-verification', { status: 200, type: 'application/json', body: { ok: true, status: 'verified-for-probed-dependencies', checks: { database: { ok: true } } } }],
  ];
  try {
    writeFileSync(capturePath, '');
    const preloadSource = `
      import { appendFileSync } from 'node:fs';
      const responses = new Map(${JSON.stringify([...responseEntries].reverse())});
      const normalizeFetchInput = ${normalizeFetchInput.toString()};
      globalThis.fetch = async (input, options = {}) => {
        const { target, method } = normalizeFetchInput(input, options);
        appendFileSync(process.env.SMOKE_CAPTURE_FILE, JSON.stringify({
          target: target.href,
          method,
        }) + '\\n');
        const result = responses.get(target.href);
        if (!result) throw new Error('unexpected probe URL: ' + target.href);
        const body = typeof result.body === 'string' ? result.body : JSON.stringify(result.body);
        return new Response(body, {
          status: result.status,
          headers: { 'content-type': result.type },
        });
      };
    `;
    writeFileSync(preloadPath, preloadSource);

    const execution = spawnSync(
      process.execPath,
      ['--import', preloadPath, smokePath],
      {
        encoding: 'utf8',
        timeout: 20_000,
        env: { ...process.env, SMOKE_CAPTURE_FILE: capturePath },
      },
    );
    assert.equal(execution.error, undefined, execution.error?.message);
    assert.equal(execution.status, 0,
      `smoke process failed\\nstdout:\\n${execution.stdout}\\nstderr:\\n${execution.stderr}`);

    const requests = readFileSync(capturePath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    const assertPublicProbeTargets = (targets) => {
      for (const target of targets) {
        const url = new URL(target);
        assert.notEqual(url.hostname, 'glorifier.glorifier.workers.dev',
          'smoke targets must not use the internal Worker hostname');
        assert.equal(url.origin, 'https://glorifier.pages.dev', `unexpected smoke target: ${url.href}`);
        assert.equal(url.username, '', 'smoke targets must not embed credentials');
        assert.equal(url.password, '', 'smoke targets must not embed credentials');
      }
    };

    assert.equal(requests.length, responseEntries.length, 'every expected probe must execute exactly once');
    assert.deepEqual(
      requests.map(({ target }) => target).sort(),
      responseEntries.map(([target]) => target).sort(),
      'responses must be selected by exact request URL rather than probe order',
    );
    assertPublicProbeTargets(requests.map(({ target }) => target));
    assert.ok(requests.every(({ method }) => method === 'GET'),
      'production smoke probes must remain read-only');
    assert.match(execution.stdout, /CLOUDFLARE PRODUCTION VERIFICATION PASSED/);
    assert.throws(
      () => assertPublicProbeTargets(['https://glorifier.glorifier.workers.dev/api/health']),
      /internal Worker hostname/,
    );
    assert.throws(
      () => assertPublicProbeTargets(['https://attacker.example/api/health']),
      /unexpected smoke target/,
    );
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});
