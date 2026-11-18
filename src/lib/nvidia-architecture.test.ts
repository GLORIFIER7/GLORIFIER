import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getNVIDIAArchitecturePolicy,
  getNVIDIAArchitectureSnapshot,
} from './nvidia-architecture.js';

test('Megatron is an optional training plane, separate from inference', () => {
  const snapshot = getNVIDIAArchitectureSnapshot({});

  assert.ok(snapshot.planes.training.includes(
    'NVIDIA Megatron Core (optional distributed model training)',
  ));
  assert.ok(!snapshot.planes.inference.includes(
    'NVIDIA Megatron Core (optional distributed model training)',
  ));
  assert.equal(snapshot.components.megatron.configured, false);
  assert.equal(snapshot.components.megatron.verified, false);
});

test('Megatron requires an explicit enablement declaration and is never self-verified', () => {
  for (const value of ['', 'false', 'yes', '1']) {
    const snapshot = getNVIDIAArchitectureSnapshot({
      NVIDIA_MEGATRON_ENABLED: value,
    });
    assert.equal(snapshot.components.megatron.configured, false);
    assert.equal(snapshot.components.megatron.verified, false);
  }

  const enabled = getNVIDIAArchitectureSnapshot({
    NVIDIA_MEGATRON_ENABLED: 'TRUE',
  });
  assert.equal(enabled.components.megatron.configured, true);
  assert.equal(enabled.components.megatron.verified, false);
});

test('Megatron training policy requires authorization and checkpoint evaluation', () => {
  const policy = getNVIDIAArchitecturePolicy();

  assert.match(policy.trainingExecutionRule, /explicit owner authorization/);
  assert.match(policy.checkpointPromotionRule, /provenance, integrity, security, quality/);
});
