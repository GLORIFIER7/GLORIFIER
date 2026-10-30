import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isProtectedApiReadPath } from './protected-api-paths';

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

for (const path of protectedPaths) {
  assert.equal(
    isProtectedApiReadPath(path.replace(/^\/api/i, '')),
    true,
    `expected protected path to match regardless of case: ${path}`,
  );
}

for (const path of [
  '/economy/glr/intents-export',
  '/economy/glr/intent',
  '/economy/glr/intentss/intent-123',
  '/economy/glr',
  '/a2a/task',
  '/a2a/tasks-export',
  '/federated-a2a/v3/tasks-export',
  '/public/status',
]) {
  assert.equal(isProtectedApiReadPath(path), false, `unexpected protected-path match: ${path}`);
}

console.log('protected API path case-insensitivity regression tests passed');

const server = readFileSync('server.ts', 'utf8');
assert.match(
  server,
  /const protectedRead = isProtectedApiReadPath\(req\.path \|\| ''\)/,
  'the Express API middleware must use the tested protected-path matcher',
);
assert.match(
  server,
  /\(req\.method === 'GET' \|\| req\.method === 'HEAD'\) && !protectedRead/,
  'both GET and HEAD must enforce the protected-path classification',
);
assert.match(
  server,
  /return requireAuthentication\(req as any, res, next\)/,
  'protected reads and state-changing requests must continue through authentication',
);

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
  /app\\.get\\('\\/api\\/federated-a2a\\/v3\\/tasks\\/:id'[\\s\\S]*?process\\.env\\.DATABASE_URL[\\s\\S]*?await getFederatedA2ATaskFromStore[\\s\\S]*?: getFederatedA2ATask[\\s\\S]*?canAccessAgentTask/,
  'federated A2A task detail must support durable and memory-only requester-scoped reads',
);
assert.match(
  server,
  /app\\.post\\('\\/api\\/federated-a2a\\/v3\\/tasks'[\\s\\S]*?await createFederatedA2ATask[\\s\\S]*?Federated A2A v3 task persistence unavailable/,
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
