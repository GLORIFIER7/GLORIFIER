#!/usr/bin/env node
import { readFile, realpath } from 'node:fs/promises';
import { isEvidenceTimestampFresh } from './interoperability-evidence-policy.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

const ALLOWED_STATUSES = new Set([
  'VERIFIED',
  'PARTIALLY VERIFIED',
  'NOT VERIFIED',
  'DEGRADED',
  'NOT OBSERVABLE',
]);
const ALLOWED_EVIDENCE_KINDS = new Set([
  'source', 'documentation', 'schema', 'automated-test', 'ci-run', 'live-probe',
]);
const ALLOWED_REGISTRY_FIELDS = new Set(['schemaVersion', 'updatedAt', 'statusVocabulary', 'capabilities']);
const ALLOWED_CAPABILITY_FIELDS = new Set([
  'id', 'title', 'boundary', 'scope', 'status', 'targetEnvironments', 'evidence', 'limitations',
]);
const ALLOWED_EVIDENCE_FIELDS = new Set([
  'kind', 'reference', 'targetEnvironment', 'observedAt', 'notes',
]);

function rejectUnknownFields(value, allowedFields, path, add) {
  for (const key of Object.keys(value)) {
    if (!allowedFields.has(key)) {
      add(`${path}.${key}`, 'unknown property is not allowed by the interoperability registry schema');
    }
  }
}

function isSecretFieldName(key) {
  const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return /(?:apikey|token|secret|password|privatekey|authorization|credential)/.test(normalized);
}

function findSecretFields(value, path = '$', findings = []) {
  if (!value || typeof value !== 'object') return findings;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (isSecretFieldName(key)) {
      findings.push({ path: childPath, message: 'secret-like field names are forbidden in the evidence registry' });
    }
    findSecretFields(child, childPath, findings);
  }
  return findings;
}

export function validateInteroperabilityRegistry(registry) {
  const errors = [];
  const add = (path, message) => errors.push({ path, message });

  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    return [{ path: '$', message: 'registry must be a JSON object' }];
  }
  rejectUnknownFields(registry, ALLOWED_REGISTRY_FIELDS, '$', add);
  if (typeof registry.schemaVersion !== 'string' || !registry.schemaVersion.trim()) {
    add('schemaVersion', 'must be a non-empty string');
  }
  if (typeof registry.updatedAt !== 'string' || !Number.isFinite(Date.parse(registry.updatedAt))) {
    add('updatedAt', 'must be a valid ISO date-time');
  }
  if (!Array.isArray(registry.statusVocabulary)) {
    add('statusVocabulary', 'must be an array');
  } else {
    const seenStatuses = new Set();
    for (const [index, status] of registry.statusVocabulary.entries()) {
      if (!ALLOWED_STATUSES.has(status)) add(`statusVocabulary[${index}]`, `unsupported status: ${String(status)}`);
      if (seenStatuses.has(status)) add(`statusVocabulary[${index}]`, `duplicate status: ${String(status)}`);
      seenStatuses.add(status);
    }
    if (seenStatuses.size !== ALLOWED_STATUSES.size ||
        [...ALLOWED_STATUSES].some((status) => !seenStatuses.has(status))) {
      add('statusVocabulary', 'must contain each allowed status exactly once');
    }
  }
  if (!Array.isArray(registry.capabilities) || registry.capabilities.length === 0) {
    add('capabilities', 'must be a non-empty array');
    errors.push(...findSecretFields(registry));
    return errors;
  }

  const ids = new Set();
  for (const [index, capability] of registry.capabilities.entries()) {
    const path = `capabilities[${index}]`;
    if (!capability || typeof capability !== 'object' || Array.isArray(capability)) {
      add(path, 'must be an object');
      continue;
    }
    rejectUnknownFields(capability, ALLOWED_CAPABILITY_FIELDS, path, add);
    for (const field of ['id', 'title', 'boundary', 'scope']) {
      if (typeof capability[field] !== 'string' || !capability[field].trim()) {
        add(`${path}.${field}`, 'must be a non-empty string');
      }
    }
    if (typeof capability.id === 'string' && capability.id.trim()) {
      if (ids.has(capability.id)) add(`${path}.id`, `duplicate capability id: ${capability.id}`);
      ids.add(capability.id);
    }
    if (!ALLOWED_STATUSES.has(capability.status)) {
      add(`${path}.status`, `unsupported status: ${String(capability.status)}`);
    }
    if (!Array.isArray(capability.targetEnvironments) || capability.targetEnvironments.length === 0 ||
        capability.targetEnvironments.some((item) => typeof item !== 'string' || !item.trim())) {
      add(`${path}.targetEnvironments`, 'must identify at least one exact environment');
    }
    if (!Array.isArray(capability.limitations) || capability.limitations.length === 0 ||
        capability.limitations.some((item) => typeof item !== 'string' || !item.trim())) {
      add(`${path}.limitations`, 'must be explicit and non-empty');
    }
    if (!Array.isArray(capability.evidence)) {
      add(`${path}.evidence`, 'must be an array; use [] when no evidence exists');
      continue;
    }
    for (const [evidenceIndex, evidence] of capability.evidence.entries()) {
      const evidencePath = `${path}.evidence[${evidenceIndex}]`;
      if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
        add(evidencePath, 'must be an object');
        continue;
      }
      rejectUnknownFields(evidence, ALLOWED_EVIDENCE_FIELDS, evidencePath, add);
      if (!ALLOWED_EVIDENCE_KINDS.has(evidence.kind)) {
        add(`${evidencePath}.kind`, `unsupported evidence kind: ${String(evidence.kind)}`);
      }
      if (typeof evidence.reference !== 'string' || !evidence.reference.trim()) {
        add(`${evidencePath}.reference`, 'must be a non-empty string');
      }
      if (typeof evidence.targetEnvironment !== 'string' || !evidence.targetEnvironment.trim()) {
        add(`${evidencePath}.targetEnvironment`, 'must be a non-empty string');
      }
      if (typeof evidence.notes !== 'string' || !evidence.notes.trim()) {
        add(`${evidencePath}.notes`, 'must be a non-empty string');
      }
      if (evidence.observedAt !== null &&
          (typeof evidence.observedAt !== 'string' || !Number.isFinite(Date.parse(evidence.observedAt)))) {
        add(`${evidencePath}.observedAt`, 'must be null or a valid date-time');
      }
    }
    if (capability.status === 'VERIFIED') {
      const needsLiveProbe = /live|production|staging/i.test(capability.scope);
      const hasFreshEvidence = capability.evidence.some((evidence) => {
        if (!evidence || typeof evidence !== 'object') return false;
        const acceptableKind = needsLiveProbe ? evidence.kind === 'live-probe' :
          ['automated-test', 'ci-run', 'live-probe'].includes(evidence.kind);
        return acceptableKind &&
          isEvidenceTimestampFresh(evidence.observedAt, { live: needsLiveProbe }) &&
          typeof evidence.reference === 'string' && evidence.reference.trim() &&
          typeof evidence.targetEnvironment === 'string' && evidence.targetEnvironment.trim();
      });
      if (!hasFreshEvidence) {
        add(`${path}.evidence`, 'VERIFIED requires fresh timestamped test/CI evidence; live scopes require a live-probe no older than 24 hours');
      }
    }
  }
  errors.push(...findSecretFields(registry));
  return errors;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryRoot = resolve(repositoryRoot, 'docs', 'architecture');

async function resolveRegistryPath(candidate) {
  let requestedPath;
  if (candidate) {
    requestedPath = isAbsolute(candidate)
      ? resolve(candidate)
      : resolve(repositoryRoot, candidate);
  } else {
    requestedPath = resolve(registryRoot, 'interoperability-capabilities.json');
  }
  const [canonicalRoot, canonicalPath] = await Promise.all([
    realpath(registryRoot),
    realpath(requestedPath),
  ]);
  const relativePath = relative(canonicalRoot, canonicalPath);
  if (!relativePath || relativePath === '..' || relativePath.startsWith('..' + sep) || isAbsolute(relativePath)) {
    throw new Error('Registry path must remain inside docs/architecture.');
  }
  return canonicalPath;
}

async function main() {
  let registry;
  try {
    const path = await resolveRegistryPath(process.argv[2]);
    registry = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    console.error(`Registry read/JSON parse failed: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  const errors = validateInteroperabilityRegistry(registry);
  if (errors.length) {
    console.error(`Interoperability registry validation failed (${errors.length} issue(s)):`);
    for (const error of errors) console.error(`- ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Interoperability registry valid: ${registry.capabilities.length} capability record(s); status labels are controlled.`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
