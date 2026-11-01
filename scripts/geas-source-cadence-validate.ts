import { readFileSync } from 'node:fs';
import { parseScannerSourceCatalog } from './geas-source-catalog-parser.ts';

type RegistrySource = {
  id: string;
  reviewCadenceDays: number;
  scannerStatus: 'active' | 'discovery-only';
};
type Registry = { sources: RegistrySource[] };

const registryPath = 'docs/architecture/geas-authoritative-source-registry.json';
const scannerPath = 'src/lib/governance/geas-architecture-scientist.ts';

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
    "  createArchitectureSource('factory-one', 'Test', 'cloud', 'https://example.org/one', [], 24),",
    "  createArchitectureSource('factory-two', 'Test', 'cloud', 'https://example.org/two', ['pattern'], 336),",
    '];',
  ].join('\n');
  const parsed = parseScannerSourceCatalog(fixture);
  const expected = [
    { id: 'factory-one', url: 'https://example.org/one', cadenceHours: 24 },
    { id: 'factory-two', url: 'https://example.org/two', cadenceHours: 336 },
  ];
  if (JSON.stringify(parsed.entries) !== JSON.stringify(expected) || parsed.failures.length > 0) {
    throw new Error('scanner parser must read factory-form ID and cadence values');
  }
};

const verifyParserIgnoresCommentedFactoryCalls = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] = [',
    "  // createArchitectureSource('disabled-line', 'Test', 'cloud', 'https://example.org/disabled', [], 24),",
    "  /* createArchitectureSource('disabled-block', 'Test', 'cloud', 'https://example.org/disabled', [], 24), */",
    "  createArchitectureSource('active', 'Test', 'cloud', 'https://example.org/active', [], 24),",
    '];',
  ].join('\n');
  const parsed = parseScannerSourceCatalog(fixture);
  const expected = [{ id: 'active', url: 'https://example.org/active', cadenceHours: 24 }];
  if (JSON.stringify(parsed.entries) !== JSON.stringify(expected) || parsed.declaredCount !== 1) {
    throw new Error('commented-out factory calls must not be counted as active scanner sources');
  }
};

const verifyParserHandlesBraceCharacters = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] = [{',
    "  id: 'fixture', authority: 'Test {Authority}', domain: 'cloud',",
    "  url: 'https://example.org/{architecture}', patternIds: [], cadenceHours: 24",
    '}];',
  ].join('\n');
  const parsed = parseScannerSourceCatalog(fixture);
  const expected = [{ id: 'fixture', url: 'https://example.org/{architecture}', cadenceHours: 24 }];
  if (JSON.stringify(parsed.entries) !== JSON.stringify(expected) || parsed.failures.length > 0) {
    throw new Error('scanner parser failed its brace-containing string regression fixture');
  }
};

const verifyParserRejectsComputedValues = (): void => {
  const fixtures = [
    "const SOURCES: ArchitectureSource[] = [createArchitectureSource('computed' + '-id', 'Test', 'cloud', 'https://example.org', [], 24)];",
    "const SOURCES: ArchitectureSource[] = [createArchitectureSource('computed', 'Test', 'cloud', 'https://example.org', [], 24 * 30)];",
    "const SOURCES: ArchitectureSource[] = [{ id: 'computed' + '-id', url: 'https://example.org', cadenceHours: 24 }];",
    "const SOURCES: ArchitectureSource[] = [{ id: 'computed', url: 'https://example.org', cadenceHours: 24 * 30 }];",
  ];
  for (const fixture of fixtures) {
    expectParserFailure(fixture, 'scanner parser accepted a computed source ID or cadence value');
  }
};

const verifyParserRejectsEmptySourceSlots = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] = [',
    "  createArchitectureSource('first', 'Test', 'cloud', 'https://example.org/first', [], 24),",
    ',',
    "  createArchitectureSource('third', 'Test', 'cloud', 'https://example.org/third', [], 24),",
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
    "  /* fake catalog: [ { id: 'forged', url: 'https://forged.example', cadenceHours: 24 } ] */",
    "  [{ id: 'real', url: 'https://real.example/source', cadenceHours: 24 }];",
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
    "  authority: 'Test', url: 'https://example.org/source'",
    '}];',
  ].join('\n');
  expectParserFailure(fixture, 'scanner parser accepted ID and cadenceHours fields found only in comments');
};

const verifyParserRejectsUnterminatedLineComment = (): void => {
  const fixture = "const SOURCES: ArchitectureSource[] = [{ id: 'fixture', url: 'https://example.org', cadenceHours: 24 // no terminating newline or visible array close";
  expectParserFailure(fixture, 'scanner parser accepted a SOURCES array truncated inside a line comment');
};

verifyParserHandlesFactoryCalls();
verifyParserIgnoresCommentedFactoryCalls();
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
  if (!Number.isInteger(source.reviewCadenceDays) || source.reviewCadenceDays < 1) {
    failures.push(`registry source ${source.id} has an invalid reviewCadenceDays value`);
    continue;
  }
  const entry = scannerById.get(source.id);
  if (!entry) {
    failures.push(`active registry source ${source.id} is missing from scanner catalog`);
    continue;
  }
  if (!Number.isInteger(entry.cadenceHours) || entry.cadenceHours < 1) {
    failures.push(`scanner source ${source.id} has an invalid cadenceHours value`);
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