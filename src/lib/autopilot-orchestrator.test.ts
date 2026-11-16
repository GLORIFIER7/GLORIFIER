import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { validateAutopilotPlan, isAutopilotInferenceAuthorized, isAutopilotRepositoryFreeInferenceAuthorized, getAutopilotRepositoryContributorPolicy, startAutopilotMissionLeaseHeartbeat, getAutopilotMaintenanceBranchName, formatAutopilotA2AContext, getAutopilotOrchestrationStatus, buildRepositoryContributionAttribution, appendRepositoryContributionAttribution } from './autopilot-orchestrator.ts';
import { authorizeCapability } from './capability-authorization.ts';
import { evaluateGeasPolicy } from './governance/geas-policy-engine.ts';

test('Autopilot accepts only bounded read-only plans using known capabilities', () => {
  const plan = validateAutopilotPlan(JSON.stringify({
    steps: [
      { id: 'inspect', capability: 'github.get_repository', objective: 'Read the configured public repository identity.', arguments: {} },
      { id: 'list-prs', capability: 'github.list_pull_requests', objective: 'Read open pull requests.', arguments: { state: 'open', per_page: 5 } },
    ],
  }));
  assert.equal(plan.length, 2);
  assert.ok(plan.every(step => step.effect === 'read-only'));
  assert.deepEqual(plan[1].toolArguments, { state: 'open', per_page: 5 });
});

test('Autopilot accepts a fenced JSON response but normalizes the plan', () => {
  const plan = validateAutopilotPlan('```json\n{"steps":[{"id":"research","capability":"github.read_file","objective":"Read repository README.","arguments":{"path":"README.md","ref":"main"}}]}\n```');
  assert.equal(plan[0].capability, 'github.read_file');
  assert.deepEqual(plan[0].toolArguments, { path: 'README.md', ref: 'main' });
});

test('Autopilot rejects writes and capabilities without a real safe executor', () => {
  assert.throws(() => validateAutopilotPlan(JSON.stringify({
    steps: [{ id: 'deploy', capability: 'deploy.production', objective: 'Deploy production.' }],
  })), /without an enabled safe executor/);
  assert.throws(() => validateAutopilotPlan(JSON.stringify({
    steps: [{ id: 'delete', capability: 'delete.resource', objective: 'Delete a resource.' }],
  })), /without an enabled safe executor/);
});

test('Autopilot fails closed when capability authorization or GEAS requires approval', () => {
  const privileged = authorizeCapability({ capability: 'deploy.production', requestedBy: 'autopilot' });
  assert.equal(privileged.allowed, false);
  assert.equal(privileged.reason, 'human_approval_required');
  const geas = evaluateGeasPolicy({
    actorType: 'agent',
    action: 'deploy.production',
    risk: 'critical',
    externallyIrreversible: true,
    evidenceVerified: false,
  });
  assert.equal(geas.decision, 'require_approval');
});

test('Autopilot rejects malformed and oversized plans', () => {
  assert.throws(() => validateAutopilotPlan('not-json'));
  assert.throws(() => validateAutopilotPlan(JSON.stringify({ steps: [] })), /between 1 and 6/);
  assert.throws(() => validateAutopilotPlan(JSON.stringify({
    steps: Array.from({ length: 7 }, (_, i) => ({
      id: `step-${i}`, capability: 'analyze.code', objective: 'Analyze.',
    })),
  })), /between 1 and 6/);
});

test('Autopilot inference remains disabled unless every owner authorization gate is explicitly true', () => {
  assert.equal(isAutopilotInferenceAuthorized({}), false);
  assert.equal(isAutopilotInferenceAuthorized({
    GLORIFIER_ENABLE_INFERENCE: 'true',
    GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'true',
  }), false);
  assert.equal(isAutopilotInferenceAuthorized({
    GLORIFIER_ENABLE_INFERENCE: 'true',
    GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'true',
    GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'false',
  }), false);
  assert.equal(isAutopilotInferenceAuthorized({
    GLORIFIER_ENABLE_INFERENCE: 'true',
    GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'true',
    GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'true',
  }), true);
});


test('Autopilot rejects plans without a concrete adapter or with unsafe tool arguments', () => {
  assert.throws(() => validateAutopilotPlan(JSON.stringify({
    steps: [{ id: 'research', capability: 'knowledge.search', objective: 'Search arbitrary knowledge.' }],
  })), /without an enabled safe executor/);
  assert.throws(() => validateAutopilotPlan(JSON.stringify({
    steps: [{ id: 'read', capability: 'github.read_file', objective: 'Read a secret.', arguments: { path: '../.env' } }],
  })), /valid repository-relative path/);
  assert.throws(() => validateAutopilotPlan(JSON.stringify({
    steps: [{ id: 'write', capability: 'github.create_issue', objective: 'Create an issue.', arguments: {} }],
  })), /without an enabled safe executor/);
});

test('Autopilot rejects duplicate step identifiers before execution', () => {
  const plan = JSON.stringify({
    steps: [
      { id: 'duplicate', capability: 'github.get_repository', objective: 'Read the repository identity.' },
      { id: 'duplicate', capability: 'github.list_pull_requests', objective: 'Read open pull requests.' },
    ],
  });
  assert.throws(() => validateAutopilotPlan(plan), /invalid or duplicate id\/objective/);
});


test('Autopilot lease heartbeat renews while long-running work is in flight and drains on stop', async () => {
  let renewals = 0;
  const heartbeat = startAutopilotMissionLeaseHeartbeat(async () => {
    renewals += 1;
    return { version: renewals };
  }, 5);
  await new Promise(resolve => setTimeout(resolve, 25));
  await heartbeat.stop();
  assert.ok(renewals >= 1, 'the active mission lease must be renewed');
});

test('Autopilot lease heartbeat surfaces a lost lease and stops future renewals', async () => {
  let renewals = 0;
  const heartbeat = startAutopilotMissionLeaseHeartbeat(async () => {
    renewals += 1;
    return null;
  }, 5);
  await new Promise(resolve => setTimeout(resolve, 20));
  await assert.rejects(() => heartbeat.stop(), /lease renewal failed/);
  const stoppedAt = renewals;
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(renewals, stoppedAt, 'a failed heartbeat must not keep running');
});


test('Autopilot generates mission-specific branch names within GitHub limits', () => {
  assert.equal(getAutopilotMaintenanceBranchName('mission-123'), 'autopilot/mission-123');
  assert.equal(getAutopilotMaintenanceBranchName('MISSION:abc/123'), 'autopilot/mission-abc-123');
  assert.ok(getAutopilotMaintenanceBranchName('x'.repeat(100)).length <= 73);
});

test('Autopilot accepts only a branch-scoped repair plan whose update hash matches the inspected source', () => {
  const branch = 'autopilot/mission-123';
  const expectedHash = 'a'.repeat(64);
  const plan = JSON.stringify({
    steps: [
      { id: 'branch', capability: 'github.create_branch', objective: 'Create an isolated branch.', arguments: { branch, base_ref: 'main' } },
      { id: 'inspect', capability: 'github.read_file', objective: 'Re-read the inspected source on the mission branch.', arguments: { path: 'src/lib/service.ts', ref: branch } },
      { id: 'update', capability: 'github.update_file', objective: 'Apply the minimal repair.', arguments: { branch, path: 'src/lib/service.ts', content: 'export const fixed = true;', message: 'fix: repair service', expectedContentSha256: expectedHash } },
      { id: 'pr', capability: 'github.create_pull_request', objective: 'Open a draft PR for review.', arguments: { branch, title: 'Fix service behavior', body: 'Summary and verification plan.' } },
    ],
  });
  const validated = validateAutopilotPlan(plan, {
    expectedBranch: branch,
    allowWrites: true,
    inspectedPaths: ['src/lib/service.ts'],
    expectedSourceHashes: { 'src/lib/service.ts': expectedHash },
  });
  assert.deepEqual(validated.map(step => step.effect), ['reversible', 'read-only', 'reversible', 'reversible']);
});

test('Autopilot rejects unsafe, unconfigured, out-of-order or stale-source repository repair plans', () => {
  const branch = 'autopilot/mission-123';
  const expectedHash = 'a'.repeat(64);
  const steps = [
    { id: 'branch', capability: 'github.create_branch', objective: 'Create an isolated branch.', arguments: { branch, base_ref: 'main' } },
    { id: 'inspect', capability: 'github.read_file', objective: 'Read the source.', arguments: { path: 'src/lib/service.ts', ref: branch } },
    { id: 'update', capability: 'github.update_file', objective: 'Update source.', arguments: { branch, path: 'src/lib/service.ts', content: 'patched', message: 'fix: patch source', expectedContentSha256: expectedHash } },
    { id: 'pr', capability: 'github.create_pull_request', objective: 'Open a draft PR.', arguments: { branch, title: 'Fix service behavior', body: 'Review requested.' } },
  ];
  const input = JSON.stringify({ steps });
  assert.throws(() => validateAutopilotPlan(input), /write adapter is disabled/);
  assert.throws(() => validateAutopilotPlan(input, {
    expectedBranch: 'autopilot/other-mission', allowWrites: true,
    inspectedPaths: ['src/lib/service.ts'], expectedSourceHashes: { 'src/lib/service.ts': expectedHash },
  }), /exact isolated Autopilot branch/);
  assert.throws(() => validateAutopilotPlan(input, {
    expectedBranch: branch, allowWrites: true,
    inspectedPaths: ['src/lib/service.ts'], expectedSourceHashes: { 'src/lib/service.ts': 'b'.repeat(64) },
  }), /exact source SHA-256/);
  const outOfOrder = JSON.stringify({ steps: [steps[0], steps[2], steps[1], steps[3]] });
  assert.throws(() => validateAutopilotPlan(outOfOrder, {
    expectedBranch: branch, allowWrites: true,
    inspectedPaths: ['src/lib/service.ts'], expectedSourceHashes: { 'src/lib/service.ts': expectedHash },
  }), /source reads, file updates/);
});


test('Autopilot A2A context separator is a real newline, not a literal backslash sequence', () => {
  const result = formatAutopilotA2AContext('analysis', { task: 1 });
  assert.equal(result, 'analysis\nExecution context: {"task":1}');
  assert.equal(result.includes('\\\\n'), false);
});


test('Autopilot orchestration status does not describe GitHub readback as independent-source verification', () => {
  const status = getAutopilotOrchestrationStatus();

  assert.equal(status.independentSourceVerification, false);
  assert.equal(status.githubSourceReadbackVerification, true);
  assert.equal(status.externalActionExecution, false);
});


test('Autopilot repository inference requires owner-attested free providers and never accepts paid authorization', () => {
  const now = '2026-11-16T15:00:00.000Z';
  const env = {
    GLORIFIER_REPOSITORY_AI_FREE_ONLY: 'true',
    GLORIFIER_REPOSITORY_PUBLIC_CODE_EGRESS: 'true',
    GLORIFIER_MONTHLY_AI_BUDGET_USD: '0',
    GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'false',
    GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'false',
    GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON: JSON.stringify([
      {
        providerId: 'gemini',
        mode: 'vendor-free-tier',
        status: 'owner-attested',
        modelId: 'gemini-2.5-flash',
        endpointUrl: 'https://generativelanguage.googleapis.com',
        evidenceUrl: 'https://ai.google.dev/gemini-api/docs/rate-limits',
        attestedAt: '2026-11-16T14:00:00.000Z',
        expiresAt: '2026-11-16T16:00:00.000Z',
        planName: 'Free',
        monthlyPaidSpendLimitUsd: 0,
        autoTopUpEnabled: false,
        payAsYouGoEnabled: false,
        paidFallbackEnabled: false,
        monthlyInvoicingEnabled: false,
        billingEnabled: false,
        modelFree: true,
        requestsPerMinute: 10,
        requestsPerDay: 100,
        maxTokensPerDay: 60000,
        maxInputTokens: 12000,
        maxOutputTokens: 2048
      }
    ])
  };
  const configured = [
    { id: 'gemini', name: 'Google Gemini', status: 'connected', models: ['gemini-2.5-flash'] }
  ];
  assert.equal(isAutopilotRepositoryFreeInferenceAuthorized(env, configured, now), true);
  const policy = getAutopilotRepositoryContributorPolicy(env, configured, now);
  assert.equal(policy.monthlyPaidBudgetUsd, 0);
  assert.equal(policy.paidInferenceAuthorized, false);
  assert.deepEqual(policy.eligibleProviders.map(provider => provider.providerId), ['gemini']);

  assert.equal(isAutopilotRepositoryFreeInferenceAuthorized({
    ...env,
    GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'true'
  }, configured, now), false);
  assert.equal(isAutopilotRepositoryFreeInferenceAuthorized({
    ...env,
    GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'true'
  }, configured, now), false);
  assert.equal(isAutopilotRepositoryFreeInferenceAuthorized({
    ...env,
    GLORIFIER_MONTHLY_AI_BUDGET_USD: '1'
  }, configured, now), false);
});

test('Autopilot repository provider pool fails closed without a free attestation or configured adapter', () => {
  const now = '2026-11-16T15:00:00.000Z';
  const env = {
    GLORIFIER_REPOSITORY_AI_FREE_ONLY: 'true',
    GLORIFIER_REPOSITORY_PUBLIC_CODE_EGRESS: 'true',
    GLORIFIER_MONTHLY_AI_BUDGET_USD: '0',
    GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'false',
    GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'false'
  };
  assert.equal(isAutopilotRepositoryFreeInferenceAuthorized(env, [], now), false);
  assert.equal(isAutopilotRepositoryFreeInferenceAuthorized(env, [
    { id: 'gemini', status: 'connected', models: ['gemini-2.5-flash'] }
  ], now), false);
  assert.equal(isAutopilotRepositoryFreeInferenceAuthorized({
    ...env,
    GLORIFIER_REPOSITORY_AI_FREE_ONLY: 'false'
  }, [
    { id: 'gemini', status: 'connected', models: ['gemini-2.5-flash'] }
  ], now), false);
});

test('Autopilot free contribution policy does not treat model availability as vendor verification', () => {
  const now = '2026-11-16T15:00:00.000Z';
  const policy = getAutopilotRepositoryContributorPolicy({
    GLORIFIER_REPOSITORY_AI_FREE_ONLY: 'true',
    GLORIFIER_REPOSITORY_PUBLIC_CODE_EGRESS: 'true',
    GLORIFIER_MONTHLY_AI_BUDGET_USD: '0',
    GLORIFIER_PAID_INFERENCE_AUTHORIZED: 'false',
    GLORIFIER_ALLOW_EXTERNAL_DATA_EGRESS: 'false',
    GLORIFIER_REPOSITORY_AI_FREE_ATTESTATIONS_JSON: JSON.stringify([{
      providerId: 'nvidia',
      mode: 'developer-program',
      status: 'owner-attested',
      modelId: 'nvidia/nemotron',
      endpointUrl: 'https://integrate.api.nvidia.com/v1',
      evidenceUrl: 'https://docs.api.nvidia.com/nim/docs/product',
      attestedAt: '2026-11-16T14:00:00.000Z',
      expiresAt: '2026-11-16T16:00:00.000Z',
      planName: 'NVIDIA Developer Program',
      developerProgramActive: true,
      nonProduction: true,
      monthlyPaidSpendLimitUsd: 0,
      autoTopUpEnabled: false,
      payAsYouGoEnabled: false,
      paidFallbackEnabled: false,
      monthlyInvoicingEnabled: false,
      billingEnabled: false,
      requestsPerMinute: 5,
      requestsPerDay: 50,
      maxTokensPerDay: 30000,
      maxInputTokens: 8000,
      maxOutputTokens: 1024
    }])
  }, [{ id: 'nvidia', status: 'connected', models: ['nvidia/nemotron'] }], now);
  assert.equal(policy.eligibleProviders[0].verificationLevel, 'owner-attested-not-vendor-verified');
});


test('Repository contribution attribution records the official GitHub App writer and each AI provider/model', () => {
  const attribution = buildRepositoryContributionAttribution(
    'mission-471',
    'glorifier-contributor',
    { provider: 'openai', model: 'gpt-test-model' },
    [
      { role: { id: 'engineering-scientist' }, provider: 'gemini', model: 'gemini-test-model' },
      { role: { id: 'cybersecurity-scientist' }, provider: 'nvidia', model: 'nemotron-test-model' },
      { role: { id: 'engineering-scientist' }, provider: 'gemini', model: 'gemini-test-model' },
    ],
  );

  assert.deepEqual(attribution.writerIdentity, {
    type: 'github-app',
    login: 'glorifier-contributor[bot]',
    appSlug: 'glorifier-contributor',
    appOwner: 'GLORIFIER7',
  });
  assert.deepEqual(attribution.aiCeo, { provider: 'openai', model: 'gpt-test-model' });
  assert.equal(attribution.specialists.length, 2, 'duplicate specialist records are collapsed');
  assert.equal(attribution.specialists[0].provider, 'gemini');
  assert.equal(attribution.specialists[1].model, 'nemotron-test-model');
  assert.equal(attribution.attributionBasis, 'GLORIFIER runtime response metadata; not provider-signed');
});

test('Repository contribution attribution is appended as durable PR provenance within GitHub body limits', () => {
  const attribution = buildRepositoryContributionAttribution(
    'mission-471',
    'glorifier-contributor',
    { provider: 'openai', model: 'gpt-test-model' },
    [{ role: { id: 'engineering-scientist' }, provider: 'gemini', model: 'gemini-test-model' }],
  );
  const body = appendRepositoryContributionAttribution('Automated repair summary.', attribution);

  assert.ok(body.includes('Official GitHub writer:** glorifier-contributor[bot]'));
  assert.ok(body.includes('| engineering-scientist | gemini | gemini-test-model |'));
  assert.ok(body.includes('<!-- GLORIFIER_AI_CONTRIBUTION_ATTRIBUTION_V1'));
  assert.ok(body.includes('"provider":"gemini"'));
  assert.ok(body.length <= 20_000);
});

test('Repository contribution attribution preserves provenance when an AI-generated PR body is oversized', () => {
  const attribution = buildRepositoryContributionAttribution(
    'mission-471',
    'glorifier-contributor',
    { provider: 'openai', model: 'gpt-test-model' },
    [{ role: { id: 'engineering-scientist' }, provider: 'gemini', model: 'gemini-test-model' }],
  );
  const body = appendRepositoryContributionAttribution('x'.repeat(20_000), attribution);

  assert.ok(body.length <= 20_000);
  assert.ok(body.includes('AI-generated PR description truncated'));
  assert.ok(body.includes('GLORIFIER_AI_CONTRIBUTION_ATTRIBUTION_V1'));
});

test('Repository contribution attribution escapes backslashes before Markdown table delimiters', () => {
  const slash = String.fromCharCode(92);
  const unsafeProvider = 'openai' + slash + '|spoof';
  const unsafeModel = 'gpt' + slash + 'internal';
  const expectedProvider = 'openai' + slash.repeat(3) + '|spoof';
  const expectedModel = 'gpt' + slash.repeat(2) + 'internal';
  const attribution = buildRepositoryContributionAttribution(
    'mission-471',
    'glorifier-contributor',
    { provider: unsafeProvider, model: unsafeModel },
    [],
  );

  assert.equal(attribution.aiCeo.provider, expectedProvider);
  assert.equal(attribution.aiCeo.model, expectedModel);
  const body = appendRepositoryContributionAttribution('Automated repair summary.', attribution);
  assert.ok(body.includes('| ' + expectedProvider + ' | ' + expectedModel + ' |'));
});
