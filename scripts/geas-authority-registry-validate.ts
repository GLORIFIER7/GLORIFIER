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
const normalizeHttpsUrl = (value: unknown): string | null => {
  if (!isNonEmptyString(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
};

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
  // Keep the machine-readable registry and executable scanner catalog in sync.
// The scanner catalog is deliberately bounded to the SOURCES declaration so pattern IDs
// elsewhere in the file cannot be mistaken for source IDs.
const scannerText = readFileSync(scannerPath, 'utf8');
const sourceSection = scannerText.split('const SOURCES: ArchitectureSource[] = [')[1]?.split('const definePattern = (')[0];
if (!sourceSection) {
  failures.push('unable to locate scanner SOURCES catalog');
} else {
  const scannerIds = [...sourceSection.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);
  const scannerIdSet = new Set(scannerIds);
  const scannerSourceEntries = [...sourceSection.matchAll(/\{\s*id:\s*'([^']+)'([^{}]*)\}/g)].map((match) => ({
    id: match[1],
    url: match[2].match(/\burl:\s*'([^']+)'/)?.[1] ?? '',
  }));
  const scannerUrls = new Map(scannerSourceEntries.map((entry) => [entry.id, entry.url]));
  if (scannerSourceEntries.length !== scannerIds.length) failures.push('unable to parse each scanner source URL within its source object');
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
