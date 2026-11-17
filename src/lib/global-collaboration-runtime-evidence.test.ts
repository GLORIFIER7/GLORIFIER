import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getGlobalCollaborationPolicy } from './global-collaboration-orchestrator';

const readSource = (relativePath: string): string =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

test('global collaboration claims match the scheduled workflow and observed execution scope', () => {
  const workflow = readSource('../../.github/workflows/global-collaboration.yml');
  const documentation = readSource('../../docs/GLORIFIER-GLOBAL-COLLABORATION.md');
  const policy = getGlobalCollaborationPolicy();

  assert.equal(policy.continuous, false);
  assert.equal(policy.scheduledCadenceHours, 6);
  assert.equal(policy.scheduledWorkflowCron, '47 */6 * * *');
  assert.equal(policy.persistentDaemonStatus, 'NOT VERIFIED');
  assert.match(policy.continuousOperation, /six-hour schedule/i);
  assert.match(policy.declaredParticipantsStatus, /not evidence/i);
  assert.match(
    policy.runtimeExecutionScope,
    /public-source opportunity discovery and global-resolution case creation only/i,
  );
  assert.match(
    policy.runtimeExecutionScope,
    /does not invoke provider inference, Specialist Council execution, A2A task execution, MCP, or Autopilot mission execution/i,
  );

  assert.match(workflow, /cron:\s*["']47 \*\/6 \* \* \*["']/);
  assert.match(documentation, /every six hours/i);
  assert.doesNotMatch(documentation, /every 15 minutes/i);
  assert.match(documentation, /persistent daemon status is \*\*NOT VERIFIED\*\*/i);
});

test('scheduled collaboration entrypoint remains limited to discovery and resolution', () => {
  const collaborationOrchestrator = readSource('./global-collaboration-orchestrator.ts');
  const scheduledEntrypoint = readSource('../../scripts/run-global-collaboration.ts');
  const workflow = readSource('../../.github/workflows/global-collaboration.yml');
  const cycle = collaborationOrchestrator.match(
    /export async function runGlobalCollaborationCycle[\s\S]*?^\}/m,
  )?.[0];

  assert.ok(cycle, 'global collaboration cycle implementation must remain inspectable');
  assert.match(cycle, /run24x7OpportunityDiscoveryCycle\(actor\)/);
  assert.match(cycle, /runGlobalResolutionCycle\(actor, limit\)/);
  assert.doesNotMatch(
    cycle,
    /\b(?:aiOrchestrator\.generate|runSpecialistCouncil|createA2ATaskForProtocol|executeA2ATask|githubMcpRoute|runCloudflareAutopilotCycle)\b/,
  );
  assert.match(scheduledEntrypoint, /runGlobalCollaborationCycle\('github-actions-global-collaboration'/);
  assert.match(workflow, /tsx scripts\/run-global-collaboration\.ts/);
});
