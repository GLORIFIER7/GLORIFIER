import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPostgresPool } from './db/postgres';
import {
  authenticateLinuxHostAgent, claimLinuxHostAgentTask, completeLinuxHostAgentTask,
  createLinuxHostAgentTask, enrollLinuxHostAgent, recordLinuxHostAgentHeartbeat, revokeLinuxHostAgent,
} from './linux-host-agent';

test('Linux host task lifecycle in PostgreSQL', async (t) => {
  const url = process.env.LINUX_HOST_TEST_DATABASE_URL;
  assert.ok(url && url !== process.env.DATABASE_URL, 'a separate LINUX_HOST_TEST_DATABASE_URL is required');
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  const pool = getPostgresPool();
  t.after(() => pool.end());

  const actor = 'host-lifecycle-test';
  const { runtimeId, token } = await enrollLinuxHostAgent({ displayName: 'Test host', architecture: 'x86_64' }, actor);
  const authorization = 'Bearer ' + token;
  const receipt = { status: 'succeeded', result: { architecture: 'x86_64' } };
  // Delete only this test host. Child rows cascade on deletion.
  try {
    assert.equal(await authenticateLinuxHostAgent(runtimeId, authorization), true);
    await recordLinuxHostAgentHeartbeat(runtimeId, {
      hostname: 'test-host', architecture: 'x86_64', distribution: 'Ubuntu',
      kernelRelease: '6.8.0', pythonVersion: '3.12.3', agentVersion: '1.0.0',
    });

    await t.test('a new lease ends by the task deadline', async () => {
      const { taskId } = await createLinuxHostAgentTask(runtimeId, 'host.info', actor);
      const { rows } = await pool.query(
        "UPDATE linux_agent_tasks SET expires_at = NOW() + INTERVAL '20 seconds' WHERE id = $1 RETURNING expires_at",
        [taskId],
      );
      const claim = await claimLinuxHostAgentTask(runtimeId);
      assert.equal(claim?.taskId, taskId);
      assert.equal(claim.leaseUntil, rows[0].expires_at.toISOString());
      assert.equal((await completeLinuxHostAgentTask(runtimeId, taskId, claim.leaseToken, receipt)).status, 'succeeded');
    });

    await t.test('an expired task with an older outstanding lease rejects receipts and expires on polling', async () => {
      const { taskId } = await createLinuxHostAgentTask(runtimeId, 'host.info', actor);
      const claim = await claimLinuxHostAgentTask(runtimeId);
      assert.equal(claim?.taskId, taskId);
      await pool.query("UPDATE linux_agent_tasks SET expires_at = NOW() - INTERVAL '1 second' WHERE id = $1", [taskId]);
      await assert.rejects(completeLinuxHostAgentTask(runtimeId, taskId, claim.leaseToken, receipt), /lease has expired/);
      assert.equal(await claimLinuxHostAgentTask(runtimeId), null);
      const { rows } = await pool.query('SELECT status, lease_token_sha256 FROM linux_agent_tasks WHERE id = $1', [taskId]);
      assert.deepEqual(rows[0], { status: 'expired', lease_token_sha256: null });
    });

    await t.test('reclaim rotates the lease and revocation invalidates the new claim and credential', async () => {
      const { taskId } = await createLinuxHostAgentTask(runtimeId, 'host.info', actor);
      const first = await claimLinuxHostAgentTask(runtimeId);
      assert.equal(first?.taskId, taskId);
      await pool.query("UPDATE linux_agent_tasks SET lease_until = NOW() - INTERVAL '1 second' WHERE id = $1", [taskId]);
      const second = await claimLinuxHostAgentTask(runtimeId);
      assert.equal(second?.taskId, taskId);
      assert.notEqual(second.leaseToken, first.leaseToken);
      await assert.rejects(completeLinuxHostAgentTask(runtimeId, taskId, first.leaseToken, receipt), /lease has expired/);
      assert.equal(await revokeLinuxHostAgent(runtimeId, actor), true);
      assert.equal(await authenticateLinuxHostAgent(runtimeId, authorization), false);
      await assert.rejects(completeLinuxHostAgentTask(runtimeId, taskId, second.leaseToken, receipt), /revoked/);
      await assert.rejects(claimLinuxHostAgentTask(runtimeId), /not online/);
    });
  } finally {
    await pool.query('DELETE FROM linux_runtime_registry WHERE id = $1', [runtimeId]);
  }
});
