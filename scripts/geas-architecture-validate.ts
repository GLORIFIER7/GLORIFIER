import { getGeasArchitectureControls, getGeasArchitectureModel, getGeasArchitecturePatterns, getGeasArchitectureSources } from '../src/lib/governance/geas-architecture-scientist';

const model = getGeasArchitectureModel();
const controls = getGeasArchitectureControls();
const patterns = getGeasArchitecturePatterns();
const sources = getGeasArchitectureSources();

const failures: string[] = [];

if (model.sourcePolicyVersion !== 'GEAS-AUTHORITY-1') failures.push('unexpected source policy version');
if (JSON.stringify(model.architectureStateModel) !== JSON.stringify(['desired','declared','deployed','observed','verified'])) failures.push('five-state reconciliation model missing');
if (!model.operatingRule.includes('must not autonomously apply irreversible production changes')) failures.push('irreversible-change safety rule missing');
if (model.unknownPolicy !== 'Missing or unavailable evidence remains UNKNOWN; no compliance is inferred from absence of evidence.') failures.push('unknown-evidence policy changed');
for (const id of ['TRACE-01','LEASE-01','TEL-01','ECO-01']) if (!controls.some(c => c.id === id)) failures.push('missing control '+id);
for (const id of ['nist-token-protection','otel-genai-agents','finops-focus-1-4','nist-zero-trust']) if (!sources.some(s => s.id === id)) failures.push('missing authoritative source '+id);
for (const id of ['token-lifecycle-protection','genai-agent-telemetry','zero-trust-resource-access']) if (!patterns.some(p => p.id === id)) failures.push('missing architecture pattern '+id);

if (failures.length) {
  console.error(JSON.stringify({ valid: false, failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({
  valid: true,
  version: model.version,
  sourcePolicyVersion: model.sourcePolicyVersion,
  domains: model.domains.length,
  sources: sources.length,
  patterns: patterns.length,
  controls: controls.length,
  irreversibleChangesExecuted: false
}, null, 2));
