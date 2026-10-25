import { readFile } from 'node:fs/promises';

const registryPath = new URL('../docs/architecture/interoperability-capabilities.json', import.meta.url);
const schemaPath = new URL('../docs/architecture/interoperability-capabilities.schema.json', import.meta.url);
const allowedStatuses = new Set([
  'VERIFIED',
  'PARTIALLY VERIFIED',
  'NOT VERIFIED',
  'DEGRADED',
  'NOT OBSERVABLE',
]);
const evidenceKinds = new Set(['source', 'documentation', 'schema', 'automated-test', 'ci-run', 'live-probe']);

const registry = JSON.parse(await readFile(registryPath, 'utf8'));
const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const errors = [];

const requireText = (value, field, context) => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    errors.push(`${context}: ${field} must be a non-empty string`);
  }
};

if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') {
  errors.push('Schema must declare JSON Schema draft 2020-12.');
}
if (registry.schemaVersion !== '1.0.0') errors.push('Unsupported schemaVersion.');
if (!Number.isFinite(Date.parse(registry.updatedAt))) errors.push('updatedAt must be an ISO date-time.');
if (!Array.isArray(registry.statusVocabulary) || registry.statusVocabulary.length !== allowedStatuses.size ||
    registry.statusVocabulary.some((status) => !allowedStatuses.has(status))) {
  errors.push('statusVocabulary must match the defined evidence status vocabulary.');
}
if (!Array.isArray(registry.capabilities) || registry.capabilities.length === 0) {
  errors.push('capabilities must be a non-empty array.');
}

const ids = new Set();
for (const [index, capability] of (registry.capabilities || []).entries()) {
  const context = `capabilities[${index}]`;
  requireText(capability.id, 'id', context);
  requireText(capability.title, 'title', context);
  requireText(capability.boundary, 'boundary', context);
  requireText(capability.scope, 'scope', context);

  if (ids.has(capability.id)) errors.push(`${context}: duplicate id ${capability.id}`);
  ids.add(capability.id);
  if (!allowedStatuses.has(capability.status)) errors.push(`${context}: invalid status ${capability.status}`);
  if (!Array.isArray(capability.targetEnvironments) || capability.targetEnvironments.length === 0 ||
      capability.targetEnvironments.some((target) => typeof target !== 'string' || !target.trim())) {
    errors.push(`${context}: targetEnvironments must identify at least one exact environment`);
  }
  if (!Array.isArray(capability.evidence)) errors.push(`${context}: evidence must be an array`);
  if (!Array.isArray(capability.limitations) || capability.limitations.length === 0 ||
      capability.limitations.some((item) => typeof item !== 'string' || !item.trim())) {
    errors.push(`${context}: limitations must be explicit and non-empty`);
  }

  const evidence = Array.isArray(capability.evidence) ? capability.evidence : [];
  for (const [evidenceIndex, item] of evidence.entries()) {
    const evContext = `${context}.evidence[${evidenceIndex}]`;
    if (!evidenceKinds.has(item.kind)) errors.push(`${evContext}: invalid kind ${item.kind}`);
    requireText(item.reference, 'reference', evContext);
    requireText(item.targetEnvironment, 'targetEnvironment', evContext);
    requireText(item.notes, 'notes', evContext);
    if (item.observedAt !== null &&
        (typeof item.observedAt !== 'string' || !Number.isFinite(Date.parse(item.observedAt)))) {
      errors.push(`${evContext}: observedAt must be null or an ISO date-time`);
    }
  }

  if (capability.status === 'VERIFIED') {
    const needsLiveProbe = /live|production|staging/i.test(capability.scope);
    const goodEvidence = evidence.some((item) => {
      const acceptableKind = needsLiveProbe ? item.kind === 'live-probe' :
        ['automated-test', 'ci-run', 'live-probe'].includes(item.kind);
      return acceptableKind && typeof item.observedAt === 'string' &&
        Number.isFinite(Date.parse(item.observedAt)) &&
        typeof item.targetEnvironment === 'string' && item.targetEnvironment.trim().length > 0 &&
        typeof item.reference === 'string' && item.reference.trim().length > 0;
    });
    if (!goodEvidence) {
      errors.push(`${context}: VERIFIED requires timestamped test evidence; live scopes require a live-probe reference`);
    }
  }
}

if (errors.length > 0) {
  console.error('Interoperability capability registry validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  const counts = Object.fromEntries([...allowedStatuses].map((status) => [
    status,
    registry.capabilities.filter((capability) => capability.status === status).length,
  ]));
  console.log(`Validated ${registry.capabilities.length} interoperability capabilities.`);
  console.log(`Evidence statuses: ${JSON.stringify(counts)}`);
  console.log('No capability is marked VERIFIED without timestamped evidence and a target environment.');
}
