import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

type Source = {
  id: string;
  authority: string;
  domain: string;
  url: string;
  claimsAllowed: string[];
  reviewCadenceDays: number;
  implementationStatus: string;
  scannerStatus: 'active' | 'discovery-only';
  aliasOf?: string;
};

type Registry = {
  version: string;
  policy: string;
  sources: Source[];
};

const registryPath = 'docs/architecture/geas-authoritative-source-registry.json';
const scannerPath = 'src/lib/governance/geas-architecture-scientist.ts';
const parsed: unknown = JSON.parse(readFileSync(registryPath, 'utf8'));
const failures: string[] = [];
const ids = new Set<string>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isSafeHttpsUrl = (url: URL): boolean =>
  url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;

const parseHttpsUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const normalizeHttpsUrl = (value: unknown): string | null => {
  if (!isNonEmptyString(value)) return null;
  const url = parseHttpsUrl(value);
  return url && isSafeHttpsUrl(url) ? url.href : null;
};


type ScannerSourceEntry = { id: string; url: string };

const readStaticString = (expression: ts.Expression | undefined): string | null => {
  if (!expression) return null;
  return ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)
    ? expression.text
    : null;
};

const hasPropertyName = (name: ts.PropertyName, expected: string): boolean => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text === expected;
  }
  return false;
};

const readUniqueStringProperty = (
  object: ts.ObjectLiteralExpression,
  propertyName: string,
): string | null => {
  const matches = object.properties.filter((property): property is ts.PropertyAssignment =>
    ts.isPropertyAssignment(property) && hasPropertyName(property.name, propertyName));
  if (matches.length !== 1) return null;
  return readStaticString(matches[0]?.initializer);
};

const parseObjectSource = (object: ts.ObjectLiteralExpression): ScannerSourceEntry | null => {
  const id = readUniqueStringProperty(object, 'id');
  const url = readUniqueStringProperty(object, 'url');
  return id && url ? { id, url } : null;
};

const parseFactorySource = (call: ts.CallExpression): ScannerSourceEntry | null => {
  if (!ts.isIdentifier(call.expression) || call.expression.text !== 'createArchitectureSource' || call.arguments.length !== 6) {
    return null;
  }
  const id = readStaticString(call.arguments[0]);
  const url = readStaticString(call.arguments[3]);
  return id && url ? { id, url } : null;
};

const parseScannerSourceCatalog = (sourceText: string): {
  declaredCount: number;
  entries: ScannerSourceEntry[];
  failures: string[];
} => {
  const sourceFile = ts.createSourceFile(
    'geas-architecture-scientist.ts',
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    return { declaredCount: 0, entries: [], failures: ['scanner source contains TypeScript parse errors'] };
  }

  const declaration = sourceFile.statements
    .filter(ts.isVariableStatement)
    .flatMap(statement => [...statement.declarationList.declarations])
    .find(item => ts.isIdentifier(item.name) && item.name.text === 'SOURCES');
  const initializer = declaration?.initializer;
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
    return { declaredCount: 0, entries: [], failures: ['unable to locate a complete scanner SOURCES array'] };
  }

  const entries: ScannerSourceEntry[] = [];
  const failures: string[] = [];
  initializer.elements.forEach((element, index) => {
    const parsed = ts.isObjectLiteralExpression(element)
      ? parseObjectSource(element)
      : ts.isCallExpression(element)
        ? parseFactorySource(element)
        : null;
    if (parsed?.id && parsed.url) entries.push(parsed);
    else failures.push(`scanner source at index ${index} must use literal ID and URL values`);
  });
  return { declaredCount: initializer.elements.length, entries, failures };
};

const scannerParserFixture = "const SOURCES: ArchitectureSource[] = [\\n  createArchitectureSource('factory-source', 'Example', 'cloud', 'https://factory.example/source', [], 24),\\n  { id: 'literal-source', authority: 'Example', domain: 'cloud', url: 'https://literal.example/source', patternIds: [], cadenceHours: 24 },\\n];";
const fixtureResult = parseScannerSourceCatalog(scannerParserFixture);
if (fixtureResult.declaredCount !== 2
    || fixtureResult.entries.length !== 2
    || fixtureResult.entries[0]?.id !== 'factory-source'
    || fixtureResult.entries[0]?.url !== 'https://factory.example/source'
    || fixtureResult.entries[1]?.id !== 'literal-source'
    || fixtureResult.entries[1]?.url !== 'https://literal.example/source') {
  throw new Error('scanner source parser must preserve factory-call and object-literal entries');
}

const unsupportedScannerFixture = "const SOURCES: ArchitectureSource[] = [\\n  createArchitectureSource('computed' + '-id', 'Example', 'cloud', 'https://example.test', [], 24),\\n];";
if (parseScannerSourceCatalog(unsupportedScannerFixture).failures.length === 0) {
  throw new Error('scanner source parser must fail closed on computed factory arguments');
}

const commentOnlyObjectFixture = [
  'const SOURCES: ArchitectureSource[] = [',
  "  { authority: 'Example', domain: 'cloud', patternIds: [], cadenceHours: 24, /* id: 'comment-only', url: 'https://example.test/source' */ },",
  '];',
].join('\\n');
if (parseScannerSourceCatalog(commentOnlyObjectFixture).failures.length === 0) {
  throw new Error('scanner source parser must reject ID and URL values that appear only in comments');
}

const fakeFieldsInsideStringFixture = [
  'const SOURCES: ArchitectureSource[] = [',
  `  { authority: "reference text, id: 'forged-source', url: 'https://forged.example/source'", domain: 'cloud', patternIds: [], cadenceHours: 24 },`,
  '];',
].join('\\n');
if (parseScannerSourceCatalog(fakeFieldsInsideStringFixture).failures.length === 0) {
  throw new Error('scanner source parser must not treat property-like text inside string values as real properties');
}

if (!isRecord(parsed)) {
  failures.push('registry must be a JSON object');
} else {
  if (parsed.version !== 'GEAS-AUTHORITY-2') failures.push('unexpected registry version');
  if (!isNonEmptyString(parsed.policy) || !parsed.policy.toLowerCase().includes('not proof')) {
    failures.push('source-versus-implementation policy missing');
  }
  if (!Array.isArray(parsed.sources) || parsed.sources.length < 10) {
    failures.push('source registry unexpectedly small');
  }

  const sources: unknown[] = Array.isArray(parsed.sources) ? parsed.sources : [];
  const urlOwners = new Map<string, string>();
  for (const [index, item] of sources.entries()) {
    if (!isRecord(item)) {
      failures.push(`source at index ${index} must be an object`);
      continue;
    }

    const source = item as Partial<Source>;
    if (Object.prototype.hasOwnProperty.call(item, 'aliasOf') && !isNonEmptyString(source.aliasOf)) {
      failures.push(`source ${source.id ?? index}: aliasOf must be a non-empty source ID when provided`);
    }
    if (!isNonEmptyString(source.id)) {
      failures.push(`source at index ${index}: id missing`);
    } else if (ids.has(source.id)) {
      failures.push(`missing or duplicate source id: ${source.id}`);
    } else {
      ids.add(source.id);
    }

    if (!isNonEmptyString(source.authority)) failures.push(`source ${source.id ?? index}: authority missing`);
    if (!isNonEmptyString(source.domain)) failures.push(`source ${source.id ?? index}: domain missing`);

    const normalizedUrl = normalizeHttpsUrl(source.url);
    if (!normalizedUrl) failures.push(`source ${source.id ?? index}: valid HTTPS URL required`);
    if (normalizedUrl) {
      const priorOwner = urlOwners.get(normalizedUrl);
      if (priorOwner) {
        if (source.aliasOf !== priorOwner) failures.push(`source ${source.id ?? index}: duplicate URL must explicitly alias ${priorOwner}`);
      } else {
        urlOwners.set(normalizedUrl, source.id ?? String(index));
        if (source.aliasOf) failures.push(`source ${source.id ?? index}: aliasOf must reference the first registry entry for its URL`);
      }
    }

    if (!Array.isArray(source.claimsAllowed)
      || source.claimsAllowed.length === 0
      || !source.claimsAllowed.every(isNonEmptyString)) {
      failures.push(`source ${source.id ?? index}: claimsAllowed must be a non-empty string array`);
    }
    if (!Number.isInteger(source.reviewCadenceDays) || (source.reviewCadenceDays ?? 0) < 1) {
      failures.push(`source ${source.id ?? index}: invalid review cadence`);
    }
    if (source.implementationStatus !== 'not-assessed') {
      failures.push(`source ${source.id ?? index}: sources must default to not-assessed`);
    }
    if (source.scannerStatus !== 'active' && source.scannerStatus !== 'discovery-only') {
      failures.push(`source ${source.id ?? index}: scannerStatus must be active or discovery-only`);
    }
  }
}


if (isRecord(parsed)) {
  // Parse the scanner catalog as TypeScript so both factory calls and object literals
  // are counted. A pattern that silently misses a declaration must fail closed.
  const scannerText = readFileSync(scannerPath, 'utf8');
  const scannerCatalog = parseScannerSourceCatalog(scannerText);
  failures.push(...scannerCatalog.failures);
  const scannerIds = scannerCatalog.entries.map((entry) => entry.id);
  const scannerIdSet = new Set(scannerIds);
  const scannerUrls = new Map(scannerCatalog.entries.map((entry) => [entry.id, entry.url]));
  if (scannerCatalog.declaredCount !== scannerCatalog.entries.length) {
    failures.push('unable to parse every scanner source catalog entry');
  }
  if (scannerIds.length === 0) failures.push('scanner source catalog is empty');
  if (scannerIdSet.size !== scannerIds.length) failures.push('scanner source catalog contains duplicate IDs');
  for (const id of scannerIdSet) {
    if (!ids.has(id)) failures.push(`scanner source missing from authoritative registry: ${id}`);
    const source = (parsed as Registry).sources.find((item) => item.id === id);
    if (source && source.scannerStatus !== 'active') failures.push(`scanner source ${id} must be marked active in registry`);
    if (source && scannerUrls.get(id) !== source.url) failures.push(`scanner source ${id} URL does not match authoritative registry`);
  }
  for (const source of (parsed as Registry).sources) {
    if (source.aliasOf) {
      const target = (parsed as Registry).sources.find((candidate) => candidate.id === source.aliasOf);
      if (!target) failures.push(`source ${source.id}: aliasOf target ${source.aliasOf} does not exist`);
      else if (normalizeHttpsUrl(target.url) !== normalizeHttpsUrl(source.url) || target.id === source.id) failures.push(`source ${source.id}: aliasOf target must be a different source with the same normalized URL`);
    }
    if (source.scannerStatus === 'active' && !scannerIdSet.has(source.id)) {
      failures.push(`registry source ${source.id} is marked active but missing from scanner catalog`);
    }
    if (source.scannerStatus === 'discovery-only' && scannerIdSet.has(source.id)) {
      failures.push(`registry source ${source.id} is marked discovery-only but present in scanner catalog`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${JSON.stringify({ valid: false, failures }, null, 2)}\n`);
  process.exit(1);
}

const registry = parsed as Registry;
const domains = [...new Set(registry.sources.map(source => source.domain))].sort((left, right) => left.localeCompare(right));
process.stdout.write(`${JSON.stringify({
  valid: true,
  version: registry.version,
  sources: registry.sources.length,
  domains,
  irreversibleChangesExecuted: false
}, null, 2)}\n`);
