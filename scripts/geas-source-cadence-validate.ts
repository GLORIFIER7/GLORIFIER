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
function findMatchingDelimiter(source: string, start: number, open: string, close: string): number {
  if (source[start] !== open) throw new Error(`expected "${open}" at offset ${start}`);
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === open) depth += 1;
    if (ch === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`unterminated "${open}" delimiter in scanner source`);
}

function isValueTerminated(source: string, start: number): boolean {
  let i = start;
  while (i < source.length) {
    if (/\s/.test(source[i])) {
      i += 1;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0) return false;
      i = end + 2;
      continue;
    }
    if (source[i] === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i + 2);
      if (end < 0) return false;
      i = end + 1;
      continue;
    }
    return source[i] === ',' || source[i] === '}';
  }
  return false;
}

function readTopLevelProperty(
  objectText: string,
  property: 'id' | 'cadenceHours',
): string | number | undefined {
  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < objectText.length; i += 1) {
    const ch = objectText[i];
    const next = objectText[i + 1];

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch.charCodeAt(0) === 96) {
      quote = ch;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      continue;
    }
    if (depth !== 1 || !/[A-Za-z_$]/.test(ch)) continue;

    let end = i + 1;
    while (end < objectText.length && /[A-Za-z0-9_$]/.test(objectText[end])) end += 1;
    const key = objectText.slice(i, end);
    let colon = end;
    while (colon < objectText.length && /\s/.test(objectText[colon])) colon += 1;

    if (key === property && objectText[colon] === ':') {
      let valueStart = colon + 1;
      while (valueStart < objectText.length && /\s/.test(objectText[valueStart])) valueStart += 1;

      if (property === 'id') {
        const valueQuote = objectText[valueStart];
        if (valueQuote !== "'" && valueQuote !== '"') return undefined;
        let value = '';
        let valueEscaped = false;
        for (let j = valueStart + 1; j < objectText.length; j += 1) {
          const valueChar = objectText[j];
          if (valueEscaped) {
            value += valueChar;
            valueEscaped = false;
            continue;
          }
          if (valueChar === '\\') {
            valueEscaped = true;
            continue;
          }
          if (valueChar === valueQuote) return isValueTerminated(objectText, j + 1) ? value : undefined;
          value += valueChar;
        }
        return undefined;
      }

      const numberMatch = /^\d+/.exec(objectText.slice(valueStart));
      return numberMatch && isValueTerminated(objectText, valueStart + numberMatch[0].length)
        ? Number(numberMatch[0])
        : undefined;
    }
    i = end - 1;
  }
  return undefined;
}

function parseScannerSources(sourceText: string): ScannerSource[] {
  const declaration = /\b(?:const|let|var)\s+SOURCES\b/.exec(sourceText);
  if (!declaration) throw new Error('unable to locate the scanner SOURCES declaration');
  const equals = sourceText.indexOf('=', declaration.index + declaration[0].length);
  if (equals < 0) throw new Error('unable to locate the SOURCES initializer');
  const arrayStart = sourceText.indexOf('[', equals + 1);
  if (arrayStart < 0) throw new Error('SOURCES initializer is not an array');
  const arrayEnd = findMatchingDelimiter(sourceText, arrayStart, '[', ']');
  const arrayText = sourceText.slice(arrayStart + 1, arrayEnd);

  const objects: string[] = [];
  let depth = 0;
  let objectStart = -1;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < arrayText.length; i += 1) {
    const ch = arrayText[i];
    const next = arrayText[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) objectStart = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth < 0) throw new Error('unexpected closing brace in SOURCES array');
      if (depth === 0 && objectStart >= 0) {
        objects.push(arrayText.slice(objectStart, i + 1));
        objectStart = -1;
      }
    }
  }
  if (depth !== 0 || quote || blockComment || lineComment) throw new Error('unterminated object, string, or comment in SOURCES array');
  if (objects.length === 0) throw new Error('scanner SOURCES array contains no object entries');

  return objects.map((objectText) => {
    const id = readTopLevelProperty(objectText, 'id');
    const cadenceHours = readTopLevelProperty(objectText, 'cadenceHours');
    if (typeof id !== 'string' || !id || typeof cadenceHours !== 'number') {
      throw new Error('every scanner source must have a string id and numeric cadenceHours');
    }
    return { id, cadenceHours };
  });
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
  const parsed = parseScannerSources(fixture);
  if (parsed.length !== 1 || parsed[0].id !== 'fixture' || parsed[0].cadenceHours !== 24) {
    throw new Error('structured scanner parser failed its brace-containing string regression fixture');
  }
}

function verifyParserRejectsCommentOnlyFields(): void {
  const fixture = `const SOURCES: ArchitectureSource[] = [{
    // id: 'comment-only',
    // cadenceHours: 24
    authority: 'Test'
  }];`;
  let rejected = false;
  try {
    parseScannerSources(fixture);
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error('scanner parser accepted id and cadenceHours fields found only in comments');
  }
}

function verifyParserRejectsComputedFieldValues(): void {
  const fixtures = [
    \`const SOURCES: ArchitectureSource[] = [{
    id: 'computed' + '-id',
    cadenceHours: 24
  }];\`,
    \`const SOURCES: ArchitectureSource[] = [{
    id: 'computed',
    cadenceHours: 24 * 30
  }];\`,
  ];
  for (const fixture of fixtures) {
    let rejected = false;
    try {
      parseScannerSources(fixture);
    } catch {
      rejected = true;
    }
    if (!rejected) {
      throw new Error('scanner parser accepted a computed id or cadenceHours expression');
    }
  }
}

verifyParserHandlesBraceCharacters();
verifyParserRejectsComputedFieldValues();
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
