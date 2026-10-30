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
  '/api/a2a/tasks',
  '/api/federated-a2a/v3/tasks',
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
  /app\.get\('\/api\/a2a\/tasks'[\s\S]*?filterAgentTasksByRequester\(listA2ATasks\(\), requesterUid, mayReadAllTasks\)/,
  'legacy A2A task listing must be scoped to the authenticated requester',
);
assert.match(
  server,
  /app\.get\('\/api\/federated-a2a\/v3\/tasks'[\s\S]*?filterAgentTasksByRequester\(listFederatedA2ATasks\(\), requesterUid, mayReadAllTasks\)/,
  'federated A2A task listing must be scoped to the authenticated requester',
);
assert.match(
  server,
  /app\.post\('\/api\/federated-a2a\/v3\/tasks'[\s\S]*?resolveAgentTaskRequester\(requesterUid, body\.requesterAgentId, mayOverrideRequester\)/,
  'federated A2A requester identity must be derived from authenticated context',
);
assert.match(
  server,
  /app\.post\('\/api\/a2a\/tasks', requireOwnerOrInternalService[\s\S]*?const humanApproved = Boolean\(auth && isOwner\(auth\)/,
  'legacy A2A execution approval must be bound to an authenticated owner, not a request-body string alone',
);
