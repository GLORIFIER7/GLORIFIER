import { readFileSync } from 'node:fs';

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

const parseFactorySource = (entry: string): ScannerSourceEntry | null => {
  const match = /^createArchitectureSource\(\s*(['"])([^'"]+)\1\s*,\s*(['"])[^'"]+\3\s*,\s*(['"])[^'"]+\4\s*,\s*(['"])([^'"]+)\5\s*,/.exec(entry);
  return match ? { id: match[2] ?? '', url: match[8] ?? '' } : null;
};

const parseObjectSource = (entry: string): ScannerSourceEntry | null => {
  const id = /(?:^|[{,]\s*)id\s*:\s*(['"])([^'"]+)\1/.exec(entry);
  const url = /(?:^|[,]\s*)url\s*:\s*(['"])([^'"]+)\1/.exec(entry);
  return id && url ? { id: id[2] ?? '', url: url[2] ?? '' } : null;
};

const parseScannerSourceCatalog = (sourceText: string): {
  declaredCount: number;
  entries: ScannerSourceEntry[];
  failures: string[];
} => {
  const section = /const SOURCES: ArchitectureSource\[\] = \[\n([\s\S]*?)\n\];/.exec(sourceText);
  if (!section) {
    return { declaredCount: 0, entries: [], failures: ['unable to locate a complete scanner SOURCES array'] };
  }
  const sourceLines = (section[1] ?? '').split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//'));
  const entries: ScannerSourceEntry[] = [];
  const failures: string[] = [];
  for (const [index, line] of sourceLines.entries()) {
    const entry = line.replace(/,$/, '');
    const parsed = entry.startsWith('createArchitectureSource(')
      ? parseFactorySource(entry)
      : entry.startsWith('{') ? parseObjectSource(entry) : null;
    if (!parsed?.id || !parsed.url) {
      failures.push('scanner source at index ' + index + ' must be a single-line factory call or literal object with ID and URL');
      continue;
    }
    entries.push(parsed);
  }
  return { declaredCount: sourceLines.length, entries, failures };
};

const scannerParserFixture = "const SOURCES: ArchitectureSource[] = [\n  createArchitectureSource('factory-source', 'Example', 'cloud', 'https://factory.example/source', [], 24),\n  { id: 'literal-source', authority: 'Example', domain: 'cloud', url: 'https://literal.example/source', patternIds: [], cadenceHours: 24 },\n];";
const fixtureResult = parseScannerSourceCatalog(scannerParserFixture);
if (fixtureResult.declaredCount !== 2
    || fixtureResult.entries.length !== 2
    || fixtureResult.entries[0]?.id !== 'factory-source'
    || fixtureResult.entries[0]?.url !== 'https://factory.example/source'
    || fixtureResult.entries[1]?.id !== 'literal-source'
    || fixtureResult.entries[1]?.url !== 'https://literal.example/source') {
  throw new Error('scanner source parser must preserve factory-call and object-literal entries');
}

const unsupportedScannerFixture = "const SOURCES: ArchitectureSource[] = [\n  createArchitectureSource('computed' + '-id', 'Example', 'cloud', 'https://example.test', [], 24),\n];";
if (parseScannerSourceCatalog(unsupportedScannerFixture).failures.length === 0) {
  throw new Error('scanner source parser must fail closed on computed factory arguments');
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
