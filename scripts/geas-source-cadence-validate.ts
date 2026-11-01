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
const findMatchingDelimiter = (source: string, start: number, open: string, close: string): number => {
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
};

const skipQuotedLiteral = (source: string, start: number): number | null => {
  const quote = source[start];
  if (quote !== "'" && quote !== '"' && quote !== '`') return null;
  for (let index = start + 1; index < source.length; index += 1) {
    if (source[index] === '\\') { index += 1; continue; }
    if (source[index] === quote) return index + 1;
  }
  return -1;
};

const skipSourceComment = (source: string, start: number): number | null => {
  if (source[start] !== '/') return null;
  if (source[start + 1] === '/') {
    const newline = source.indexOf('\n', start + 2);
    return newline < 0 ? source.length : newline + 1;
  }
  if (source[start + 1] === '*') {
    const end = source.indexOf('*/', start + 2);
    return end < 0 ? -1 : end + 2;
  }
  return null;
};

const skipWhitespace = (source: string, start: number): number => {
  let index = start;
  while (index < source.length && /\s/.test(source[index])) index += 1;
  return index;
};

const readIdentifierEnd = (source: string, start: number): number => {
  let index = start + 1;
  while (index < source.length && /[A-Za-z0-9_$]/.test(source[index])) index += 1;
  return index;
};

const isValueTerminated = (source: string, start: number): boolean => {
  const index = skipWhitespace(source, start);
  if (index >= source.length) return false;
  const commentEnd = skipSourceComment(source, index);
  if (commentEnd !== null) return commentEnd >= 0 && commentEnd < source.length && isValueTerminated(source, commentEnd);
  return source[index] === ',' || source[index] === '}';
};

const readQuotedStringValue = (source: string, start: number): string | undefined => {
  const quote = source[start];
  if (quote !== "'" && quote !== '"') return undefined;
  let value = '';
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === '\\') {
      const escaped = source[index + 1];
      if (escaped === undefined) return undefined;
      value += escaped;
      index += 1;
      continue;
    }
    if (character === quote) return isValueTerminated(source, index + 1) ? value : undefined;
    value += character;
  }
  return undefined;
};

const readNumericValue = (source: string, start: number): number | undefined => {
  const match = /^\d+/.exec(source.slice(start));
  return match && isValueTerminated(source, start + match[0].length) ? Number(match[0]) : undefined;
};

const bracketDepthDelta = (character: string): number => {
  if (character === '{' || character === '[' || character === '(') return 1;
  if (character === '}' || character === ']' || character === ')') return -1;
  return 0;
};

const readTopLevelProperty = (
  objectText: string,
  property: 'id' | 'cadenceHours',
): string | number | undefined => {
  let depth = 0;
  let index = 0;
  while (index < objectText.length) {
    const commentEnd = skipSourceComment(objectText, index);
    if (commentEnd !== null) {
      if (commentEnd < 0) return undefined;
      index = commentEnd;
      continue;
    }
    const quoteEnd = skipQuotedLiteral(objectText, index);
    if (quoteEnd !== null) {
      if (quoteEnd < 0) return undefined;
      index = quoteEnd;
      continue;
    }
    const character = objectText[index];
    if (depth === 1 && /[A-Za-z_$]/.test(character)) {
      const keyEnd = readIdentifierEnd(objectText, index);
      if (objectText.slice(index, keyEnd) === property) {
        const colon = skipWhitespace(objectText, keyEnd);
        if (objectText[colon] === ':') {
          const valueStart = skipWhitespace(objectText, colon + 1);
          return property === 'id'
            ? readQuotedStringValue(objectText, valueStart)
            : readNumericValue(objectText, valueStart);
        }
      }
      index = keyEnd;
      continue;
    }
    depth += bracketDepthDelta(character);
    index += 1;
  }
  return undefined;
};

const maskCommentRange = (output: string[], source: string, start: number, end: number): void => {
  for (let index = start; index < end; index += 1) {
    if (source[index] !== '\n') output[index] = ' ';
  }
};

const maskComments = (source: string): string => {
  const output = [...source];
  let index = 0;
  while (index < source.length) {
    const commentEnd = skipSourceComment(source, index);
    if (commentEnd !== null) {
      if (commentEnd < 0) throw new Error('unterminated block comment in scanner source');
      maskCommentRange(output, source, index, commentEnd);
      index = commentEnd;
      continue;
    }
    const quoteEnd = skipQuotedLiteral(source, index);
    if (quoteEnd !== null) {
      if (quoteEnd < 0) throw new Error('unterminated string in scanner source');
      index = quoteEnd;
      continue;
    }
    index += 1;
  }
  return output.join('');
};

const collectObjectEntries = (arrayText: string): string[] => {
  const objects: string[] = [];
  let depth = 0;
  let objectStart = -1;
  let index = 0;
  while (index < arrayText.length) {
    const commentEnd = skipSourceComment(arrayText, index);
    if (commentEnd !== null) {
      if (commentEnd < 0) throw new Error('unterminated comment in SOURCES array');
      index = commentEnd;
      continue;
    }
    const quoteEnd = skipQuotedLiteral(arrayText, index);
    if (quoteEnd !== null) {
      if (quoteEnd < 0) throw new Error('unterminated string in SOURCES array');
      index = quoteEnd;
      continue;
    }
    const character = arrayText[index];
    if (character === '{') {
      if (depth === 0) objectStart = index;
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth < 0) throw new Error('unexpected closing brace in SOURCES array');
      if (depth === 0 && objectStart >= 0) {
        objects.push(arrayText.slice(objectStart, index + 1));
        objectStart = -1;
      }
    }
    index += 1;
  }
  if (depth !== 0 || objectStart >= 0) throw new Error('unterminated object in SOURCES array');
  return objects;
};

const parseObjectSource = (objectText: string): ScannerSource => {
  const id = readTopLevelProperty(objectText, 'id');
  const cadenceHours = readTopLevelProperty(objectText, 'cadenceHours');
  if (typeof id !== 'string' || !id || typeof cadenceHours !== 'number') {
    throw new Error('every object-form scanner source must have a string id and numeric cadenceHours');
  }
  return { id, cadenceHours };
};

const parseFactorySources = (arrayText: string): ScannerSource[] => {
  const pattern = /createArchitectureSource\(\s*'((?:\\.|[^'\\])*)'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*\[[\s\S]*?\]\s*,\s*(\d+)\s*\)/g;
  const entries = [...arrayText.matchAll(pattern)].map(match => ({ id: match[1] ?? '', cadenceHours: Number(match[2]) }));
  const declaredCount = (arrayText.match(/\bcreateArchitectureSource\s*\(/g) ?? []).length;
  if (entries.length !== declaredCount) throw new Error('every factory-form scanner source must use literal ID, URL, pattern list and cadence values');
  return entries;
};

const extractScannerArray = (sourceText: string): string => {
  const declaration = /\b(?:const|let|var)\s+SOURCES\b/.exec(sourceText);
  if (!declaration) throw new Error('unable to locate the scanner SOURCES declaration');
  const equals = sourceText.indexOf('=', declaration.index + declaration[0].length);
  const arrayStart = sourceText.indexOf('[', equals + 1);
  if (equals < 0 || arrayStart < 0) throw new Error('SOURCES initializer is not an array');
  const arrayEnd = findMatchingDelimiter(sourceText, arrayStart, '[', ']');
  return sourceText.slice(arrayStart + 1, arrayEnd);
};

const parseScannerSources = (sourceText: string): ScannerSource[] => {
  const arrayText = extractScannerArray(sourceText);
  const objectEntries = collectObjectEntries(arrayText).map(parseObjectSource);
  const factoryEntries = parseFactorySources(maskComments(arrayText));
  const entries = [...objectEntries, ...factoryEntries];
  if (entries.length === 0) throw new Error('scanner SOURCES array contains no supported source entries');
  return entries;
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
    `const SOURCES: ArchitectureSource[] = [
      createArchitectureSource('computed' + '-id', 'Test', 'cloud', 'https://example.org', [], 24),
    ];`,
    `const SOURCES: ArchitectureSource[] = [
      createArchitectureSource('computed', 'Test', 'cloud', 'https://example.org', [], 24 * 30),
    ];`,
  ];
  for (const fixture of fixtures) {
    let rejected = false;
    try {
      parseScannerSources(fixture);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error('scanner parser accepted computed factory ID or cadence values');
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
  if (parsed.length !== 1 || parsed[0].id !== 'fixture' || parsed[0].cadenceHours !== 24) {
    throw new Error('structured scanner parser failed its brace-containing string regression fixture');
  }
};

const verifyParserRejectsCommentOnlyFields = (): void => {
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
};

const verifyParserRejectsUnterminatedLineComment = (): void => {
  const fixture = "const SOURCES: ArchitectureSource[] = [{ id: 'fixture', cadenceHours: 24 // no terminating newline or visible array close";
  let rejected = false;
  try {
    parseScannerSources(fixture);
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new Error('scanner parser accepted a SOURCES array truncated inside a line comment');
  }
};

const verifyParserRejectsComputedFieldValues = (): void => {
  const fixtures = [
    `const SOURCES: ArchitectureSource[] = [{
    id: 'computed' + '-id',
    cadenceHours: 24
  }];`,
    `const SOURCES: ArchitectureSource[] = [{
    id: 'computed',
    cadenceHours: 24 * 30
  }];`,
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
};

verifyParserHandlesFactoryCalls();
verifyParserIgnoresCommentedFactoryCalls();
verifyParserRejectsComputedFactoryValues();
verifyParserHandlesBraceCharacters();
verifyParserRejectsComputedFieldValues();
verifyParserRejectsUnterminatedLineComment();
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
