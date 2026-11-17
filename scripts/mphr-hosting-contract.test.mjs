import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const vercel = JSON.parse(read('vercel.json'));
const manifest = JSON.parse(read('package.json'));

test('Vercel builds the original Vite React application into the canonical dist directory', () => {
  assert.equal(vercel.framework, 'vite');
  assert.equal(vercel.buildCommand, 'npm run build:frontend');
  assert.equal(vercel.installCommand, 'npm ci --no-audit --no-fund');
  assert.equal(vercel.outputDirectory, 'dist');
  assert.equal(manifest.scripts?.['build:frontend'], 'vite build');
});

test('Vercel forwards only documented runtime paths to the current Cloudflare Pages API front door', () => {
  const rewrites = vercel.rewrites;
  assert.ok(Array.isArray(rewrites));
  const expected = [
    ['/api', 'https://glorifier.pages.dev/api'],
    ['/api/:path*', 'https://glorifier.pages.dev/api/:path*'],
    ['/auth', 'https://glorifier.pages.dev/auth'],
    ['/auth/:path*', 'https://glorifier.pages.dev/auth/:path*'],
    ['/mcp', 'https://glorifier.pages.dev/mcp'],
    ['/mcp/:path*', 'https://glorifier.pages.dev/mcp/:path*'],
    ['/.well-known/agent-card.json', 'https://glorifier.pages.dev/.well-known/agent-card.json'],
  ];
  for (const [source, destination] of expected) {
    assert.ok(rewrites.some((item) => item.source === source && item.destination === destination),
      source + ' must retain the approved Cloudflare runtime route');
  }
  assert.equal(rewrites.at(-1)?.source, '/(.*)',
    'the SPA fallback must be last so it cannot shadow API/auth/MCP routing');
  assert.equal(rewrites.at(-1)?.destination, '/index.html');
  assert.ok(!JSON.stringify(vercel).includes('railway.app'),
    'the Vercel frontend standby must not restore the retired Railway API origin');
});

test('Cloudflare Pages and Vercel serve the same explicit restrictive CSP policy', () => {
  const vercelHeaders = vercel.headers?.find((entry) => entry.source === '/(.*)')?.headers;
  const vercelCsp = vercelHeaders?.find((entry) => entry.key === 'Content-Security-Policy')?.value;
  const cloudflareHeaders = read('public/_headers');
  assert.ok(vercelCsp, 'Vercel must set a CSP header on frontend routes');
  assert.match(vercelCsp, /default-src 'self'/);
  assert.match(vercelCsp, /script-src 'self'/);
  assert.doesNotMatch(vercelCsp, /script-src[^;]*unsafe-inline/);
  assert.match(vercelCsp, /object-src 'none'/);
  assert.match(vercelCsp, /frame-ancestors 'none'/);
  assert.match(cloudflareHeaders, /Content-Security-Policy:/);
  assert.ok(cloudflareHeaders.includes(vercelCsp),
    'Cloudflare Pages and Vercel must use the same CSP policy');
});

test('the frontend container is non-root and reports static availability separately from backend readiness', () => {
  const dockerfile = read('Dockerfile.frontend');
  const server = read('scripts/serve-frontend.mjs');
  assert.match(dockerfile, /FROM node:24-trixie-slim AS build/);
  assert.match(dockerfile, /npm run build:frontend/);
  assert.match(dockerfile, /USER node/);
  assert.match(dockerfile, /EXPOSE 8080/);
  assert.match(dockerfile, /\/healthz/);
  assert.match(server, /BACKEND_NOT_CONFIGURED/);
  assert.match(server, /backend:\s*'not-probed'/);
  assert.match(server, /STATIC_ASSET_NOT_FOUND/);
});


test('the shared Docker build context excludes local secrets and unnecessary state', () => {
  const dockerignore = read('.dockerignore');
  for (const required of [
    '.env',
    '.env.*',
    '.npmrc',
    '**/.npmrc',
    '*.pem',
    '*.key',
    '*.p12',
    '*.pfx',
    'secrets/',
    'credentials/',
    'node_modules',
    '.git',
  ]) {
    assert.ok(dockerignore.split('\n').some((line) => line.trim() === required),
      '.dockerignore must exclude ' + required);
  }
});

test('the test and build commands are exposed through package.json', () => {
  assert.equal(manifest.scripts?.['start:frontend'], 'node scripts/serve-frontend.mjs');
  assert.equal(manifest.scripts?.['test:frontend-static-server'],
    'node --test scripts/frontend-static-server.test.mjs');
  assert.equal(manifest.scripts?.['test:mphr-hosting'],
    'npm run test:frontend-static-server && node --test scripts/mphr-hosting-contract.test.mjs');
});

test('MPHR validation workflow verifies but never deploys or changes production traffic', () => {
  const workflow = read('.github/workflows/mphr-hosting.yml');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /npm run test:mphr-hosting/);
  assert.match(workflow, /docker build .*Dockerfile\.frontend/s);
  assert.match(workflow, /docker run .*glorifier\/frontend-mphr/s);
  assert.doesNotMatch(workflow, /wrangler deploy(?! --dry-run)/);
  assert.doesNotMatch(workflow, /vercel deploy|vercel --prebuilt|docker push|docker login/i);
  assert.match(workflow, /permissions:\s*contents:\s*read/);
});

test('Cloudflare production promotion remains an explicit protected action', () => {
  const workflow = read('.github/workflows/cloudflare-worker.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /deploy_production:/);
  assert.match(workflow, /inputs\.deploy_production == true/);
  assert.match(workflow, /vars\.CLOUDFLARE_DEPLOY_ENABLED == 'true'/);
  assert.match(workflow, /environment: production/);
});

test('public documentation distinguishes the hosting design from live deployment evidence', () => {
  const architecture = read('docs/architecture/geas-multi-provider-hosting-resilience.md');
  const readme = read('README.md');
  const legacy = read('docs/architecture/cloudflare-workers-only-migration.md');
  assert.match(readme, /GEAS.*Multi-Provider Hosting Resilience|Multi-Provider Hosting Resilience/);
  assert.match(architecture, /Automatic traffic failover: NOT ENABLED/);
  assert.match(architecture, /Vercel project: NOT LINKED/);
  assert.match(architecture, /Docker frontend runtime: NOT DEPLOYED/);
  assert.match(architecture, /backend.*Cloudflare/i);
  assert.match(legacy, /Superseded by GEAS MPHR/i);
});
