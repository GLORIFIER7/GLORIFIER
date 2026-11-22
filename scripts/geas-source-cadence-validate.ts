import { readFileSync } from 'node:fs';
import { parseScannerSourceCatalog } from './geas-source-catalog-parser.ts';

type RegistrySource = {
  id: string;
  authority: string;
  domain: string;
  url: string;
  reviewCadenceDays: number;
  scannerStatus: 'active' | 'discovery-only';
};
type Registry = { sources: RegistrySource[] };

const registryPath = 'docs/architecture/geas-authoritative-source-registry.json';
const scannerPath = 'src/lib/governance/geas-architecture-scientist.ts';
const workflowPath = '.github/workflows/geas-architecture-scan.yml';
const scanOperationsDocPath = 'docs/architecture/geas-scan-operations.md';
const workflowText = readFileSync(workflowPath, 'utf8');
const parserPathEntry = "      - 'scripts/geas-source-catalog-parser.ts'";
const extractPullRequestSection = (text: string): string => {
  const pullRequestSectionStart = text.indexOf('  pull_request:\n');
  if (pullRequestSectionStart < 0) return '';
  const scheduleSectionStart = text.indexOf('\n  schedule:', pullRequestSectionStart);
  return scheduleSectionStart > pullRequestSectionStart
    ? text.slice(pullRequestSectionStart, scheduleSectionStart)
    : text.slice(pullRequestSectionStart);
};
const workflowFixtures = [
  `on:\n  pull_request:\n    paths:\n${parserPathEntry}\n`,
  `on:\n  schedule:\n    - cron: "17 */6 * * *"\n  pull_request:\n    paths:\n${parserPathEntry}\n`,
];
for (const fixture of workflowFixtures) {
  if (!extractPullRequestSection(fixture).includes(parserPathEntry)) {
    throw new Error('GEAS parser trigger extraction must handle absent or preceding schedule sections');
  }
}

type ScanWorkflowContract = {
  scheduleSectionCount: number;
  crons: string[];
  concurrencySectionCount: number;
  concurrencyGroup: string | null;
  cancelInProgress: string | null;
  scanStepCount: number;
  persistenceEntryCount: number;
  persistence: string | null;
};
type IndentedLine = { line: string; index: number };
const getIndentedBlock = (lines: string[], startIndex: number, parentIndent: number): IndentedLine[] => {
  const block: IndentedLine[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    if (indent <= parentIndent) break;
    block.push({ line, index });
  }
  return block;
};
const parseYamlScalar = (line: string, prefix: string): string => {
  const value = line.slice(prefix.length).trim();
  if (value.length >= 2
      && ((value.startsWith("'") && value.endsWith("'"))
        || (value.startsWith('"') && value.endsWith('"')))) {
    return value.slice(1, -1);
  }
  return value;
};
const parseScanWorkflowContract = (text: string): ScanWorkflowContract => {
  const lines = text.split('\n').map(line => line.endsWith('\r') ? line.slice(0, -1) : line);
  const scheduleIndexes = lines
    .map((line, index) => line === '  schedule:' ? index : -1)
    .filter(index => index >= 0);
  const crons = scheduleIndexes.flatMap(index => getIndentedBlock(lines, index, 2)
    .filter(({ line }) => line.startsWith('    - cron: '))
    .map(({ line }) => parseYamlScalar(line, '    - cron: ')));
  const concurrencyIndexes = lines
    .map((line, index) => line === 'concurrency:' ? index : -1)
    .filter(index => index >= 0);
  const concurrencyBlock = concurrencyIndexes.length === 1
    ? getIndentedBlock(lines, concurrencyIndexes[0]!, 0)
    : [];
  const groupLines = concurrencyBlock.filter(({ line }) => line.startsWith('  group: '));
  const cancelLines = concurrencyBlock.filter(({ line }) => line.startsWith('  cancel-in-progress: '));
  const scanStepIndexes = lines
    .map((line, index) => line.trim() === '- name: Execute authoritative architecture scan' ? index : -1)
    .filter(index => index >= 0);
  let persistenceEntries: IndentedLine[] = [];
  if (scanStepIndexes.length === 1) {
    const scanStepBlock = getIndentedBlock(lines, scanStepIndexes[0]!, 6);
    const envEntries = scanStepBlock.filter(({ line }) => line === '        env:');
    if (envEntries.length === 1) {
      persistenceEntries = getIndentedBlock(lines, envEntries[0]!.index, 8)
        .filter(({ line }) => /^ {10}GEAS_SCAN_PERSIST:\s*/.test(line));
    }
  }
  return {
    scheduleSectionCount: scheduleIndexes.length,
    crons,
    concurrencySectionCount: concurrencyIndexes.length,
    concurrencyGroup: groupLines.length === 1 ? parseYamlScalar(groupLines[0]!.line, '  group: ') : null,
    cancelInProgress: cancelLines.length === 1 ? parseYamlScalar(cancelLines[0]!.line, '  cancel-in-progress: ') : null,
    scanStepCount: scanStepIndexes.length,
    persistenceEntryCount: persistenceEntries.length,
    persistence: persistenceEntries.length === 1
      ? parseYamlScalar(persistenceEntries[0]!.line, '          GEAS_SCAN_PERSIST: ')
      : null,
  };
};
const isExpectedArtifactOnlyScanContract = (contract: ScanWorkflowContract): boolean =>
  contract.scheduleSectionCount === 1
  && contract.crons.length === 1
  && contract.crons[0] === '17 */6 * * *'
  && contract.concurrencySectionCount === 1
  && contract.concurrencyGroup === 'geas-architecture-scan'
  && contract.cancelInProgress === 'false'
  && contract.scanStepCount === 1
  && contract.persistenceEntryCount === 1
  && contract.persistence === 'false';
const validArtifactOnlyWorkflowFixture = [
  'on:',
  '  schedule:',
  '    - cron: "17 */6 * * *"',
  'concurrency:',
  '  group: geas-architecture-scan',
  '  cancel-in-progress: false',
  'jobs:',
  '  scan:',
  '    steps:',
  '      - name: Execute authoritative architecture scan',
  '        env:',
  "          GEAS_SCAN_PERSIST: 'false'",
].join('\n');
const scanWorkflowContractFixtures = [
  { name: 'valid artifact-only schedule', text: validArtifactOnlyWorkflowFixture, expected: true },
  { name: 'missing concurrency guard', text: validArtifactOnlyWorkflowFixture.replace('concurrency:\n  group: geas-architecture-scan\n  cancel-in-progress: false\n', ''), expected: false },
  { name: 'cancel in-progress scan', text: validArtifactOnlyWorkflowFixture.replace('cancel-in-progress: false', 'cancel-in-progress: true'), expected: false },
  { name: 'persistence enabled', text: validArtifactOnlyWorkflowFixture.replace("GEAS_SCAN_PERSIST: 'false'", "GEAS_SCAN_PERSIST: 'true'"), expected: false },
  { name: 'unexpected scan cadence', text: validArtifactOnlyWorkflowFixture.replace('17 */6 * * *', '17 */3 * * *'), expected: false },
  { name: 'additional cron schedule', text: validArtifactOnlyWorkflowFixture.replace('    - cron: "17 */6 * * *"', '    - cron: "17 */6 * * *"\n    - cron: "0 */1 * * *"'), expected: false },
  { name: 'duplicate schedule section', text: validArtifactOnlyWorkflowFixture.replace('concurrency:', '  schedule:\n    - cron: "0 */1 * * *"\nconcurrency:'), expected: false },
  { name: 'persistence in unrelated step only', text: validArtifactOnlyWorkflowFixture.replace(
    "      - name: Execute authoritative architecture scan\n        env:\n          GEAS_SCAN_PERSIST: 'false'",
    "      - name: Unrelated step\n        env:\n          GEAS_SCAN_PERSIST: 'false'\n      - name: Execute authoritative architecture scan\n        run: npm run scan:geas-architecture",
  ), expected: false },
  { name: 'missing authoritative scan step', text: validArtifactOnlyWorkflowFixture.replace(
    '      - name: Execute authoritative architecture scan',
    '      - name: Run a different step',
  ), expected: false },
];
for (const fixture of scanWorkflowContractFixtures) {
  const actual = isExpectedArtifactOnlyScanContract(parseScanWorkflowContract(fixture.text));
  if (actual !== fixture.expected) {
    throw new Error(`GEAS scan workflow contract fixture failed: ${fixture.name}`);
  }
}
if (!isExpectedArtifactOnlyScanContract(parseScanWorkflowContract(workflowText))) {
  throw new Error('GEAS GitHub scan must have exactly one six-hour schedule, serialize runs, and disable persistence on the authoritative scan step');
}
const scanOperationsDoc = readFileSync(scanOperationsDocPath, 'utf8');
for (const requiredStatement of [
  '## Scan execution modes',
  'GitHub Actions artifact-only scan',
  '`GEAS_SCAN_PERSIST=false`',
  'does not load previous PostgreSQL source observations',
  'does not acquire the PostgreSQL lease',
  'does not coordinate with the application daemon',
  'one active scanner process at a time',
  'Keep the application daemon disabled during the artifact-only workflow',
]) {
  if (!scanOperationsDoc.includes(requiredStatement)) {
    throw new Error(`GEAS scan operations documentation is missing: ${requiredStatement}`);
  }
}
const pullRequestSection = extractPullRequestSection(workflowText);
if (!pullRequestSection.includes(parserPathEntry)) {
  throw new Error('GEAS architecture scan must trigger when its source catalog parser changes');
}

const isValidReviewCadenceDays = (value: unknown): value is number =>
  typeof value === 'number'
  && Number.isSafeInteger(value)
  && value >= 1
  && Number.isSafeInteger(value * 24);
const isValidScannerCadenceHours = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;

// Exact URL equality is intentional: the configured source URL is also the cache identity.
// URL normalization is reserved for duplicate-alias detection, not cross-catalog parity.
const isMatchingSourceUrl = (registryUrl: string, scannerUrl: string): boolean =>
  registryUrl === scannerUrl;

const isMatchingSourceMetadata = (
  registry: { authority: string; domain: string },
  scanner: { authority: string; domain: string },
): boolean =>
  registry.authority === scanner.authority
  && registry.domain === scanner.domain;

const verifySourceUrlConsistency = (): void => {
  const canonicalUrl = 'https://example.org/canonical';
  if (!isMatchingSourceUrl(canonicalUrl, canonicalUrl)) {
    throw new Error('identical registry and scanner source URLs must be accepted');
  }
  if (isMatchingSourceUrl(canonicalUrl, 'https://example.org/legacy')) {
    throw new Error('divergent registry and scanner source URLs must be rejected');
  }
  if (isMatchingSourceUrl(canonicalUrl, 'https://example.org/canonical/')) {
    throw new Error('byte-different normalized URL forms must remain distinct cache identities');
  }
};

const verifySourceMetadataConsistency = (): void => {
  const registry = { authority: 'NIST', domain: 'ai' };
  if (!isMatchingSourceMetadata(registry, { authority: 'NIST', domain: 'ai' })) {
    throw new Error('identical registry and scanner authority/domain metadata must be accepted');
  }
  if (isMatchingSourceMetadata(registry, { authority: 'MITRE', domain: 'ai' })) {
    throw new Error('divergent source authority metadata must be rejected');
  }
  if (isMatchingSourceMetadata(registry, { authority: 'NIST', domain: 'cybersecurity' })) {
    throw new Error('divergent source domain metadata must be rejected');
  }
};

verifySourceUrlConsistency();
verifySourceMetadataConsistency();

const verifyCadenceBounds = (): void => {
  if (!isValidReviewCadenceDays(14)) throw new Error('ordinary review cadence must remain valid');
  if (isValidReviewCadenceDays(Number.MAX_SAFE_INTEGER)) {
    throw new Error('review cadence whose hour conversion is unsafe must be rejected');
  }
  if (isValidReviewCadenceDays(Math.floor(Number.MAX_SAFE_INTEGER / 24) + 1)) {
    throw new Error('review cadence must reject unsafe day-to-hour conversion');
  }
  if (isValidScannerCadenceHours(9007199254740992)) {
    throw new Error('scanner cadence must reject integers outside the safe range');
  }
};

const expectParserFailure = (fixture: string, description: string): void => {
  let rejected = false;
  try {
    rejected = parseScannerSourceCatalog(fixture).failures.length > 0;
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(description);
};

const verifyParserHandlesFactoryCalls = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] = [',
    "  createArchitectureSource('factory-one', 'Test', 'cloud', 'https://example.org/one', [], 24, ['claim-one']),",
    "  createArchitectureSource('factory-two', 'Test', 'cloud', 'https://example.org/two', ['pattern'], 336, ['claim-two']),",
    '];',
  ].join('\n');
  const parsed = parseScannerSourceCatalog(fixture);
  const expected = [
    { id: 'factory-one', authority: 'Test', domain: 'cloud', url: 'https://example.org/one', cadenceHours: 24, claimsAllowed: ['claim-one'] },
    { id: 'factory-two', authority: 'Test', domain: 'cloud', url: 'https://example.org/two', cadenceHours: 336, claimsAllowed: ['claim-two'] },
  ];
  if (JSON.stringify(parsed.entries) !== JSON.stringify(expected) || parsed.failures.length > 0) {
    throw new Error('scanner parser must read factory-form ID and cadence values');
  }
};

const verifyParserIgnoresCommentedFactoryCalls = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] = [',
    "  // createArchitectureSource('disabled-line', 'Test', 'cloud', 'https://example.org/disabled', [], 24, ['claim']),",
    "  /* createArchitectureSource('disabled-block', 'Test', 'cloud', 'https://example.org/disabled', [], 24, ['claim']), */",
    "  createArchitectureSource('active', 'Test', 'cloud', 'https://example.org/active', [], 24, ['active-claim']),",
    '];',
  ].join('\n');
  const parsed = parseScannerSourceCatalog(fixture);
  const expected = [{ id: 'active', authority: 'Test', domain: 'cloud', url: 'https://example.org/active', cadenceHours: 24, claimsAllowed: ['active-claim'] }];
  if (JSON.stringify(parsed.entries) !== JSON.stringify(expected) || parsed.declaredCount !== 1) {
    throw new Error('commented-out factory calls must not be counted as active scanner sources');
  }
};

const verifyParserHandlesBraceCharacters = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] = [{',
    "  id: 'fixture', authority: 'Test {Authority}', domain: 'cloud',",
    "  url: 'https://example.org/{architecture}', patternIds: [], cadenceHours: 24, claimsAllowed: ['fixture-claim']",
    '}];',
  ].join('\n');
  const parsed = parseScannerSourceCatalog(fixture);
  const expected = [{ id: 'fixture', authority: 'Test {Authority}', domain: 'cloud', url: 'https://example.org/{architecture}', cadenceHours: 24, claimsAllowed: ['fixture-claim'] }];
  if (JSON.stringify(parsed.entries) !== JSON.stringify(expected) || parsed.failures.length > 0) {
    throw new Error('scanner parser failed its brace-containing string regression fixture');
  }
};

const verifyParserRejectsUnsafeCadenceValues = (): void => {
  const fixtures = [
    "const SOURCES: ArchitectureSource[] = [createArchitectureSource('unsafe', 'Test', 'cloud', 'https://example.org', [], 9007199254740992, ['claim'])];",
    "const SOURCES: ArchitectureSource[] = [{ id: 'unsafe', authority: 'Test', domain: 'cloud', url: 'https://example.org', cadenceHours: 9007199254740992, claimsAllowed: ['claim'] }];",
  ];
  for (const fixture of fixtures) {
    expectParserFailure(fixture, 'scanner parser accepted a cadence outside JavaScript safe-integer range');
  }
};

const verifyParserRejectsComputedValues = (): void => {
  const fixtures = [
    "const SOURCES: ArchitectureSource[] = [createArchitectureSource('computed' + '-id', 'Test', 'cloud', 'https://example.org', [], 24, ['claim'])];",
    "const SOURCES: ArchitectureSource[] = [createArchitectureSource('computed', 'Test', 'cloud', 'https://example.org', [], 24 * 30, ['claim'])];",
    "const SOURCES: ArchitectureSource[] = [{ id: 'computed' + '-id', authority: 'Test', domain: 'cloud', url: 'https://example.org', cadenceHours: 24, claimsAllowed: ['claim'] }];",
    "const SOURCES: ArchitectureSource[] = [{ id: 'computed', authority: 'Test', domain: 'cloud', url: 'https://example.org', cadenceHours: 24 * 30, claimsAllowed: ['claim'] }];",
  ];
  for (const fixture of fixtures) {
    expectParserFailure(fixture, 'scanner parser accepted a computed source ID or cadence value');
  }
};

const verifyParserRejectsEmptySourceSlots = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] = [',
    "  createArchitectureSource('first', 'Test', 'cloud', 'https://example.org/first', [], 24, ['first-claim']),",
    ',',
    "  createArchitectureSource('third', 'Test', 'cloud', 'https://example.org/third', [], 24, ['third-claim']),",
    '];',
  ].join('\n');
  const parsed = parseScannerSourceCatalog(fixture);
  if (parsed.declaredCount !== 3 || parsed.entries.length !== 2 || parsed.failures.length !== 1) {
    throw new Error('scanner parser must report empty catalog slots instead of silently dropping them');
  }
};

const verifyParserSkipsCommentsBeforeArrayInitializer = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] =',
    "  /* fake catalog: [ { id: 'forged', url: 'https://forged.example', cadenceHours: 24, claimsAllowed: ['fake'] } ] */",
    "  [{ id: 'real', authority: 'Test', domain: 'cloud', url: 'https://real.example/source', cadenceHours: 24, claimsAllowed: ['real-claim'] }];",
  ].join('\n');
  const parsed = parseScannerSourceCatalog(fixture);
  if (parsed.declaredCount !== 1 || parsed.entries.length !== 1 || parsed.entries[0]?.id !== 'real' || parsed.entries[0]?.authority !== 'Test' || parsed.entries[0]?.domain !== 'cloud') {
    throw new Error('scanner parser must skip comments when locating the executable SOURCES initializer');
  }
};

const verifyParserRejectsStringInitializerWithBracketText = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] =',
    "'fake [ { id: 'forged', url: 'https://forged.example', cadenceHours: 24 } ]';",
  ].join('\n');
  expectParserFailure(fixture, 'scanner parser accepted an array-like string initializer as executable source data');
};

const verifyParserRejectsCommentOnlyFields = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] = [{',
    "  // id: 'comment-only',",
    '  // cadenceHours: 24',
    "  authority: 'Test', domain: 'cloud', url: 'https://example.org/source', claimsAllowed: ['claim']",
    '}];',
  ].join('\n');
  expectParserFailure(fixture, 'scanner parser accepted ID and cadenceHours fields found only in comments');
};

const verifyParserRejectsUnterminatedLineComment = (): void => {
  const fixture = "const SOURCES: ArchitectureSource[] = [{ id: 'fixture', authority: 'Test', domain: 'cloud', url: 'https://example.org', cadenceHours: 24 // no terminating newline or visible array close";
  expectParserFailure(fixture, 'scanner parser accepted a SOURCES array truncated inside a line comment');
};

verifyCadenceBounds();
verifyParserHandlesFactoryCalls();
verifyParserIgnoresCommentedFactoryCalls();
verifyParserRejectsUnsafeCadenceValues();
verifyParserHandlesBraceCharacters();
verifyParserRejectsComputedValues();
verifyParserRejectsEmptySourceSlots();
verifyParserSkipsCommentsBeforeArrayInitializer();
verifyParserRejectsStringInitializerWithBracketText();
verifyParserRejectsCommentOnlyFields();
verifyParserRejectsUnterminatedLineComment();

const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as Registry;
const scanner = readFileSync(scannerPath, 'utf8');
const failures: string[] = [];
if (!Array.isArray(registry.sources)) throw new Error('authoritative registry must contain a sources array');

const activeRegistry = registry.sources.filter(source => source.scannerStatus === 'active');
const catalog = parseScannerSourceCatalog(scanner);
failures.push(...catalog.failures);
const entries = catalog.entries;
const scannerById = new Map(entries.map(entry => [entry.id, entry]));
if (scannerById.size !== entries.length) failures.push('scanner source catalog contains duplicate IDs');

for (const source of activeRegistry) {
  if (!isValidReviewCadenceDays(source.reviewCadenceDays)) {
    failures.push(`registry source ${source.id} has an invalid or unsafe reviewCadenceDays value`);
    continue;
  }
  const entry = scannerById.get(source.id);
  if (!entry) {
    failures.push(`active registry source ${source.id} is missing from scanner catalog`);
    continue;
  }
  if (!isMatchingSourceMetadata(source, entry)) {
    if (entry.authority !== source.authority) {
      failures.push(`source ${source.id} authority mismatch: scanner=${entry.authority} registry=${source.authority}`);
    }
    if (entry.domain !== source.domain) {
      failures.push(`source ${source.id} domain mismatch: scanner=${entry.domain} registry=${source.domain}`);
    }
  }
  if (!isMatchingSourceUrl(source.url, entry.url)) {
    failures.push(`source ${source.id} URL mismatch: scanner=${entry.url} registry=${source.url}`);
  }
  if (!isValidScannerCadenceHours(entry.cadenceHours)) {
    failures.push(`scanner source ${source.id} has an invalid or unsafe cadenceHours value`);
    continue;
  }
  const expectedHours = source.reviewCadenceDays * 24;
  if (entry.cadenceHours !== expectedHours) {
    failures.push(`source ${source.id} cadence mismatch: scanner=${entry.cadenceHours}h registry=${expectedHours}h`);
  }
}

for (const entry of entries) {
  if (!activeRegistry.some(source => source.id === entry.id)) {
    failures.push(`scanner source ${entry.id} is not marked active in the authoritative registry`);
  }
}

if (failures.length) {
  process.stderr.write(`${JSON.stringify({ valid: false, failures }, null, 2)}\n`);
  process.exit(1);
}

process.stdout.write(`${JSON.stringify({
  valid: true,
  activeSources: activeRegistry.length,
  scannerSources: entries.length,
  cadenceUnit: 'hours',
  parser: 'literal scanner tokenizer',
  workflowExecutionContract: 'six-hourly artifact-only scan; serialized GitHub runs; database persistence disabled',
  sourceRegistry: registryPath,
  scannerCatalog: scannerPath,
  braceStringRegression: 'passed',
  irreversibleChangesExecuted: false,
}, null, 2)}\n`);