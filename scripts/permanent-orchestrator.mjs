#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const INTERNAL_APP_BASE_URL = String(process.env.RAILWAY_SERVICE_GLORIFIER_ARTIFICIAL_INTELLIGENCE_URL || '').replace(/\/$/, '');
const APP_BASE_URL = INTERNAL_APP_BASE_URL || 'https://glorifier-artificial-intelligence-production.up.railway.app';
const APP_HEALTH_URL = process.env.GLORIFIER_APP_HEALTH_URL || `${APP_BASE_URL}/api/health`;
const SPECIALIST_COUNCIL_URL = process.env.GLORIFIER_SPECIALIST_COUNCIL_URL || APP_HEALTH_URL.replace(/\/api\/health$/, '/api/ai/specialist-council');
const WORK_TOGETHER_GPT_URL = process.env.GLORIFIER_WORK_TOGETHER_GPT_URL || APP_HEALTH_URL.replace(/\/api\/health$/, '/api/ai/work-together-gpt');
const AGENT_TASK_URL = process.env.GLORIFIER_AGENT_TASK_URL || APP_HEALTH_URL.replace(/\/api\/health$/, '/api/agents/tasks');
const GLOBAL_SYNC_URL = process.env.GLORIFIER_GLOBAL_SYNC_URL || APP_HEALTH_URL.replace(/\/api\/health$/, '/api/sync/global');
const WATCHDOG_MS = Math.max(30_000, Number(process.env.ORCHESTRATOR_WATCHDOG_MS || 60_000));
const IMPROVEMENT_MS = Math.max(5 * 60_000, Number(process.env.ORCHESTRATOR_IMPROVEMENT_MS || 30 * 60_000));
const MAX_FAILURES = Math.max(1, Number(process.env.ORCHESTRATOR_MAX_HEALTH_FAILURES || 3));
const REVENUE_MILESTONE_VERIFIED = process.env.GLORIFIER_REVENUE_MILESTONE_VERIFIED === 'true';
const INTERNAL_SERVICE_TOKEN = process.env.GLORIFIER_INTERNAL_SERVICE_TOKEN || '';
const INTERNAL_SERVICE_HEADERS = INTERNAL_SERVICE_TOKEN
  ? { 'x-glorifier-internal-token': INTERNAL_SERVICE_TOKEN }
  : { 'x-glorifier-internal-service': 'permanent-orchestrator' };
let running = false;
let healthFailures = 0;
let stopping = false;

const AI_CEO = {
  role: 'GLORIFIER AI CEO',
  authority: { humanOwnerFinalAuthority: true, autonomousMerge: false, autonomousProductionDeploy: false, autonomousSecretAccess: false, financialAuthority: false, legalAuthority: false }
};

function log(event, details = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, aiCeo: AI_CEO.role, ...details }));
}

function run(command, args = [], timeoutMs = 25 * 60_000) {
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: process.env,
    });
    return { ok: true, output };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout || ''}\n${error.stderr || error.message}`.trim(),
    };
  }
}

async function healthCheck() {
  try {
    const response = await fetch(APP_HEALTH_URL, { signal: AbortSignal.timeout(15_000) });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
    healthFailures = 0;
    log('APP_HEALTH_OK', { url: APP_HEALTH_URL });
    return true;
  } catch (error) {
    healthFailures += 1;
    log('APP_HEALTH_FAILED', { failures: healthFailures, error: error instanceof Error ? error.message : String(error) });
    if (healthFailures >= MAX_FAILURES) {
      log('WATCHDOG_RESTART_REQUESTED', { reason: 'application health check failed repeatedly' });
      process.exit(1);
    }
    return false;
  }
}

async function standingSpecialistMission() {
  if (REVENUE_MILESTONE_VERIFIED) {
    log('STANDING_REVENUE_MISSION_COMPLETE', {
      reason: 'verified milestone flag is enabled',
      targetUsd: 1_000_000,
    });
    return;
  }

  try {
    const response = await fetch(SPECIALIST_COUNCIL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...INTERNAL_SERVICE_HEADERS },
      body: JSON.stringify({
        objective: 'Continuously identify, validate, prioritize, measure, and improve lawful opportunities that can generate real settled revenue for GLORIFIER. Review product, market, growth, revenue, finance, risk, legal, compliance, cybersecurity, data, engineering, operations, and frontier opportunities. Focus on evidence, conversion paths, customer value, unit economics, bottlenecks, and the next highest-leverage authorized action.',
        standingMission: true,
        temperature: 0.2
      }),
      signal: AbortSignal.timeout(10 * 60_000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 1000)}`);
    log('STANDING_SPECIALIST_MISSION_OK', {
      targetUsd: 1_000_000,
      successCondition: 'verified settled funds received in an authorized bank/payment account',
      response: body.slice(-4000),
    });
  } catch (error) {
    log('STANDING_SPECIALIST_MISSION_FAILED', {
      error: error instanceof Error ? error.message : String(error),
      action: 'continue_next_cycle',
    });
  }
}

async function standingAgentRuntimeMission() {
  try {
    const response = await fetch(AGENT_TASK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...INTERNAL_SERVICE_HEADERS },
      body: JSON.stringify({
        requester: 'ai-ceo',
        capability: 'synthesis',
        objective: 'Coordinate the current GLORIFIER intelligence cycle. Review available AI/model and infrastructure signals, identify material changes, and return a compact artifact for the next agent. Do not deploy, merge, expose secrets, or make financial/legal commitments.'
      }),
      signal: AbortSignal.timeout(10 * 60_000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 1000)}`);
    log('AI_TO_AI_RUNTIME_OK', { response: body.slice(-4000) });
  } catch (error) {
    log('AI_TO_AI_RUNTIME_FAILED', {
      error: error instanceof Error ? error.message : String(error),
      action: 'continue_next_cycle',
    });
  }
}

async function standingGptCoWorkingMission() {
  try {
    const response = await fetch(WORK_TOGETHER_GPT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...INTERNAL_SERVICE_HEADERS },
      body: JSON.stringify({
        taskPrompt: '24/7 standing continuous engineering and value-optimization review: audit system circuit breakers, privacy budgets, commercial data licensing floors, provider health, independent compute capacity, orchestration resilience, and measurable business outcomes. Learn from available ecosystems without becoming dependent on any single provider or platform.',
        domain: 'code_engineering',
        standingMission: true
      }),
      signal: AbortSignal.timeout(10 * 60_000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 1000)}`);
    log('STANDING_GPT_COWORKING_OK', {
      mission: '24/7 continuous provider-neutral AI collaboration; use whichever eligible intelligence providers are available.',
      response: body.slice(-2000),
    });
  } catch (error) {
    log('STANDING_GPT_COWORKING_FAILED', {
      error: error instanceof Error ? error.message : String(error),
      action: 'continue_next_cycle',
    });
  }
}

async function standingGlobalSyncMission() {
  try {
    const response = await fetch(GLOBAL_SYNC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...INTERNAL_SERVICE_HEADERS },
      signal: AbortSignal.timeout(10 * 60_000),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 1000)}`);
    log('GLOBAL_SYNC_AND_SYNTHESIS_OK', {
      mission: 'Synchronize authorized GLORIFIER intelligence and ecosystem signals across connected agents and providers; do not imply universal internet access.',
      response: body.slice(-2000),
    });
  } catch (error) {
    log('GLOBAL_SYNC_AND_SYNTHESIS_FAILED', {
      error: error instanceof Error ? error.message : String(error),
      action: 'continue_next_cycle',
    });
  }
}

async function autonomousCycle() {
  if (running || stopping) return;
  running = true;
  log('AUTONOMOUS_CYCLE_START', {
    mode: 'headless-supervisor',
    mutationPolicy: 'observe-orchestrate-verify; repository mutation stays CI-gated'
  });

  try {
    await standingGlobalSyncMission();
    await standingAgentRuntimeMission();
    await standingGptCoWorkingMission();
    await standingSpecialistMission();

    log('AUTONOMOUS_CYCLE_OK', {
      mode: 'headless-supervisor',
      nextAction: 'continue_next_cycle',
      truthRule: 'No evidence means UNKNOWN or NOT VERIFIED'
    });
  } catch (error) {
    log('AUTONOMOUS_CYCLE_FAILED', {
      error: error instanceof Error ? error.message : String(error),
      action: 'continue_next_cycle'
    });
  } finally {
    running = false;
  }
}

async function main() {
  log('GLORIFIER_PERMANENT_ORCHESTRATOR_START', {
    aiCeoGovernance: AI_CEO.authority,
    appHealthUrl: APP_HEALTH_URL,
    specialistCouncilUrl: SPECIALIST_COUNCIL_URL,
    watchdogMs: WATCHDOG_MS,
    improvementMs: IMPROVEMENT_MS,
    standingRevenueMission: true,
    standing247GptCoWorking: true,
    workTogetherGptUrl: WORK_TOGETHER_GPT_URL,
    revenueTargetUsd: 1_000_000,
    milestoneVerified: REVENUE_MILESTONE_VERIFIED,
  });

  await healthCheck();
  await autonomousCycle();

  const watchdog = setInterval(() => { void healthCheck(); }, WATCHDOG_MS);
  const improvement = setInterval(() => { void autonomousCycle(); }, IMPROVEMENT_MS);

  const shutdown = (signal) => {
    if (stopping) return;
    stopping = true;
    clearInterval(watchdog);
    clearInterval(improvement);
    log('ORCHESTRATOR_SHUTDOWN', { signal });
    setTimeout(() => process.exit(0), 100);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  log('ORCHESTRATOR_FATAL', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
