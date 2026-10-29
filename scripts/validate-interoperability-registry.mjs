#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const ALLOWED_STATUSES = new Set([
  'VERIFIED',
  'PARTIALLY VERIFIED',
  'NOT VERIFIED',
  'DEGRADED',
  'NOT OBSERVABLE',
]);

// Registry metadata must never contain credential material. Match field names,
// not arbitrary prose, to avoid false positives in explanatory notes.
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
  if (typeof registry.schemaVersion !== 'string' || !registry.schemaVersion.trim()) {
    add('schemaVersion', 'must be a non-empty string');
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
  }
  if (!Array.isArray(registry.capabilities)) {
    add('capabilities', 'must be an array');
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
    if (!Array.isArray(capability.evidence)) {
      add(`${path}.evidence`, 'must be an array; use [] when no evidence exists');
    } else {
      if (capability.status === 'VERIFIED' && capability.evidence.length === 0) {
        add(`${path}.evidence`, 'VERIFIED capabilities require at least one evidence reference');
      }
      for (const [evidenceIndex, evidence] of capability.evidence.entries()) {
        const evidencePath = `${path}.evidence[${evidenceIndex}]`;
        if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
          add(evidencePath, 'must be an object');
          continue;
        }
        if (typeof evidence.kind !== 'string' || !evidence.kind.trim()) {
          add(`${evidencePath}.kind`, 'must be a non-empty string');
        }
        if (typeof evidence.reference !== 'string' || !evidence.reference.trim()) {
          add(`${evidencePath}.reference`, 'must be a non-empty string');
        }
      }
    }
  }
  errors.push(...findSecretFields(registry));
  return errors;
}

async function main() {
  const path = process.argv[2] ?? 'docs/architecture/interoperability-capabilities.json';
  let registry;
  try {
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

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await main();
}
