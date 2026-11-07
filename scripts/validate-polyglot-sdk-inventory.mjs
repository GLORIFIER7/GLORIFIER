#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const POLYGLOT_SDK_CATALOG = Object.freeze([
  { language: 'Python', packageName: 'python', capabilityId: 'sdk.python-contract', workflow: 'python', jobName: 'python-sdk-tests' },
  { language: 'Go', packageName: 'go', capabilityId: 'sdk.go-neural-http-client', workflow: 'python', jobName: 'go-sdk-tests' },
  { language: 'Java', packageName: 'java', capabilityId: 'sdk.java-neural-http-client', workflow: 'polyglot', jobName: 'java' },
  { language: 'Kotlin', packageName: 'kotlin', capabilityId: 'sdk.kotlin-neural-http-client', workflow: 'polyglot', jobName: 'kotlin' },
  { language: 'C# / .NET', packageName: 'dotnet', capabilityId: 'sdk.dotnet-neural-http-client', workflow: 'polyglot', jobName: 'dotnet' },
  { language: 'Rust', packageName: 'rust', capabilityId: 'sdk.rust-neural-http-client', workflow: 'polyglot', jobName: 'rust' },
  { language: 'PHP', packageName: 'php', capabilityId: 'sdk.php-neural-http-client', workflow: 'polyglot', jobName: 'php' },
  { language: 'Ruby', packageName: 'ruby', capabilityId: 'sdk.ruby-neural-http-client', workflow: 'polyglot', jobName: 'ruby' },
  { language: 'Swift', packageName: 'swift', capabilityId: 'sdk.swift-neural-http-client', workflow: 'polyglot', jobName: 'swift' },
  { language: 'Dart', packageName: 'dart', capabilityId: 'sdk.dart-neural-http-client', workflow: 'polyglot', jobName: 'dart' },
  { language: 'JavaScript / TypeScript', packageName: 'javascript', capabilityId: 'sdk.javascript-typescript-node', workflow: 'polyglot', jobName: 'javascript' },
]);

const STALE_TEN_SDK_CLAIMS = [
  /initial SDK delivery is complete for the ten languages/i,
  /the ten maintained first-party HTTP\/JSON clients/i,
  /the ten languages listed above/i,
];

export function validatePolyglotSdkInventory({
  registry,
  architectureGuide,
  sdkReadme,
  polyglotWorkflow,
  pythonWorkflow,
}) {
  const errors = [];
  const capabilities = Array.isArray(registry?.capabilities) ? registry.capabilities : [];
  const sdkCapabilities = capabilities.filter((capability) =>
    typeof capability?.id === 'string' && capability.id.startsWith('sdk.'));
  const capabilityById = new Map(sdkCapabilities.map((capability) => [capability.id, capability]));
  const expectedIds = new Set(POLYGLOT_SDK_CATALOG.map((sdk) => sdk.capabilityId));

  if (sdkCapabilities.length !== POLYGLOT_SDK_CATALOG.length ||
      [...expectedIds].some((id) => !capabilityById.has(id)) ||
      sdkCapabilities.some((capability) => !expectedIds.has(capability.id))) {
    errors.push(
      `SDK capability inventory must contain exactly the ${POLYGLOT_SDK_CATALOG.length} catalogued first-party SDK records.`,
    );
  }

  for (const sdk of POLYGLOT_SDK_CATALOG) {
    const capability = capabilityById.get(sdk.capabilityId);
    if (!capability) {
      errors.push(`Missing SDK capability record: ${sdk.capabilityId}.`);
    } else {
      const allowedStatuses = new Set(Array.isArray(registry?.statusVocabulary) ? registry.statusVocabulary : []);
      if (!allowedStatuses.has(capability.status)) {
        errors.push(`${sdk.language} SDK capability has an unsupported evidence status: ${capability.status}.`);
      }
      if (!Array.isArray(capability.targetEnvironments) || capability.targetEnvironments.length === 0) {
        errors.push(`${sdk.language} SDK capability must name its exact target environment.`);
      }
      if (capability.status === 'VERIFIED' &&
          (!Array.isArray(capability.evidence) ||
           !capability.evidence.some((item) => item?.kind === 'ci-run' && typeof item.reference === 'string' && item.reference.trim()))) {
        errors.push(`${sdk.language} SDK capability marked VERIFIED must retain a CI-run evidence reference.`);
      }
    }

    const rowPrefix = `| ${sdk.language} | \`sdk/${sdk.packageName}\` |`;
    const statusSuffix = `| ${capability?.status ?? 'UNKNOWN'} |`;
    const readmeRows = typeof sdkReadme === 'string'
      ? sdkReadme.split(/\r?\n/).filter((line) => line.startsWith(rowPrefix))
      : [];
    const guideRows = typeof architectureGuide === 'string'
      ? architectureGuide.split(/\r?\n/).filter((line) => line.startsWith(rowPrefix))
      : [];
    if (readmeRows.length === 0) {
      errors.push(`SDK package index is missing the ${sdk.language} row (${rowPrefix}).`);
    } else if (!readmeRows.some((line) => line.endsWith(statusSuffix))) {
      errors.push(`SDK package index evidence status for ${sdk.language} must match the capability registry (${statusSuffix}).`);
    }
    if (guideRows.length === 0) {
      errors.push(`Language-neutral architecture guide is missing the ${sdk.language} row (${rowPrefix}).`);
    } else if (!guideRows.some((line) => line.endsWith(statusSuffix))) {
      errors.push(`Language-neutral architecture guide evidence status for ${sdk.language} must match the capability registry (${statusSuffix}).`);
    }

    const workflow = sdk.workflow === 'python' ? pythonWorkflow : polyglotWorkflow;
    const jobDefinition = new RegExp('^  ' + sdk.jobName + ':\\s*(?:#.*)?
      errors.push(`${sdk.language} SDK CI job is missing: ${sdk.jobName}.`);
    }
  }

  if (typeof architectureGuide === 'string') {
    for (const pattern of STALE_TEN_SDK_CLAIMS) {
      if (pattern.test(architectureGuide)) {
        errors.push(`Architecture guide contains a stale ten-SDK statement: ${pattern}.`);
      }
    }
  }
  return errors;
}

async function main() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const read = (path) => readFile(join(repositoryRoot, path), 'utf8');
  let registry;
  let architectureGuide;
  let sdkReadme;
  let polyglotWorkflow;
  let pythonWorkflow;
  let fixtureText;

  try {
    [registry, architectureGuide, sdkReadme, polyglotWorkflow, pythonWorkflow, fixtureText] = await Promise.all([
      read('docs/architecture/interoperability-capabilities.json').then(JSON.parse),
      read('docs/architecture/language-neutral-interoperability.md'),
      read('sdk/README.md'),
      read('.github/workflows/polyglot-sdk.yml'),
      read('.github/workflows/python-sdk.yml'),
      read('docs/architecture/interoperability-contract-fixtures.json'),
    ]);
    JSON.parse(fixtureText);
  } catch (error) {
    console.error(`Polyglot inventory inputs could not be read or parsed: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const errors = validatePolyglotSdkInventory({
    registry,
    architectureGuide,
    sdkReadme,
    polyglotWorkflow,
    pythonWorkflow,
  });

  for (const sdk of POLYGLOT_SDK_CATALOG) {
    try {
      const details = await stat(join(repositoryRoot, 'sdk', sdk.packageName));
      if (!details.isDirectory()) errors.push(`SDK package path is not a directory: sdk/${sdk.packageName}.`);
    } catch {
      errors.push(`SDK package directory is missing: sdk/${sdk.packageName}.`);
    }
  }

  if (errors.length > 0) {
    console.error(`Polyglot SDK inventory validation failed (${errors.length} issue(s)):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Polyglot SDK inventory valid: ${POLYGLOT_SDK_CATALOG.length} first-party SDKs align across package directories, documentation, capability evidence, and CI jobs.`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
, 'm');
    if (typeof workflow !== 'string' || !jobDefinition.test(workflow)) {
      errors.push(`${sdk.language} SDK CI job is missing: ${sdk.jobName}.`);
    }
  }

  if (typeof architectureGuide === 'string') {
    for (const pattern of STALE_TEN_SDK_CLAIMS) {
      if (pattern.test(architectureGuide)) {
        errors.push(`Architecture guide contains a stale ten-SDK statement: ${pattern}.`);
      }
    }
  }
  return errors;
}

async function main() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const read = (path) => readFile(join(repositoryRoot, path), 'utf8');
  let registry;
  let architectureGuide;
  let sdkReadme;
  let polyglotWorkflow;
  let pythonWorkflow;
  let fixtureText;

  try {
    [registry, architectureGuide, sdkReadme, polyglotWorkflow, pythonWorkflow, fixtureText] = await Promise.all([
      read('docs/architecture/interoperability-capabilities.json').then(JSON.parse),
      read('docs/architecture/language-neutral-interoperability.md'),
      read('sdk/README.md'),
      read('.github/workflows/polyglot-sdk.yml'),
      read('.github/workflows/python-sdk.yml'),
      read('docs/architecture/interoperability-contract-fixtures.json'),
    ]);
    JSON.parse(fixtureText);
  } catch (error) {
    console.error(`Polyglot inventory inputs could not be read or parsed: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const errors = validatePolyglotSdkInventory({
    registry,
    architectureGuide,
    sdkReadme,
    polyglotWorkflow,
    pythonWorkflow,
  });

  for (const sdk of POLYGLOT_SDK_CATALOG) {
    try {
      const details = await stat(join(repositoryRoot, 'sdk', sdk.packageName));
      if (!details.isDirectory()) errors.push(`SDK package path is not a directory: sdk/${sdk.packageName}.`);
    } catch {
      errors.push(`SDK package directory is missing: sdk/${sdk.packageName}.`);
    }
  }

  if (errors.length > 0) {
    console.error(`Polyglot SDK inventory validation failed (${errors.length} issue(s)):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`Polyglot SDK inventory valid: ${POLYGLOT_SDK_CATALOG.length} first-party SDKs align across package directories, documentation, capability evidence, and CI jobs.`);
}

const entrypoint = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (entrypoint === import.meta.url) await main();
