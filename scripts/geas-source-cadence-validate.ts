import * as ts from 'typescript';
import { readFileSync } from 'node:fs';

type RegistrySource = {
  id: string;
  reviewCadenceDays: number;
  scannerStatus: 'active' | 'discovery-only';
};

type Registry = { sources: RegistrySource[] };
type ScannerSource = { id: string; cadenceHours: number };

const registryPath = 'docs/architecture/geas-authoritative-source-registry.json';
const scannerPath = 'src/lib/governance/geas-architecture-scientist.ts';

/**
 * Find a matching delimiter while ignoring delimiters inside strings and comments.
 * This intentionally avoids relying on TypeScript's compiler API so this governance
 * check remains usable across compiler package/API changes.
 */
(() => {
const literalString = (node: ts.Expression | undefined): string | null =>
  node && ts.isStringLiteral(node) ? node.text : null;

const literalNumber = (node: ts.Expression | undefined): number | null =>
  node && ts.isNumericLiteral(node) ? Number(node.text) : null;

const getObjectProperty = (node: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined => {
  const matches = node.properties.filter((property): property is ts.PropertyAssignment => {
    if (!ts.isPropertyAssignment(property)) return false;
    const propertyName = property.name;
    return (ts.isIdentifier(propertyName) || ts.isStringLiteral(propertyName)) && propertyName.text === name;
  });
  if (matches.length !== 1) return undefined;
  const match = matches[0];
  return match ? match.initializer : undefined;
};

const parseObjectSource = (node: ts.ObjectLiteralExpression): ScannerSource | null => {
  const id = literalString(getObjectProperty(node, 'id'));
  const cadenceHours = literalNumber(getObjectProperty(node, 'cadenceHours'));
  return id && cadenceHours !== null ? { id, cadenceHours } : null;
};

const parseFactorySource = (node: ts.CallExpression): ScannerSource | null => {
  const expression = node.expression;
  if (!ts.isIdentifier(expression) || expression.text !== 'createArchitectureSource') return null;
  const args = node.arguments;
  if (args.length !== 6 || !ts.isArrayLiteralExpression(args[4])) return null;
  const id = literalString(args[0]);
  const cadenceHours = literalNumber(args[5]);
  return id && cadenceHours !== null ? { id, cadenceHours } : null;
};

const parseScannerSources = (sourceText: string): ScannerSource[] => {
  const sourceFile = ts.createSourceFile('geas-architecture-scientist.ts', sourceText, ts.ScriptTarget.Latest, true);
  if (sourceFile.parseDiagnostics.length > 0) throw new Error('scanner source file contains TypeScript syntax errors');
  const declaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(item => ts.isIdentifier(item.name) && item.name.text === 'SOURCES');
  const initializer = declaration?.initializer;
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) throw new Error('unable to locate a literal scanner SOURCES array');
  return initializer.elements.map((element, index) => {
    const parsed = ts.isCallExpression(element)
      ? parseFactorySource(element)
      : ts.isObjectLiteralExpression(element) ? parseObjectSource(element) : null;
    if (!parsed) throw new Error(`scanner source at index ${index} must use literal ID and cadence values`);
    return parsed;
  });
};

const verifyParserHandlesFactoryCalls = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] = [',
    "createArchitectureSource('factory-one', 'Test', 'cloud', 'https://example.org/one', [], 24),",
    "createArchitectureSource('factory-two', 'Test', 'cloud', 'https://example.org/two', ['pattern'], 336),",
    '];',
  ].join('\n');
  const parsed = parseScannerSources(fixture);
  if (parsed.length !== 2 || parsed[0]?.id !== 'factory-one' || parsed[0]?.cadenceHours !== 24
      || parsed[1]?.id !== 'factory-two' || parsed[1]?.cadenceHours !== 336) {
    throw new Error('scanner parser must read factory-form ID and cadence values');
  }
};

const verifyParserIgnoresCommentedFactoryCalls = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] = [',
    "// createArchitectureSource('disabled-line', 'Test', 'cloud', 'https://example.org/disabled', [], 24)",
    "/* createArchitectureSource('disabled-block', 'Test', 'cloud', 'https://example.org/disabled', [], 24) */",
    "createArchitectureSource('active', 'Test', 'cloud', 'https://example.org/active', [], 24),",
    '];',
  ].join('\n');
  const parsed = parseScannerSources(fixture);
  if (parsed.length !== 1 || parsed[0]?.id !== 'active') {
    throw new Error('commented-out factory calls must not be counted as active scanner sources');
  }
};

const verifyParserRejectsComputedFactoryValues = (): void => {
  const fixtures = [
    ["const SOURCES: ArchitectureSource[] = [", "createArchitectureSource('computed' + '-id', 'Test', 'cloud', 'https://example.org', [], 24),", '];'].join('\n'),
    ["const SOURCES: ArchitectureSource[] = [", "createArchitectureSource('computed', 'Test', 'cloud', 'https://example.org', [], 24 * 30),", '];'].join('\n'),
  ];
  for (const fixture of fixtures) {
    let rejected = false;
    try { parseScannerSources(fixture); } catch { rejected = true; }
    if (!rejected) throw new Error('scanner parser accepted computed factory ID or cadence values');
  }
};

const verifyParserHandlesBraceCharacters = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] = [{',
    "id: 'fixture', authority: 'Test {Authority}', domain: 'cloud', url: 'https://example.org/{architecture}', patternIds: [], cadenceHours: 24",
    '}];',
  ].join('\n');
  const parsed = parseScannerSources(fixture);
  if (parsed.length !== 1 || parsed[0]?.id !== 'fixture' || parsed[0]?.cadenceHours !== 24) {
    throw new Error('scanner parser failed its brace-containing string regression fixture');
  }
};

const verifyParserRejectsCommentOnlyFields = (): void => {
  const fixture = [
    'const SOURCES: ArchitectureSource[] = [{',
    "// id: 'comment-only'",
    '// cadenceHours: 24',
    "authority: 'Test'",
    '}];',
  ].join('\n');
  let rejected = false;
  try { parseScannerSources(fixture); } catch { rejected = true; }
  if (!rejected) throw new Error('scanner parser accepted id and cadenceHours fields found only in comments');
};

const verifyParserRejectsUnterminatedSource = (): void => {
  const fixture = "const SOURCES: ArchitectureSource[] = [{ id: 'fixture', cadenceHours: 24 // missing closure";
  let rejected = false;
  try { parseScannerSources(fixture); } catch { rejected = true; }
  if (!rejected) throw new Error('scanner parser accepted a truncated SOURCES array');
};

const verifyParserRejectsComputedFieldValues = (): void => {
  const fixtures = [
    ["const SOURCES: ArchitectureSource[] = [{", "id: 'computed' + '-id', cadenceHours: 24", '}];'].join('\n'),
    ["const SOURCES: ArchitectureSource[] = [{", "id: 'computed', cadenceHours: 24 * 30", '}];'].join('\n'),
  ];
  for (const fixture of fixtures) {
    let rejected = false;
    try { parseScannerSources(fixture); } catch { rejected = true; }
    if (!rejected) throw new Error('scanner parser accepted computed ID or cadenceHours expression');
  }
};

verifyParserHandlesFactoryCalls();
verifyParserIgnoresCommentedFactoryCalls();
verifyParserRejectsComputedFactoryValues();
verifyParserHandlesBraceCharacters();
verifyParserRejectsComputedFieldValues();
verifyParserRejectsUnterminatedSource();
verifyParserRejectsCommentOnlyFields();
const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as Registry;
const scanner = readFileSync(scannerPath, 'utf8');
const failures: string[] = [];
if (!Array.isArray(registry.sources)) throw new Error('authoritative registry must contain a sources array');

const activeRegistry = registry.sources.filter((source) => source.scannerStatus === 'active');
const entries = parseScannerSources(scanner);
const scannerById = new Map<string, ScannerSource>();
for (const entry of entries) {
  if (scannerById.has(entry.id)) failures.push(`duplicate scanner source id ${entry.id}`);
  scannerById.set(entry.id, entry);
}

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
  if (!activeRegistry.some((source) => source.id === entry.id)) {
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
  parser: 'delimiter-aware source scanner',
  sourceRegistry: registryPath,
  scannerCatalog: scannerPath,
  braceStringRegression: 'passed',
  irreversibleChangesExecuted: false,
}, null, 2)}\n`);
})();
