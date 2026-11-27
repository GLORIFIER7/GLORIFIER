import assert from 'node:assert/strict';
import test from 'node:test';
import type { Pool } from 'pg';
import { createDispatcherAuthorization } from './digital-me-dispatcher-authority';

const missionHash = 'a'.repeat(64);
const request = {
  repository: 'GLORIFIER7/GLORIFIER',
  missionId: `mission-coding-${missionHash}`,
  base: 'b'.repeat(40),
};
const grant = {
  repository: request.repository,
  delegationId: `digital-me-grant-${missionHash}`,
  contextId: request.missionId,
  base: request.base,
  recipeId: 'reviewed-recipe',
  delegator: 'github:32674233',
  principal: 'digital-me',
  capabilities: ['digital-me.prepare-repair', 'digital-me.publish-draft'],
  resourceScopes: [request.repository],
  dataScopes: ['public-source'],
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  revocable: true,
  humanApprovalRequired: false,
  maxRisk: 'low',
  maxValue: 0,
  currency: 'USD',
};

function fixture(envelope: unknown) {
  const calls: Array<{ sql: string; values: string[] }> = [];
  let current = envelope;
  const database = {
    async query(sql: string, values: string[]) {
      calls.push({ sql, values });
      return { rows: [{ envelope: current }] };
    },
  } as Pick<Pool, 'query'>;
  return {
    calls,
    getAuthorization: createDispatcherAuthorization(database),
    setEnvelope(envelope: unknown) { current = envelope; },
  };
}

test('queries the scoped GEAS lookup and rechecks revocation on each call', async () => {
  const { getAuthorization, setEnvelope, calls } = fixture(grant);
  assert.deepEqual(await getAuthorization(request), {
    ...request,
    recipeId: grant.recipeId,
    grantId: grant.delegationId,
    revoked: false,
    executionAuthorized: true,
    publicationAuthorized: true,
    maximumCostMicrousd: 0,
    expiresAt: grant.expiresAt,
  });
  setEnvelope(null);
  assert.equal(await getAuthorization(request), null);
  assert.deepEqual(calls, Array(2).fill({
    sql: 'SELECT public.read_digital_me_dispatcher_grant($1, $2) AS envelope',
    values: [request.missionId, request.base],
  }));
});

test('rejects unscoped requests before accessing the database', async () => {
  const { getAuthorization, calls } = fixture(grant);
  assert.equal(await getAuthorization({ ...request, repository: 'another/repo' }), null);
  assert.equal(await getAuthorization({ ...request, missionId: 'generic-mission' }), null);
  assert.equal(await getAuthorization({ ...request, base: 'main' }), null);
  assert.equal(calls.length, 0);
});

test('denies drift from exact mission authority', async () => {
  const patches = [
    { delegationId: 'another-grant' },
    { contextId: 'another-mission' },
    { base: 'c'.repeat(40) },
    { delegator: 'agent' },
    { principal: 'another-agent' },
    { parentDelegationId: 'ambient-authority' },
    { revokedAt: grant.expiresAt },
    { maxValue: 0.01 },
    { revocable: false },
    { humanApprovalRequired: true },
    { recipeId: '*' },
    { expiresAt: 'invalid-date' },
    { expiresAt: '2000-01-01T00:00:00Z' },
    { resourceScopes: ['*'] },
    { dataScopes: ['public-source', 'secrets'] },
    { capabilities: ['digital-me.prepare-repair'] },
    { capabilities: [...grant.capabilities, 'github.merge'] },
  ];
  for (const patch of patches) {
    assert.equal(await fixture({ ...grant, ...patch }).getAuthorization(request), null, JSON.stringify(patch));
  }
});
