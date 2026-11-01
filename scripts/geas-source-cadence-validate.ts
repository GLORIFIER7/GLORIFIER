import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

type RegistrySource = {
  id: string;
  reviewCadenceDays: number;
  scannerStatus: 'active' | 'discovery-only';
};

type Registry = { sources: RegistrySource[] };
type ScannerSource = { id: string; cadenceHours: number };

const registryPath = 'docs/architecture/geas-authoritative-source-registry.json';
const scannerPath = 'src/lib/governance/geas-architecture-scientist.ts';

const isStaticString = (expression: ts.Expression | undefined): string | null => {
  if (!expression) return null;
  return ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)
    ? expression.text
    : null;
};

const isStaticNumber = (expression: ts.Expression | undefined): number | null => {
  if (!expression || !ts.isNumericLiteral(expression)) return null;
  const value = Number(expression.text);
  return Number.isFinite(value) ? value : null;
};

const hasPropertyName = (name: ts.PropertyName, expected: string): boolean => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text === expected;
  }
  return false;
};

const readUniqueProperty = (object: ts.ObjectLiteralExpression, propertyName: string): ts.Expression | null => {
  if (object.properties.some(ts.isSpreadAssignment)) return null;
  const matches = object.properties.filter((property): property is ts.PropertyAssignment =>
    ts.isPropertyAssignment(property) && hasPropertyName(property.name, propertyName));
  return matches.length === 1 ? matches[0]?.initializer ?? null : null;
};

const parseObjectSource = (object: ts.ObjectLiteralExpression): ScannerSource | null => {
  const id = isStaticString(readUniqueProperty(object, 'id') ?? undefined);
  const cadenceHours = isStaticNumber(readUniqueProperty(object, 'cadenceHours') ?? undefined);
  return id && cadenceHours !== null ? { id, cadenceHours } : null;
};

const parseFactorySource = (call: ts.CallExpression): ScannerSource | null => {
  if (!ts.isIdentifier(call.expression)
      || call.expression.text !== 'createArchitectureSource'
      || call.arguments.length !== 6
      || !ts.isArrayLiteralExpression(call.arguments[4] ?? ts.factory.createArrayLiteralExpression())) return null;
  const id = isStaticString(call.arguments[0]);
  const authority = isStaticString(call.arguments[1]);
  const domain = isStaticString(call.arguments[2]);
  const sourceUrl = isStaticString(call.arguments[3]);
  const cadenceHours = isStaticNumber(call.arguments[5]);
  return id && authority && domain && sourceUrl && cadenceHours !== null
    ? { id, cadenceHours }
    : null;
};

const findSourcesArray = (sourceFile: ts.SourceFile): ts.ArrayLiteralExpression | null => {
  const declaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(item => ts.isIdentifier(item.name) && item.name.text === 'SOURCES');
  const initializer = declaration?.initializer;
  return initializer && ts.isArrayLiteralExpression(initializer) ? initializer : null;
};

const parseScannerSources = (sourceText: string): ScannerSource[] => {
  const sourceFile = ts.createSourceFile(
    'geas-architecture-scientist.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    throw new Error('scanner source contains TypeScript parse errors');
  }
  const sources = findSourcesArray(sourceFile);
  if (!sources) throw new Error('unable to locate a complete scanner SOURCES array');
  if (sources.elements.length === 0) throw new Error('scanner SOURCES array is empty');

  return sources.elements.map((element, index) => {
    const parsed = ts.isObjectLiteralExpression(element)
      ? parseObjectSource(element)
      : ts.isCallExpression(element)
        ? parseFactorySource(element)
        : null;
    if (!parsed || !parsed.id || !Number.isInteger(parsed.cadenceHours) || parsed.cadenceHours < 1) {
      throw new Error('scanner source at index ' + index + ' must use a literal ID and positive integer cadenceHours');
    }
    return parsed;
  });
};

const expectParserFailure = (fixture: string, description: string): void => {
  let rejected = false;
  try {
    parseScannerSources(fixture);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error(description);
};

const verifyParserHandlesFactoryCalls = (): void => {
  const fixture = `const SOURCES: ArchitectureSource[] = [
    createArchitectureSource('factory-one', 'Test', 'cloud', 'https://example.org/one', [], 24),
    createArchitectureSource('factory-two', 'Test', 'cloud', 'https://example.org/two', ['pattern'], 336),
  ];`;
  const parsed = parseScannerSources(fixture);
  if (parsed.length !== 2
      || parsed[0]?.id !== 'factory-one'
      || parsed[0]?.cadenceHours !== 24
      || parsed[1]?.id !== 'factory-two'
      || parsed[1]?.cadenceHours !== 336) {
    throw new Error('scanner parser must read factory-form ID and cadence values');
  }
};

const verifyParserIgnoresCommentedFactoryCalls = (): void => {
  const fixture = `const SOURCES: ArchitectureSource[] = [
    // createArchitectureSource('disabled-line', 'Test', 'cloud', 'https://example.org/disabled', [], 24),
    /* createArchitectureSource('disabled-block', 'Test', 'cloud', 'https://example.org/disabled', [], 24), */
    createArchitectureSource('active', 'Test', 'cloud', 'https://example.org/active', [], 24),
  ];`;
  const parsed = parseScannerSources(fixture);
  if (parsed.length !== 1 || parsed[0]?.id !== 'active') {
    throw new Error('commented-out factory calls must not be counted as active scanner sources');
  }
};

const verifyParserRejectsComputedFactoryValues = (): void => {
  const fixtures = [
    `const SOURCES: ArchitectureSource[] = [createArchitectureSource('computed' + '-id', 'Test', 'cloud', 'https://example.org', [], 24)];`,
    `const SOURCES: ArchitectureSource[] = [createArchitectureSource('computed', 'Test', 'cloud', 'https://example.org', [], 24 * 30)];`,
  ];
  for (const fixture of fixtures) {
    expectParserFailure(fixture, 'scanner parser accepted computed factory ID or cadence values');
  }
};

const verifyParserHandlesBraceCharacters = (): void => {
  const fixture = `const SOURCES: ArchitectureSource[] = [{
    id: 'fixture',
    authority: 'Test {Authority}',
    domain: 'cloud',
    url: 'https://example.org/{architecture}',
    patternIds: [],
    cadenceHours: 24
  }];
  const P = () => {};`;
  const parsed = parseScannerSources(fixture);
  if (parsed.length !== 1 || parsed[0]?.id !== 'fixture' || parsed[0]?.cadenceHours !== 24) {
    throw new Error('structured scanner parser failed its brace-containing string regression fixture');
  }
};

const verifyParserRejectsCommentOnlyFields = (): void => {
  const fixture = `const SOURCES: ArchitectureSource[] = [{
    // id: 'comment-only',
    // cadenceHours: 24
    authority: 'Test'
  }];`;
  expectParserFailure(fixture, 'scanner parser accepted id and cadenceHours fields found only in comments');
};

const verifyParserRejectsComputedFieldValues = (): void => {
  const fixtures = [
    `const SOURCES: ArchitectureSource[] = [{ id: 'computed' + '-id', cadenceHours: 24 }];`,
    `const SOURCES: ArchitectureSource[] = [{ id: 'computed', cadenceHours: 24 * 30 }];`,
  ];
  for (const fixture of fixtures) {
    expectParserFailure(fixture, 'scanner parser accepted a computed id or cadenceHours expression');
  }
};

const verifyParserRejectsPropertyLikeTextInsideStrings = (): void => {
  const fixture = `const SOURCES: ArchitectureSource[] = [{
    authority: "documentation, id: 'forged', cadenceHours: 999",
    domain: 'cloud',
    url: 'https://example.org/source'
  }];`;
  expectParserFailure(fixture, 'scanner parser treated property-like text inside a string as source properties');
};

const verifyParserRejectsUnterminatedLineComment = (): void => {
  const fixture = "const SOURCES: ArchitectureSource[] = [{ id: 'fixture', cadenceHours: 24 // no terminating newline or visible array close";
  expectParserFailure(fixture, 'scanner parser accepted a SOURCES array truncated inside a line comment');
};

verifyParserHandlesFactoryCalls();
verifyParserIgnoresCommentedFactoryCalls();
verifyParserRejectsComputedFactoryValues();
verifyParserHandlesBraceCharacters();
verifyParserRejectsComputedFieldValues();
verifyParserRejectsUnterminatedLineComment();
verifyParserRejectsCommentOnlyFields();
verifyParserRejectsPropertyLikeTextInsideStrings();

const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as Registry;
const scanner = readFileSync(scannerPath, 'utf8');
const failures: string[] = [];
if (!Array.isArray(registry.sources)) throw new Error('authoritative registry must contain a sources array');

const activeRegistry = registry.sources.filter((source) => source.scannerStatus === 'active');
const entries = parseScannerSources(scanner);
const scannerById = new Map<string, ScannerSource>();
for (const entry of entries) {
  if (scannerById.has(entry.id)) failures.push('duplicate scanner source id ' + entry.id);
  scannerById.set(entry.id, entry);
}

for (const source of activeRegistry) {
  if (!Number.isInteger(source.reviewCadenceDays) || source.reviewCadenceDays < 1) {
    failures.push('registry source ' + source.id + ' has an invalid reviewCadenceDays value');
    continue;
  }
  const entry = scannerById.get(source.id);
  if (!entry) {
    failures.push('active registry source ' + source.id + ' is missing from scanner catalog');
    continue;
  }
  if (!Number.isInteger(entry.cadenceHours) || entry.cadenceHours < 1) {
    failures.push('scanner source ' + source.id + ' has an invalid cadenceHours value');
    continue;
  }
  const expectedHours = source.reviewCadenceDays * 24;
  if (entry.cadenceHours !== expectedHours) {
    failures.push('source ' + source.id + ' cadence mismatch: scanner=' + entry.cadenceHours + 'h registry=' + expectedHours + 'h');
  }
}

for (const entry of entries) {
  if (!activeRegistry.some((source) => source.id === entry.id)) {
    failures.push('scanner source ' + entry.id + ' is not marked active in the authoritative registry');
  }
}

if (failures.length) {
  process.stderr.write(JSON.stringify({ valid: false, failures }, null, 2) + '\n');
  process.exit(1);
}

process.stdout.write(JSON.stringify({
  valid: true,
  activeSources: activeRegistry.length,
  scannerSources: entries.length,
  cadenceUnit: 'hours',
  parser: 'TypeScript AST',
  sourceRegistry: registryPath,
  scannerCatalog: scannerPath,
  braceStringRegression: 'passed',
  irreversibleChangesExecuted: false,
}, null, 2) + '\n');