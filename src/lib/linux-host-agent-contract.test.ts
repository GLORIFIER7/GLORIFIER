import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canonicalizeLinuxHostAgentJson,
  isLinuxHostAgentAction,
  isValidLinuxHostAgentToken,
  isSafeLinuxHostRuntimeId,
  isSafeLinuxHostTaskId,
  normalizeLinuxHostHeartbeat,
  normalizeLinuxHostTaskResult,
  parseLinuxHostAgentBearerToken,
  validateLinuxHostEnrollment,
} from './linux-host-agent-contract';

test('Linux host-agent contract rejects arbitrary commands and unsupported actions', () => {
  assert.equal(isLinuxHostAgentAction('host.info'), true);
  assert.equal(isLinuxHostAgentAction('memory.info'), true);
  assert.equal(isLinuxHostAgentAction('disk.info'), true);
  assert.equal(isLinuxHostAgentAction('shell.exec'), false);
  assert.equal(isLinuxHostAgentAction('sudo rm -rf /'), false);
  assert.equal(isLinuxHostAgentAction('*'), false);
});

test('Linux host-agent contract accepts only generated runtime and task identifiers', () => {
  assert.equal(isSafeLinuxHostRuntimeId('linux-123e4567-e89b-42d3-a456-426614174000'), true);
  assert.equal(isSafeLinuxHostRuntimeId('linux-../../etc/passwd'), false);
  assert.equal(isSafeLinuxHostTaskId('linux-task-123e4567-e89b-42d3-a456-426614174000'), true);
  assert.equal(isSafeLinuxHostTaskId('linux-task-../../etc/passwd'), false);
});

test('Linux host-agent contract accepts only a 256-bit bearer token encoding', () => {
  const token = 'a'.repeat(43);
  assert.equal(parseLinuxHostAgentBearerToken('Bearer ' + token), token);
  assert.equal(parseLinuxHostAgentBearerToken('bearer ' + token), null);
  assert.equal(parseLinuxHostAgentBearerToken('Bearer short'), null);
  assert.equal(parseLinuxHostAgentBearerToken(undefined), null);
  assert.equal(isValidLinuxHostAgentToken(token), true);
  assert.equal(isValidLinuxHostAgentToken('short'), false);
});

test('Linux host-agent enrollment validates display name and architecture', () => {
  assert.deepEqual(validateLinuxHostEnrollment({ displayName: 'Production node', architecture: 'x86_64' }), {
    displayName: 'Production node',
    architecture: 'x86_64',
  });
  assert.throws(() => validateLinuxHostEnrollment({ displayName: 'bad\nname', architecture: 'x86_64' }));
  assert.throws(() => validateLinuxHostEnrollment({ displayName: 'Node', architecture: '../arm64' }));
});

test('Linux host-agent heartbeat validates bounded platform facts', () => {
  const heartbeat = normalizeLinuxHostHeartbeat({
    agentVersion: '1.0.0',
    hostname: 'worker-01',
    distribution: 'Debian GNU/Linux 12 (bookworm)',
    kernelRelease: '6.8.0-45-generic',
    architecture: 'x86_64',
    pythonVersion: '3.12.3',
  });
  assert.equal(heartbeat.architecture, 'x86_64');
  assert.throws(() => normalizeLinuxHostHeartbeat({
    agentVersion: '1.0.0',
    hostname: 'worker\n01',
    distribution: 'ubuntu',
    kernelRelease: '6.8.0',
    architecture: 'x86_64',
    pythonVersion: '3.12.3',
  }));
});

test('Linux host-agent heartbeat accepts Python prerelease version strings', () => {
  const heartbeat = normalizeLinuxHostHeartbeat({
    agentVersion: '1.0.0',
    hostname: 'worker-rc',
    distribution: 'Ubuntu 24.04',
    kernelRelease: '6.8.0-generic',
    architecture: 'x86_64',
    pythonVersion: '3.13.0rc1',
  });
  assert.equal(heartbeat.pythonVersion, '3.13.0rc1');
});

test('Linux host-agent canonical JSON digest input ignores object key insertion order', () => {
  const first = { z: 1, nested: { b: true, a: 'value' }, items: [3, 2, 1] };
  const second = { items: [3, 2, 1], nested: { a: 'value', b: true }, z: 1 };
  assert.equal(canonicalizeLinuxHostAgentJson(first), canonicalizeLinuxHostAgentJson(second));
  assert.equal(canonicalizeLinuxHostAgentJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.throws(() => canonicalizeLinuxHostAgentJson({ measurement: 0.5 }), /safe integers/);
  assert.throws(() => canonicalizeLinuxHostAgentJson({ measurement: Number.MAX_SAFE_INTEGER + 1 }), /safe integers/);
});

test('Linux host-agent task results enforce bounded structured output', () => {
  assert.deepEqual(normalizeLinuxHostTaskResult({ status: 'succeeded', result: { ok: true } }), {
    status: 'succeeded',
    result: { ok: true },
  });
  assert.deepEqual(normalizeLinuxHostTaskResult({ status: 'failed', errorCode: 'probe_failed' }), {
    status: 'failed',
    errorCode: 'probe_failed',
  });
  assert.throws(() => normalizeLinuxHostTaskResult({ status: 'succeeded', result: 'not-an-object' }));
  assert.throws(() => normalizeLinuxHostTaskResult({ status: 'failed', errorCode: 'leaked-secret' }));
  assert.throws(() => normalizeLinuxHostTaskResult({
    status: 'succeeded',
    result: { payload: 'x'.repeat(16_385) },
  }));
});
