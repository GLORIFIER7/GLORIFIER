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

test('PostgreSQL grant reader has lookup-only access and sees revocation immediately', {
  skip: !process.env.DISPATCHER_TEST_DATABASE_URL,
}, async () => {
  const { Client } = await import('pg');
  const db = new Client({ connectionString: process.env.DISPATCHER_TEST_DATABASE_URL });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query(`INSERT INTO public.glorifier_autopilot_missions
      (id, requester, idempotency_key, status, payload, created_at, updated_at)
      VALUES ($1, 'github:32674233', $1, 'blocked', '{}', now(), now())`, [request.missionId]);
    await db.query(`INSERT INTO public.digital_me_dispatcher_grants
      (mission_id, base_sha, envelope, expires_at) VALUES ($1, $2, $3, $4)`,
    [request.missionId, request.base, grant, grant.expiresAt]);
    await db.query('SET LOCAL ROLE glorifier_dispatcher_grant_reader');
    const getAuthorization = createDispatcherAuthorization(db);
    assert.equal((await getAuthorization(request))?.grantId, grant.delegationId);
    assert.equal(await getAuthorization({ ...request, base: 'c'.repeat(40) }), null);
    const { rows: [privileges] } = await db.query(`SELECT
      has_table_privilege(current_user, 'public.digital_me_dispatcher_grants', 'SELECT') AS can_read,
      has_table_privilege(current_user, 'public.digital_me_dispatcher_grants', 'UPDATE') AS can_update`);
    assert.deepEqual(privileges, { can_read: false, can_update: false });
    await db.query('RESET ROLE');
    await db.query('UPDATE public.digital_me_dispatcher_grants SET revoked_at = now() WHERE mission_id = $1', [request.missionId]);
    await db.query('SET LOCAL ROLE glorifier_dispatcher_grant_reader');
    assert.equal(await getAuthorization(request), null);
    await db.query('ROLLBACK');
  } finally {
    await db.end();
  }
});
