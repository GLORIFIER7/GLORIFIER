import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isProtectedApiReadPath, shouldBypassApiAuthentication } from './protected-api-paths';
import { test } from 'node:test';

const protectedPaths = [
  '/api/economy/glr/intents',
  '/API/ECONOMY/GLR/INTENTS',
  '/api/Economy/glr/intents/intent-123',
  '/API/economy/GLR/INTENTS/intent-123',
  '/api/economy/glr/intents/intent-123/',
  '/api/payouts',
  '/api/agents/tasks',
  '/API/AGENTS/TASKS/task-123',
  '/api/a2a/tasks',
  '/api/federated-a2a/v3/tasks',
  '/api/a2a/tasks',
  '/API/A2A/TASKS/task-123',
  '/API/AUTH/SESSION',
];

const unprotectedPaths = [
  '/economy/glr/intents-export',
  '/economy/glr/intent',
  '/economy/glr/intentss/intent-123',
  '/economy/glr',
  '/a2a/task',
  '/a2a/tasks-export',
  '/federated-a2a/v3/tasks-export',
  '/public/status',
];

const authenticationBypassCases: Array<[string, string, boolean]> = [
  ['OPTIONS', '/public/status', true],
  ['GET', '/public/status', true],
  ['HEAD', '/public/status', true],
  ['GET', '/economy/glr/intents/intent-123', false],
  ['HEAD', '/A2A/TASKS/task-123', false],
  ['POST', '/public/status', false],
  ['PUT', '/public/status', false],
  ['DELETE', '/public/status', false],
];

const server = readFileSync('server.ts', 'utf8');

void test('protected API path matching is case-insensitive and exact', () => {
  for (const path of protectedPaths) {
    assert.equal(
      isProtectedApiReadPath(path.replace(/^\/api/i, '')),
      true,
      `expected protected path to match regardless of case: ${path}`,
    );
  }

  for (const path of unprotectedPaths) {
    assert.equal(isProtectedApiReadPath(path), false, `unexpected protected-path match: ${path}`);
  }
});

void test('only safe public read methods bypass API authentication', () => {
  for (const [method, pathname, expected] of authenticationBypassCases) {
    assert.equal(
      shouldBypassApiAuthentication(method, pathname),
      expected,
      `unexpected authentication bypass decision for ${method} ${pathname}`,
    );
  }
});

void test('Express API middleware enforces the tested authentication policy', () => {
  assert.match(
    server,
    /if \(shouldBypassApiAuthentication\(req\.method, req\.path \|\| ''\)\) return next\(\)/,
    'the Express API middleware must use the tested authentication bypass policy',
  );
  assert.match(
    server,
    /return requireAuthentication\(req, res, next\)/,
    'protected reads and state-changing requests must continue through the typed authentication middleware',
  );
  assert.doesNotMatch(
    server,
    /return requireAuthentication\(req as any, res, next\)/,
    'the API authentication middleware must not use an unsafe any cast',
  );
});

void test('legacy and federated A2A task reads remain requester-scoped', () => {
  assert.match(
    server,
    /app\.get\('\/api\/a2a\/tasks'[\s\S]*?listA2ATasks\(50, mayReadAllTasks \? undefined : requesterUid, mayReadAllTasks\)/,
    'legacy A2A task listing must be scoped to the authenticated requester',
  );
  assert.match(
    server,
    /app\.get\('\/api\/federated-a2a\/v3\/tasks'[\s\S]*?process\.env\.DATABASE_URL[\s\S]*?await listFederatedA2ATasksFromStore\(50, mayReadAllTasks \? undefined : requesterUid, mayReadAllTasks\)[\s\S]*?: listFederatedA2ATasks\(50, mayReadAllTasks \? undefined : requesterUid, mayReadAllTasks\)/,
    'federated A2A task listing must be scoped to the authenticated requester',
  );
  assert.match(
    server,
    /app\.get\('\/api\/federated-a2a\/v3\/tasks\/:id'[\s\S]*?process\.env\.DATABASE_URL[\s\S]*?await getFederatedA2ATaskFromStore[\s\S]*?: getFederatedA2ATask[\s\S]*?canAccessAgentTask/,
    'federated A2A task detail must support durable and memory-only requester-scoped reads',
  );
});

void test('agent and federated A2A task writes preserve owner attribution and durable failure handling', () => {
  assert.match(
    server,
    /app\.post\('\/api\/federated-a2a\/v3\/tasks'[\s\S]*?await createFederatedA2ATask[\s\S]*?Federated A2A v3 task persistence unavailable/,
    'federated A2A creation must await durable persistence and report write failures',
  );
  assert.match(
    server,
    /app\.get\('\/api\/agents\/tasks'[\s\S]*?listAgentTasks\(50, mayReadAllTasks \? undefined : requesterUid, mayReadAllTasks\)/,
    'agent task listing must pass an explicit owner/internal-service grant for unscoped reads',
  );
  assert.match(
    server,
    /app\.post\('\/api\/agents\/tasks'[\s\S]*?const defaultRequester = requestedRequester \?\? \(internalServiceRequest \? 'glorifier-internal-service' : 'human-owner'\)/,
    'internal agent task creation must be attributed to the internal service when no requester is supplied',
  );
  assert.match(
    server,
    /app\.post\('\/api\/federated-a2a\/v3\/tasks'[\s\S]*?const requestedRequester = body\.requesterAgentId \?\? \(isInternalServiceRequest\(req\) \? 'glorifier-internal-service' : undefined\)[\s\S]*?resolveAgentTaskRequester\(requesterUid, requestedRequester, mayOverrideRequester\)/,
    'federated A2A requester identity must be derived from authenticated context',
  );
  assert.match(
    server,
    /app\.post\('\/api\/a2a\/tasks', async[\s\S]*?const humanApproved = isAuthorizedA2AExecution\(Boolean\(auth && isOwner\(auth\)\), body\.approval\)/,
    'legacy A2A execution approval must be bound to an authenticated owner, not a request-body string alone',
  );
  assert.match(
    server,
    /app\.post\('\/api\/a2a\/tasks', async[\s\S]*?resolveAgentTaskRequester\(requesterUid, requestedRequester, mayOverrideRequester\)/,
    'legacy A2A requester identity must be derived from authenticated context',
  );
});
