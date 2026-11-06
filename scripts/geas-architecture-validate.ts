import { getGeasArchitectureControls, getGeasArchitectureModel, getGeasArchitecturePatterns, getGeasArchitectureSources } from '../src/lib/governance/geas-architecture-scientist';

const model = getGeasArchitectureModel();
const controls = getGeasArchitectureControls();
const patterns = getGeasArchitecturePatterns();
const sources = getGeasArchitectureSources();

const failures: string[] = [];

if (model.sourcePolicyVersion !== 'GEAS-AUTHORITY-2') failures.push('source policy version must match the authoritative registry');
if (JSON.stringify(model.architectureStateModel) !== JSON.stringify(['desired','declared','deployed','observed','verified'])) failures.push('five-state reconciliation model missing');
if (!model.operatingRule.includes('must not autonomously apply irreversible production changes')) failures.push('irreversible-change safety rule missing');
if (model.unknownPolicy !== 'Missing or unavailable evidence remains UNKNOWN; no compliance is inferred from absence of evidence.') failures.push('unknown-evidence policy changed');
for (const id of ['TRACE-01','LEASE-01','TEL-01','ECO-01']) if (!controls.some(c => c.id === id)) failures.push('missing control '+id);
for (const id of ['nist-token-protection','otel-genai-agents','finops-focus-1-4','nist-zero-trust']) if (!sources.some(s => s.id === id)) failures.push('missing authoritative source '+id);
for (const id of ['token-lifecycle-protection','genai-agent-telemetry','zero-trust-resource-access','focus-invoice-reconciliation']) if (!patterns.some(p => p.id === id)) failures.push('missing architecture pattern '+id);
const focusSource = sources.find(source => source.id === 'finops-focus-1-4');
const focusPattern = patterns.find(pattern => pattern.id === 'focus-invoice-reconciliation');
if (!focusSource || !focusSource.patternIds.includes('focus-invoice-reconciliation')) failures.push('FOCUS 1.4 source must declare its invoice-reconciliation pattern');
if (!focusPattern || focusPattern.sourceId !== 'finops-focus-1-4' || focusPattern.domain !== 'finops') failures.push('FOCUS 1.4 invoice-reconciliation pattern must map to its dedicated FinOps source');

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
