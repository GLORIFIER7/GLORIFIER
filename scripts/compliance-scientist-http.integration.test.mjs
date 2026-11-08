import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const internalToken = 'glorifier-compliance-http-test-token';

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const { port } = address;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function isolatedServerEnvironment(port) {
  const env = { ...process.env };
  // Prevent this test process from inheriting credentials or live service endpoints.
  // The only credential deliberately supplied is the test-only internal service token.
  const sensitive = /(?:API_KEY|ACCESS_TOKEN|CLIENT_SECRET|SERVICE_ACCOUNT|DATABASE_URL|POSTGRES|NEON|SUPABASE|AUTH0|FIREBASE|GEMINI|OPENAI|ANTHROPIC|NVIDIA|OLLAMA|OPENROUTER|GROQ|MISTRAL|DEEPSEEK|COHERE|NEURAL|CLOUDFLARE)/i;
  for (const key of Object.keys(env)) {
    if (sensitive.test(key)) delete env[key];
  }
  return {
    ...env,
    PORT: String(port),
    NODE_ENV: 'production',
    GLORIFIER_INTERNAL_SERVICE_TOKEN: internalToken,
  };
}

async function waitForHealth(baseUrl, child, getOutput) {
  const deadline = Date.now() + 60_000;
  let lastError = 'health endpoint did not become ready';
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`server exited before becoming healthy: ${getOutput()}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.status === 200) return;
      lastError = `health returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(250);
  }
  throw new Error(`server did not become healthy: ${lastError}; output: ${getOutput()}`);
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, 'exit').catch(() => undefined);
  child.kill('SIGTERM');
  const stopped = await Promise.race([exit.then(() => true), delay(12_000).then(() => false)]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await exit;
  }
}

test('compliance endpoint enforces authentication and fails closed over HTTP when providers are absent', { timeout: 90_000 }, async (t) => {
  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['--import', 'tsx/esm', 'server.ts'], {
    cwd: process.cwd(),
    env: isolatedServerEnvironment(port),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  const append = (chunk) => {
    output = (output + chunk.toString()).slice(-12_000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  t.after(() => stopServer(child));

  await waitForHealth(baseUrl, child, () => output);

  const unauthenticated = await fetch(`${baseUrl}/api/ai/compliance-scientist`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: 'HTTP integration test: do not contact a provider.' }),
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(unauthenticated.status, 401, 'an unauthenticated compliance request must be rejected before provider execution');

  const authenticatedButUnconfigured = await fetch(`${baseUrl}/api/ai/compliance-scientist`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-glorifier-internal-token': internalToken,
    },
    body: JSON.stringify({ prompt: 'HTTP integration test: no provider credentials are configured.' }),
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(authenticatedButUnconfigured.status, 503, 'a request with no configured provider must fail closed, not fabricate a response');

  const body = await authenticatedButUnconfigured.json();
  assert.equal(body.success, false);
  assert.match(body.error, /no analysis was generated/i);
  assert.doesNotMatch(JSON.stringify(body), /legal conclusion was reached|compliance verified|audit completed/i);
});
