/**
 * Deterministic, read-only GitHub Actions / pull-request evidence intake.
 * This is NOT an AI CEO or Specialist Council model invocation, GEAS approval,
 * repair execution, or evidence that a pull request can be merged.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'GLORIFIER7/GLORIFIER';
const MAX_RUNS = 50;
const MAX_PULLS = 100;
const MAX_CANDIDATES = 12;
const MAX_CHECKS_PER_PR = 100;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9 .:/_()+-]{0,99}$/;
const REPAIR_ROLES = Object.freeze({
  security: 'security-engineer',
  platform: 'platform-engineer',
  architecture: 'architecture-specialist',
  quality: 'quality-assurance',
});

function safeName(name) {
  return typeof name === 'string' && SAFE_NAME.test(name) ? name : null;
}
function safeId(id) {
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function getRole(names) {
  if (names.some(name => /codeql|security|snyk|dependabot|dependency/i.test(name))) return REPAIR_ROLES.security;
  if (names.some(name => /worker|cloudflare|docker|deploy/i.test(name))) return REPAIR_ROLES.platform;
  if (names.some(name => /geas|architecture|contract/i.test(name))) return REPAIR_ROLES.architecture;
  return REPAIR_ROLES.quality;
}
function sortNewest(a, b) {
  const left = Date.parse(a.createdAt || '') || 0;
  const right = Date.parse(b.createdAt || '') || 0;
  return right - left || (b.databaseId - a.databaseId);
}

export function buildRepairIntake({ repository, observedAt, runs, pulls }) {
  if (repository !== REPOSITORY) throw new Error('repository is not authorized for this intake');
  if (typeof observedAt !== 'string' || !Number.isFinite(Date.parse(observedAt))) {
    throw new Error('observation time is missing or invalid');
  }
  if (!Array.isArray(runs)) throw new Error('runs snapshot must be an array');
  if (!Array.isArray(pulls)) throw new Error('pull requests snapshot must be an array');

  const selectedRuns = runs.slice(0, MAX_RUNS);
  const selectedPulls = pulls.slice(0, MAX_PULLS);
  // A historical failure is not an active candidate when a later completed run
  // of that same workflow on main succeeded. Treat the latest completed result
  // per workflow as authoritative within this bounded observation window.
  const completedMainRuns = selectedRuns.filter(item => item && safeId(item.databaseId)
    && item.headBranch === 'main' && item.status?.toLowerCase() === 'completed'
    && ['success', 'failure'].includes(item.conclusion?.toLowerCase())
    && ['push', 'workflow_dispatch', 'schedule'].includes(item.event)
    && safeName(item.workflowName)).sort(sortNewest);
  const latestByWorkflow = new Map();
  for (const run of completedMainRuns) {
    if (!latestByWorkflow.has(run.workflowName)) latestByWorkflow.set(run.workflowName, run);
  }
  const failures = [...latestByWorkflow.values()].filter(item => item.conclusion.toLowerCase() === 'failure');

  const ciCandidates = failures.slice(0, MAX_CANDIDATES).map(item => ({
    kind: 'ci-failure',
    reference: String(item.databaseId),
    url: `https://github.com/${REPOSITORY}/actions/runs/${item.databaseId}`,
    workflow: safeName(item.workflowName),
    observedConclusion: 'failure',
    gate: 'NOT VERIFIED',
    proposedAction: 'investigate-only',
    suggestedSpecialist: getRole([item.workflowName]),
  }));

  const prCandidates = selectedPulls.filter(item => item && safeId(item.number)).map(item => {
    const checks = Array.isArray(item.statusCheckRollup) ? item.statusCheckRollup.slice(0, MAX_CHECKS_PER_PR) : [];
    const failingChecks = [];
    const neutralChecks = [];
    const pendingChecks = [];
    for (const check of checks) {
      const name = safeName(check?.name ?? check?.context);
      if (!name) continue;
      const outcome = String(check?.conclusion ?? check?.state ?? '').toUpperCase();
      const status = String(check?.status ?? '').toUpperCase();
      if (['FAILURE', 'ERROR', 'TIMED_OUT', 'ACTION_REQUIRED'].includes(outcome)) failingChecks.push(name);
      else if (outcome === 'NEUTRAL') neutralChecks.push(name);
      else if ((!outcome || outcome === 'PENDING' || outcome === 'EXPECTED') && status !== 'COMPLETED') pendingChecks.push(name);
    }
    const mergeState = ['BLOCKED', 'CLEAN', 'DIRTY', 'BEHIND', 'UNKNOWN', 'DRAFT', 'UNSTABLE'].includes(item.mergeStateStatus)
      ? item.mergeStateStatus : 'UNKNOWN';
    return {
      kind: 'pull-request-review',
      reference: String(item.number),
      url: `https://github.com/${REPOSITORY}/pull/${item.number}`,
      draft: item.isDraft === true,
      mergeState,
      headSha: typeof item.headRefOid === 'string' && /^[a-f0-9]{40}$/.test(item.headRefOid) ? item.headRefOid : null,
      checksObserved: checks.length,
      failingChecks: [...new Set(failingChecks)].slice(0, 12),
      neutralChecks: [...new Set(neutralChecks)].slice(0, 12),
      pendingChecks: [...new Set(pendingChecks)].slice(0, 12),
      gate: 'NOT VERIFIED',
      proposedAction: 'investigate-only',
      suggestedSpecialist: getRole([...failingChecks, ...neutralChecks]),
    };
  }).sort((a, b) => {
    const rank = item => (item.failingChecks.length ? 4 : 0) + (item.mergeState === 'BLOCKED' ? 2 : 0) + (item.draft ? 0 : 1);
    return rank(b) - rank(a) || Number(b.reference) - Number(a.reference);
  });

  return {
    schemaVersion: 'glorifier-repair-intake/v1',
    repository: REPOSITORY,
    observedAt,
    observedCounts: { workflowRuns: selectedRuns.length, failedMainRuns: failures.length, pullRequests: selectedPulls.length },
    controls: {
      evidenceOnly: true,
      aiCeoInvoked: false,
      modelInferenceInvoked: false,
      specialistCouncilInvoked: false,
      geasAuthorizedExecution: false,
      repairCompleted: false,
      mergeAuthorized: false,
      productionDeployAuthorized: false,
      paidInferenceAuthorized: false,
      signingOrPaymentAuthorized: false,
      humanReviewRequired: true,
    },
    limitations: [
      'This read-only intake does not execute Autopilot missions or call AI providers.',
      'GEAS must evaluate capability and policy before any subsequent authorized action.',
      'External code-scanning and CI provider status may require independent verification.',
      'A green check or CLEAN merge state does not establish approval or merge authorization.',
    ],
    candidates: [...ciCandidates, ...prCandidates].slice(0, MAX_CANDIDATES),
  };
}

export function renderRepairIntakeMarkdown(report) {
  const lines = [
    '# GLORIFIER governed repair intake',
    '',
    `- Repository: \`${REPOSITORY}\``,
    `- Observed (UTC): \`${report.observedAt}\``,
    `- Main-branch failed Actions runs: **${report.observedCounts.failedMainRuns}**`,
    `- Open PR metadata examined: **${report.observedCounts.pullRequests}**`,
    '- AI CEO and Specialist Council: **NOT INVOKED** (only deterministic triage)',
    '- GEAS execution authorization: **NOT GRANTED**',
    '- Human review is required before any merge, deployment, inference, secret change or paid action.',
    '',
    '## Proposed investigation queue (no changes executed)',
    '',
  ];
  if (!report.candidates.length) lines.push('No actionable candidates found in the inspected snapshot. This does not prove the repository is healthy.');
  for (const c of report.candidates) {
    const evidence = c.kind === 'ci-failure'
      ? `failed main workflow \`${c.workflow}\``
      : `merge state \`${c.mergeState}\`, ${c.checksObserved} check records, ${c.failingChecks.length} failed checks, ${c.neutralChecks.length} neutral checks`;
    lines.push(`- ${c.kind} [#${c.reference}](${c.url}): ${evidence}; suggested reviewer: \`${c.suggestedSpecialist}\`; **investigate only**.`);
  }
  lines.push('', '## Evidence boundaries', '', ...report.limitations.map(s => `- ${s}`), '');
  return lines.join('\n');
}

async function main() {
  if (process.argv.length !== 6) {
    throw new Error('usage: node scripts/governed-repair-intake.mjs <runs.json> <pulls.json> <report.json> <report.md>');
  }
  const [runsFile, pullsFile, jsonFile, markdownFile] = process.argv.slice(2);
  const [runs, pulls] = await Promise.all([runsFile, pullsFile].map(async path => JSON.parse(await readFile(path, 'utf8'))));
  const report = buildRepairIntake({
    repository: process.env.GITHUB_REPOSITORY,
    observedAt: new Date().toISOString(),
    runs,
    pulls,
  });
  await writeFile(jsonFile, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  await writeFile(markdownFile, renderRepairIntakeMarkdown(report), { mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`repair intake failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
