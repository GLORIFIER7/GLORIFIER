import { readFileSync } from 'node:fs';
import { parseScannerSourceCatalog } from './geas-source-catalog-parser.ts';

type RegistrySource = {
  id: string;
  url: string;
  reviewCadenceDays: number;
  scannerStatus: 'active' | 'discovery-only';
};
type Registry = { sources: RegistrySource[] };

const registryPath = 'docs/architecture/geas-authoritative-source-registry.json';
const scannerPath = 'src/lib/governance/geas-architecture-scientist.ts';
const workflowPath = '.github/workflows/geas-architecture-scan.yml';
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

const isMatchingSourceUrl = (registryUrl: string, scannerUrl: string): boolean =>
  registryUrl === scannerUrl;

const verifySourceUrlConsistency = (): void => {
  const canonicalUrl = 'https://example.org/canonical';
  if (!isMatchingSourceUrl(canonicalUrl, canonicalUrl)) {
    throw new Error('identical registry and scanner source URLs must be accepted');
  }
  if (isMatchingSourceUrl(canonicalUrl, 'https://example.org/legacy')) {
    throw new Error('divergent registry and scanner source URLs must be rejected');
  }
};

verifySourceUrlConsistency();

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
    { id: 'factory-one', url: 'https://example.org/one', cadenceHours: 24, claimsAllowed: ['claim-one'] },
    { id: 'factory-two', url: 'https://example.org/two', cadenceHours: 336, claimsAllowed: ['claim-two'] },
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
  const expected = [{ id: 'active', url: 'https://example.org/active', cadenceHours: 24, claimsAllowed: ['active-claim'] }];
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
  const expected = [{ id: 'fixture', url: 'https://example.org/{architecture}', cadenceHours: 24, claimsAllowed: ['fixture-claim'] }];
  if (JSON.stringify(parsed.entries) !== JSON.stringify(expected) || parsed.failures.length > 0) {
    throw new Error('scanner parser failed its brace-containing string regression fixture');
  }
};

const verifyParserRejectsUnsafeCadenceValues = (): void => {
  const fixtures = [
    "const SOURCES: ArchitectureSource[] = [createArchitectureSource('unsafe', 'Test', 'cloud', 'https://example.org', [], 9007199254740992, ['claim'])];",
    "const SOURCES: ArchitectureSource[] = [{ id: 'unsafe', url: 'https://example.org', cadenceHours: 9007199254740992, claimsAllowed: ['claim'] }];",
  ];
  for (const fixture of fixtures) {
    expectParserFailure(fixture, 'scanner parser accepted a cadence outside JavaScript safe-integer range');
  }
};

const verifyParserRejectsComputedValues = (): void => {
  const fixtures = [
    "const SOURCES: ArchitectureSource[] = [createArchitectureSource('computed' + '-id', 'Test', 'cloud', 'https://example.org', [], 24, ['claim'])];",
    "const SOURCES: ArchitectureSource[] = [createArchitectureSource('computed', 'Test', 'cloud', 'https://example.org', [], 24 * 30, ['claim'])];",
    "const SOURCES: ArchitectureSource[] = [{ id: 'computed' + '-id', url: 'https://example.org', cadenceHours: 24, claimsAllowed: ['claim'] }];",
    "const SOURCES: ArchitectureSource[] = [{ id: 'computed', url: 'https://example.org', cadenceHours: 24 * 30, claimsAllowed: ['claim'] }];",
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
    "  [{ id: 'real', url: 'https://real.example/source', cadenceHours: 24, claimsAllowed: ['real-claim'] }];",
  ].join('\n');
  const parsed = parseScannerSourceCatalog(fixture);
  if (parsed.declaredCount !== 1 || parsed.entries.length !== 1 || parsed.entries[0]?.id !== 'real') {
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
    "  authority: 'Test', url: 'https://example.org/source', claimsAllowed: ['claim']",
    '}];',
  ].join('\n');
  expectParserFailure(fixture, 'scanner parser accepted ID and cadenceHours fields found only in comments');
};

const verifyParserRejectsUnterminatedLineComment = (): void => {
  const fixture = "const SOURCES: ArchitectureSource[] = [{ id: 'fixture', url: 'https://example.org', cadenceHours: 24 // no terminating newline or visible array close";
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
  sourceRegistry: registryPath,
  scannerCatalog: scannerPath,
  braceStringRegression: 'passed',
  irreversibleChangesExecuted: false,
}, null, 2)}\n`);