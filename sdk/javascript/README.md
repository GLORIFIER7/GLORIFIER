# GLORIFIER JavaScript / TypeScript SDK

A server-side Node.js client for the versioned GLORIFIER Neural HTTPS/JSON API. The package ships an ECMAScript module plus TypeScript declarations; it does not expose caller tokens to browser bundles.

## Requirements

- Node.js 24.12.0 or newer (uses the built-in Fetch API).
- No runtime dependencies.

## Install and use

```sh
npm install @glorifier7/neural-sdk
```

```js
import { GlorifierNeuralClient } from '@glorifier7/neural-sdk';

const client = new GlorifierNeuralClient({
  baseUrl: 'https://glorifier.glorifier.workers.dev',
  token: process.env.GLORIFIER_API_TOKEN,
});

const health = await client.health();
const readiness = await client.ready();

// A non-2xx response is returned with its original HTTP status. In particular,
// readiness HTTP 503 remains a not-ready observation and is never rewritten as success.
if (!readiness.ok) {
  console.log(`Neural readiness: HTTP ${readiness.status}`);
}

const task = await client.submitTask({
  task: 'Inspect the public interoperability contract',
  purpose: 'general',
  require_approval: true,
  action_class: 'read_only',
});
console.log(task.status, task.body);
```

## Security and wire behavior

- HTTPS is mandatory except for explicitly enabled loopback-only HTTP development tests.
- The canonical Worker origin is allowed by default. Other destinations require exact HTTPS origin allowlisting; paths, credentials, queries and fragments are rejected.
- Bearer tokens are attached only to `POST /api/neural/v1/tasks`, never to health or readiness probes.
- Redirects are not followed. Task submissions are not automatically retried because the current API has no idempotency key.
- Task JSON is limited to 65,536 UTF-8 bytes; task text is limited to 20,000 Unicode code points.
- Response bodies are limited to 1 MiB. Requests have a bounded timeout (default 8 seconds; maximum 60 seconds).
- Stable HTTP status, correlation ID and Retry-After metadata are returned to callers. Invalid UTF-8/JSON and oversized responses raise `GlorifierApiError`.
- No provider credentials, wallet keys, blockchain-write capabilities, or governance bypasses are provided.

## Conformance

Run the dependency-free test suite with:

```sh
node --test sdk/javascript/test/*.test.mjs
```

Tests use an injected Fetch implementation and local `Response` objects. They verify client-side wire/security invariants but do not establish live Neural connectivity, provider readiness, deployment health, or A2A/MCP certification.
