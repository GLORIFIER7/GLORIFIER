import crypto from 'node:crypto';
import { getPostgresPool } from './db/postgres';
import { MONETIZATION_SCIENTISTS, createMonetizationOpportunity } from './monetization-sprint';
import { listAgentCards } from './agent-runtime';

export const GLORIFIER_24X7_DISCOVERY_VERSION = 'G24D-1.1';

let discoveryTimer: NodeJS.Timeout | null = null;
let discoveryRunning = false;
let lastDiscoveryError: string | null = null;
type DiscoverySource = { id: string; name: string; url: string; category: string; enabled: boolean };
type DiscoveryFinding = { sourceId: string; title: string; url: string; description: string; category: string; observedAt: string };

const DEFAULT_SOURCES: DiscoverySource[] = [
  { id: 'github-issues', name: 'GitHub Issues', url: 'https://api.github.com/search/issues?q=is:open+label:help+wanted', category: 'developer-work', enabled: true },
  { id: 'github-bounties', name: 'GitHub Bounty Signals', url: 'https://api.github.com/search/issues?q=is:open+bounty+OR+reward+OR+paid', category: 'bounties', enabled: true },
  { id: 'huggingface-models', name: 'Hugging Face Models', url: 'https://huggingface.co/api/models?sort=downloads&direction=-1&limit=20', category: 'ai', enabled: true },
  { id: 'huggingface-datasets', name: 'Hugging Face Datasets', url: 'https://huggingface.co/api/datasets?sort=downloads&direction=-1&limit=20', category: 'data', enabled: true }
];

function configuredSources(): DiscoverySource[] {
  const raw = String(process.env.GLORIFIER_DISCOVERY_SOURCES || '').trim();
  if (!raw) return DEFAULT_SOURCES;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SOURCES;
    return parsed.map((x: any, i: number) => ({ id: String(x.id || 'custom-' + i), name: String(x.name || x.id || 'Custom Source ' + (i + 1)), url: String(x.url || ''), category: String(x.category || 'other'), enabled: x.enabled !== false })).filter((x: DiscoverySource) => /^https?:\/\//i.test(x.url));
  } catch { return DEFAULT_SOURCES; }
}

function scientistForCategory(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('data') || c.includes('dataset')) return 'data-scientist';
  if (c.includes('ai') || c.includes('model')) return 'engineering-scientist';
  if (c.includes('security') || c.includes('bounty')) return 'security-scientist';
  if (c.includes('compliance')) return 'compliance-scientist';
  if (c.includes('finance') || c.includes('payment')) return 'finance-scientist';
  return 'business-intelligence-scientist';
}

function textOf(x: any): string { return [x?.title, x?.name, x?.description, x?.body, x?.html_url, x?.url].filter(Boolean).join(' ').slice(0, 4000); }

function extractFindings(source: DiscoverySource, payload: any): DiscoveryFinding[] {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  const observedAt = new Date().toISOString();
  return items.slice(0, 50).map((item: any, i: number) => ({ sourceId: source.id, title: String(item?.title || item?.name || source.name + ' opportunity signal ' + (i + 1)).slice(0, 500), url: String(item?.html_url || item?.url || source.url), description: textOf(item), category: source.category, observedAt }));
}

async function fetchSource(source: DiscoverySource): Promise<DiscoveryFinding[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(source.url, { headers: { accept: 'application/json', 'user-agent': 'GLORIFIER-24x7-Discovery/1.0', 'x-glorifier-discovery': 'opportunity-evidence' }, signal: controller.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return extractFindings(source, await response.json());
  } finally { clearTimeout(timer); }
}

export async function initialize24x7OpportunityDiscovery() {
  await getPostgresPool().query([
    'CREATE TABLE IF NOT EXISTS glorifier_discovery_runs (id TEXT PRIMARY KEY, actor TEXT NOT NULL, status TEXT NOT NULL, sources_scanned INTEGER NOT NULL DEFAULT 0, findings_observed INTEGER NOT NULL DEFAULT 0, opportunities_created INTEGER NOT NULL DEFAULT 0, details JSONB NOT NULL DEFAULT \'{}\'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    'CREATE TABLE IF NOT EXISTS glorifier_discovery_findings (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL, fingerprint TEXT NOT NULL UNIQUE, scientist_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'observed\', evidence JSONB NOT NULL DEFAULT \'{}\'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    'CREATE INDEX IF NOT EXISTS glorifier_discovery_findings_status_idx ON glorifier_discovery_findings(status, created_at DESC)',
    'CREATE INDEX IF NOT EXISTS glorifier_discovery_findings_scientist_idx ON glorifier_discovery_findings(scientist_id, created_at DESC)',
    'CREATE TABLE IF NOT EXISTS glorifier_discovery_assignments (id TEXT PRIMARY KEY, finding_id TEXT NOT NULL, assignee_id TEXT NOT NULL, assignee_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'queued\', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(finding_id, assignee_id))',
    'CREATE INDEX IF NOT EXISTS glorifier_discovery_assignments_queue_idx ON glorifier_discovery_assignments(status, created_at DESC)'
  ].join(';'));
}

export function get24x7OpportunityDiscoveryPolicy() {
  return { version: GLORIFIER_24X7_DISCOVERY_VERSION, objective: 'DISCOVER → FILTER → VERIFY → QUALIFY → EVIDENCE → VALUE → PRIORITIZE → ASSIGN → ACT → MEASURE → LEARN → REPEAT', continuous: true, defaultIntervalMs: Math.max(60000, Number(process.env.GLORIFIER_DISCOVERY_INTERVAL_MS) || 600000), delegatesToAllConfiguredScientists: true, configuredScientists: MONETIZATION_SCIENTISTS, sourceModel: 'provider-neutral adapters plus configured public/API sources', economicTruth: 'Observed opportunities and estimates are never treated as verified revenue.', executionBoundary: 'Discovery is autonomous; consequential external actions remain governed and provider-authorized.', antiFabrication: true };
}

export async function run24x7OpportunityDiscoveryCycle(actor = 'ai-ceo-autonomous') {
  await initialize24x7OpportunityDiscovery();
  const db = getPostgresPool();
  const runId = 'discovery-' + crypto.randomUUID();
  const sources = configuredSources().filter(s => s.enabled);
  let findingsObserved = 0; let opportunitiesCreated = 0; const errors: string[] = [];
  for (const source of sources) {
    try {
      const findings = await fetchSource(source);
      for (const finding of findings) {
        findingsObserved++;
        const fingerprint = crypto.createHash('sha256').update(finding.sourceId + '|' + finding.url + '|' + finding.title).digest('hex');
        const scientistId = scientistForCategory(finding.category);
        const insert = await db.query('INSERT INTO glorifier_discovery_findings (id,source_id,title,url,description,category,fingerprint,scientist_id,evidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT(fingerprint) DO NOTHING RETURNING id', [ 'finding-' + crypto.randomUUID(), finding.sourceId, finding.title, finding.url, finding.description, finding.category, fingerprint, scientistId, JSON.stringify({ source: finding.sourceId, observedAt: finding.observedAt, evidenceStatus: 'observed' }) ]);
        if (!insert.rowCount) continue;
        const modelAssignees = listAgentCards().map((agent: any) => ({ id: String(agent.id || agent.name || 'agent'), type: 'model-or-agent' }));
        const scientistAssignees = MONETIZATION_SCIENTISTS.map((scientist) => ({ id: scientist.id, type: 'scientist' }));
        const assignees = [...modelAssignees, ...scientistAssignees];
        for (const assignee of assignees) {
          await db.query('INSERT INTO glorifier_discovery_assignments(id,finding_id,assignee_id,assignee_type) VALUES($1,$2,$3,$4) ON CONFLICT(finding_id,assignee_id) DO NOTHING', ['assignment-' + crypto.randomUUID(), insert.rows[0].id, assignee.id, assignee.type]);
        }
        const opportunity = await createMonetizationOpportunity({ title: finding.title, scientistId, evidenceRefs: [finding.url, 'discovery:' + insert.rows[0].id] });
        opportunitiesCreated++;
        await db.query('UPDATE glorifier_discovery_findings SET status=$2,updated_at=NOW() WHERE id=$1', [insert.rows[0].id, 'qualified-for-review']);
        await db.query('UPDATE monetization_opportunities SET metadata=metadata || $2::jsonb, next_action=$3 WHERE id=$1', [opportunity.id, JSON.stringify({ discoveryRunId: runId, discoverySource: finding.sourceId, economicTruth: 'OBSERVED — NOT VERIFIED', autonomousAction: 'discovery-only' }), 'Verify source, buyer demand, deliverability, and commercial terms']);
      }
    } catch (error: any) { errors.push(source.id + ': ' + (error?.message || String(error))); }
  }
  await db.query('INSERT INTO glorifier_discovery_runs (id,actor,status,sources_scanned,findings_observed,opportunities_created,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)', [runId, actor, errors.length ? 'partial' : 'completed', sources.length, findingsObserved, opportunitiesCreated, JSON.stringify({ errors, sources: sources.map(s => s.id), policyVersion: GLORIFIER_24X7_DISCOVERY_VERSION })]);
  return { runId, completedAt: new Date().toISOString(), actor, sourcesScanned: sources.length, findingsObserved, opportunitiesCreated, errors, policy: get24x7OpportunityDiscoveryPolicy() };
}

export function start24x7OpportunityDiscoveryDaemon() {
  if (discoveryTimer) return { running: true, intervalMs: get24x7OpportunityDiscoveryPolicy().defaultIntervalMs };
  const intervalMs = get24x7OpportunityDiscoveryPolicy().defaultIntervalMs;
  const tick = async () => {
    if (discoveryRunning) return;
    discoveryRunning = true;
    try {
      await run24x7OpportunityDiscoveryCycle('ai-ceo-autonomous-discovery');
      lastDiscoveryError = null;
    } catch (error) {
      lastDiscoveryError = error instanceof Error ? error.message : String(error);
    } finally {
      discoveryRunning = false;
    }
  };
  void tick();
  discoveryTimer = setInterval(() => { void tick(); }, intervalMs);
  discoveryTimer.unref?.();
  return { running: true, intervalMs };
}

export function stop24x7OpportunityDiscoveryDaemon() {
  if (discoveryTimer) clearInterval(discoveryTimer);
  discoveryTimer = null;
  discoveryRunning = false;
  return { running: false };
}

export async function get24x7OpportunityDiscoveryStatus() {
  await initialize24x7OpportunityDiscovery();
  const db = getPostgresPool();
  const runs = await db.query('SELECT * FROM glorifier_discovery_runs ORDER BY created_at DESC LIMIT 20');
  const findings = await db.query('SELECT status, scientist_id, COUNT(*)::int AS count FROM glorifier_discovery_findings GROUP BY status, scientist_id ORDER BY count DESC');
  const assignments = await db.query('SELECT assignee_type, status, COUNT(*)::int AS count FROM glorifier_discovery_assignments GROUP BY assignee_type, status ORDER BY assignee_type, status');
  const latestRun = runs.rows[0] || null;
  return { policy: get24x7OpportunityDiscoveryPolicy(), daemon: { running: Boolean(discoveryTimer), cycleRunning: discoveryRunning, lastError: lastDiscoveryError }, freshness: { latestRunAt: latestRun?.created_at || null, stale: !latestRun || (Date.now() - new Date(latestRun.created_at).getTime()) > get24x7OpportunityDiscoveryPolicy().defaultIntervalMs * 2 }, recentRuns: runs.rows, queueByScientist: findings.rows, assignmentQueue: assignments.rows, modelAndScientistDelegation: 'ALL_REGISTERED_MODELS_AND_ALL_MONETIZATION_SCIENTISTS' };
}