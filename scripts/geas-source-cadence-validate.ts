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

function parseScannerSources(sourceText: string, fileName: string): ScannerSource[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sourceFile.parseDiagnostics.length > 0) {
    const diagnostics = sourceFile.parseDiagnostics.map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    );
    throw new Error(`unable to parse scanner TypeScript: ${diagnostics.join('; ')}`);
  }

  let sourceArray: ts.ArrayLiteralExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'SOURCES' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      sourceArray = node.initializer;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!sourceArray) throw new Error('unable to locate the scanner SOURCES array');

  const result: ScannerSource[] = [];
  for (const element of sourceArray.elements) {
    if (!ts.isObjectLiteralExpression(element)) throw new Error('scanner SOURCES contains a non-object entry');
    let id: string | undefined;
    let cadenceHours: number | undefined;
    for (const property of element.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const key = ts.isIdentifier(property.name) ? property.name.text :
        ts.isStringLiteral(property.name) ? property.name.text : undefined;
      if (key === 'id' && ts.isStringLiteral(property.initializer)) id = property.initializer.text;
      if (key === 'cadenceHours' && ts.isNumericLiteral(property.initializer)) cadenceHours = Number(property.initializer.text);
    }
    if (!id || !Number.isFinite(cadenceHours)) {
      throw new Error('every scanner source must have a string id and numeric cadenceHours');
    }
    result.push({ id, cadenceHours: cadenceHours as number });
  }
  return result;
}

function verifyParserHandlesBraceCharacters(): void {
  const fixture = `const SOURCES: ArchitectureSource[] = [{
    id: 'fixture',
    authority: 'Test {Authority}',
    domain: 'cloud',
    url: 'https://example.org/{architecture}',
    patternIds: [],
    cadenceHours: 24
  }];
  const P = () => {};`;
  const parsed = parseScannerSources(fixture, 'fixture.ts');
  if (parsed.length !== 1 || parsed[0].id !== 'fixture' || parsed[0].cadenceHours !== 24) {
    throw new Error('structured scanner parser failed its brace-containing string regression fixture');
  }
}

verifyParserHandlesBraceCharacters();

const registry = JSON.parse(readFileSync(registryPath, 'utf8')) as Registry;
const scanner = readFileSync(scannerPath, 'utf8');
const failures: string[] = [];
if (!Array.isArray(registry.sources)) throw new Error('authoritative registry must contain a sources array');

const activeRegistry = registry.sources.filter((source) => source.scannerStatus === 'active');
const entries = parseScannerSources(scanner, scannerPath);
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
  parser: 'TypeScript AST',
  sourceRegistry: registryPath,
  scannerCatalog: scannerPath,
  braceStringRegression: 'passed',
  irreversibleChangesExecuted: false,
}, null, 2)}\n`);
