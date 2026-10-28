import { readFile } from 'node:fs/promises';
import { isEvidenceTimestampFresh } from './interoperability-evidence-policy.mjs';

const registryPath = new URL('../docs/architecture/interoperability-capabilities.json', import.meta.url);
const schemaPath = new URL('../docs/architecture/interoperability-capabilities.schema.json', import.meta.url);
const openApiPath = new URL('../docs/architecture/openapi/glorifier-neural-adapter.openapi.json', import.meta.url);
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
const openApi = JSON.parse(await readFile(openApiPath, 'utf8'));
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


if (openApi.openapi !== '3.1.0') errors.push('Neural adapter OpenAPI document must use OpenAPI 3.1.0.');
const taskOperation = openApi.paths?.['/api/neural/v1/tasks']?.post;
const taskRequestSchema = openApi.components?.schemas?.TaskRequest;
if (!taskOperation) errors.push('OpenAPI contract must define POST /api/neural/v1/tasks.');
if (!taskOperation?.security?.some((entry) => Object.hasOwn(entry, 'bearerAuth'))) {
  errors.push('Neural task endpoint must declare bearerAuth.');
}
if (!taskOperation?.parameters?.some((entry) => entry.$ref === '#/components/parameters/CorrelationId')) {
  errors.push('Neural task endpoint must declare the optional correlation ID header.');
}
if (openApi.components?.parameters?.CorrelationId?.schema?.format !== 'uuid') {
  errors.push('The shared correlation ID parameter must be documented as a UUID.');
}
for (const [path, pathItem] of Object.entries(openApi.paths || {})) {
  for (const [method, operation] of Object.entries(pathItem || {})) {
    if (!['get', 'head', 'post'].includes(method) || !operation?.responses) continue;
    for (const [statusCode, response] of Object.entries(operation.responses)) {
      if (!response?.headers?.['X-Correlation-ID']) {
        errors.push(`OpenAPI ${method.toUpperCase()} ${path} response ${statusCode} must document X-Correlation-ID.`);
      }
    }
  }
}
if (taskRequestSchema?.properties?.task?.maxLength !== 20000) {
  errors.push('TaskRequest.task must cap text at the Neural API limit of 20,000 characters.');
}
if (taskRequestSchema?.properties?.action_class?.maxLength !== 64) {
  errors.push('TaskRequest.action_class must cap at the Neural API limit of 64 characters.');
}
if (taskRequestSchema?.additionalProperties !== false || !taskRequestSchema?.required?.includes('task')) {
  errors.push('TaskRequest must require task and forbid unknown properties to match GLORIFIER-NEURAL.');
}
if (!taskOperation?.responses?.['413'] || !taskOperation?.responses?.['415']) {
  errors.push('Neural task API contract must document oversized-body and unsupported-media-type errors.');
}
if (!String(taskOperation?.description || '').includes('65,536 bytes')) {
  errors.push('Neural task API contract must document the 65,536-byte request-body limit.');
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
      const freshEnough = isEvidenceTimestampFresh(item.observedAt, { live: needsLiveProbe });
      return acceptableKind && freshEnough &&
        typeof item.reference === 'string' && item.reference.trim().length > 0;
    });
    if (!goodEvidence) {
      errors.push(`${context}: VERIFIED requires timestamped evidence matching a declared target environment; live scopes require a live-probe no older than 24 hours`);
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
