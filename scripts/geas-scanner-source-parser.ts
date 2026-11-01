type TokenKind = 'identifier' | 'string' | 'number' | 'punctuation';
type Token = { kind: TokenKind; text: string; value: string | null };
type Range = { start: number; end: number };

export type ScannerSourceEntry = { id: string; url: string; cadenceHours: number };
export type ScannerSourceCatalog = { declaredCount: number; entries: ScannerSourceEntry[]; failures: string[] };

const isWhitespace = (character: string): boolean => /\s/.test(character);
const isIdentifierStart = (character: string): boolean => /[A-Za-z_$]/.test(character);
const isIdentifierPart = (character: string): boolean => /[A-Za-z0-9_$]/.test(character);
const isDigit = (character: string): boolean => character >= '0' && character <= '9';

const skipWhitespace = (source: string, start: number): number => {
  let index = start;
  while (index < source.length && isWhitespace(source[index] ?? '')) index += 1;
  return index;
};

const readCommentEnd = (source: string, start: number): number | null => {
  if (source[start] !== '/') return null;
  if (source[start + 1] === '/') {
    const newline = source.indexOf('\n', start + 2);
    return newline < 0 ? source.length : newline + 1;
  }
  if (source[start + 1] !== '*') return null;
  const end = source.indexOf('*/', start + 2);
  if (end < 0) throw new Error('unterminated block comment in scanner source');
  return end + 2;
};

const readQuotedToken = (source: string, start: number): { token: Token; end: number } => {
  const quote = source[start] ?? '';
  let index = start + 1;
  let escaped = false;
  while (index < source.length) {
    const character = source[index] ?? '';
    if (character === '\\') {
      escaped = true;
      index += 2;
      continue;
    }
    if (character === quote) {
      const raw = source.slice(start + 1, index);
      return {
        token: { kind: 'string', text: source.slice(start, index + 1), value: escaped ? null : raw },
        end: index + 1,
      };
    }
    if (quote === '`' && character === '$' && source[index + 1] === '{') escaped = true;
    index += 1;
  }
  throw new Error('unterminated string or template literal in scanner source');
};

const readIdentifierToken = (source: string, start: number): { token: Token; end: number } => {
  let end = start + 1;
  while (end < source.length && isIdentifierPart(source[end] ?? '')) end += 1;
  const text = source.slice(start, end);
  return { token: { kind: 'identifier', text, value: text }, end };
};

const readNumberToken = (source: string, start: number): { token: Token; end: number } => {
  let end = start + 1;
  while (end < source.length && isDigit(source[end] ?? '')) end += 1;
  const text = source.slice(start, end);
  return { token: { kind: 'number', text, value: text }, end };
};

const readNextToken = (source: string, start: number): { token: Token | null; end: number } => {
  const whitespaceEnd = skipWhitespace(source, start);
  if (whitespaceEnd > start) return { token: null, end: whitespaceEnd };
  const commentEnd = readCommentEnd(source, start);
  if (commentEnd !== null) return { token: null, end: commentEnd };
  const character = source[start] ?? '';
  if (character === "'" || character === '"' || character === '`') return readQuotedToken(source, start);
  if (isIdentifierStart(character)) return readIdentifierToken(source, start);
  if (isDigit(character)) return readNumberToken(source, start);
  const text = source.startsWith('...', start) ? '...' : character;
  return { token: { kind: 'punctuation', text, value: text }, end: start + text.length };
};

const closingFor = (opening: string): string | null => {
  if (opening === '[') return ']';
  if (opening === '{') return '}';
  if (opening === '(') return ')';
  return null;
};

const openingFor = (closing: string): string | null => {
  if (closing === ']') return '[';
  if (closing === '}') return '{';
  if (closing === ')') return '(';
  return null;
};

const tokenizeScannerArray = (source: string, start: number): Token[] => {
  const tokens: Token[] = [];
  const expectedClosers = [']'];
  let index = start;
  while (index < source.length && expectedClosers.length > 0) {
    const next = readNextToken(source, index);
    index = next.end;
    if (!next.token) continue;
    tokens.push(next.token);
    if (next.token.kind !== 'punctuation') continue;
    const expected = closingFor(next.token.text);
    if (expected) { expectedClosers.push(expected); continue; }
    if (!openingFor(next.token.text)) continue;
    if (expectedClosers.pop() !== next.token.text) throw new Error('mismatched delimiter in scanner SOURCES array');
  }
  if (expectedClosers.length !== 0) throw new Error('unterminated scanner SOURCES array');
  return tokens;
};

const splitTopLevelRanges = (tokens: Token[], start: number, end: number, delimiter: string): Range[] => {
  const ranges: Range[] = [];
  const expectedClosers: string[] = [];
  let rangeStart = start;
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    if (!token || token.kind !== 'punctuation') continue;
    const expected = closingFor(token.text);
    if (expected) { expectedClosers.push(expected); continue; }
    if (openingFor(token.text)) {
      if (expectedClosers.pop() !== token.text) throw new Error('mismatched delimiter in scanner source entry');
      continue;
    }
    if (token.text === delimiter && expectedClosers.length === 0) {
      ranges.push({ start: rangeStart, end: index });
      rangeStart = index + 1;
    }
  }
  if (expectedClosers.length !== 0) throw new Error('unterminated nested expression in scanner source entry');
  ranges.push({ start: rangeStart, end });
  return ranges.filter(range => range.start < range.end);
};

const literalPropertyName = (token: Token | undefined): string | null => {
  if (!token) return null;
  return token.kind === 'identifier' ? token.text : token.kind === 'string' ? token.value : null;
};

const readPropertyValue = (tokens: Token[], ranges: Range[], name: string, kind: 'string' | 'number'): string | number | null => {
  const matches = ranges.filter(range => literalPropertyName(tokens[range.start]) === name);
  if (matches.length !== 1) return null;
  const range = matches[0];
  if (!range || range.end - range.start !== 3 || tokens[range.start + 1]?.text !== ':') return null;
  const value = tokens[range.start + 2];
  if (!value || value.kind !== kind || value.value === null) return null;
  return kind === 'number' ? Number(value.value) : value.value;
};

const parseObjectEntry = (tokens: Token[], range: Range): ScannerSourceEntry | null => {
  if (tokens[range.start]?.text !== '{' || tokens[range.end - 1]?.text !== '}') return null;
  const properties = splitTopLevelRanges(tokens, range.start + 1, range.end - 1, ',');
  if (properties.some(property => tokens[property.start]?.text === '...')) return null;
  const id = readPropertyValue(tokens, properties, 'id', 'string');
  const url = readPropertyValue(tokens, properties, 'url', 'string');
  const cadenceHours = readPropertyValue(tokens, properties, 'cadenceHours', 'number');
  return typeof id === 'string' && id.length > 0
    && typeof url === 'string' && url.length > 0
    && typeof cadenceHours === 'number' && Number.isInteger(cadenceHours)
    ? { id, url, cadenceHours }
    : null;
};

const parseFactoryEntry = (tokens: Token[], range: Range): ScannerSourceEntry | null => {
  if (tokens[range.start]?.text !== 'createArchitectureSource'
      || tokens[range.start + 1]?.text !== '('
      || tokens[range.end - 1]?.text !== ')') return null;
  const args = splitTopLevelRanges(tokens, range.start + 2, range.end - 1, ',');
  if (args.length !== 6) return null;
  const stringArgument = (index: number): string | null => {
    const arg = args[index];
    const token = arg && arg.end - arg.start === 1 ? tokens[arg.start] : undefined;
    return token?.kind === 'string' ? token.value : null;
  };
  const numberArgument = (index: number): number | null => {
    const arg = args[index];
    const token = arg && arg.end - arg.start === 1 ? tokens[arg.start] : undefined;
    return token?.kind === 'number' && token.value !== null ? Number(token.value) : null;
  };
  const id = stringArgument(0);
  const authority = stringArgument(1);
  const domain = stringArgument(2);
  const url = stringArgument(3);
  const patterns = args[4];
  const cadenceHours = numberArgument(5);
  if (!patterns || tokens[patterns.start]?.text !== '[' || tokens[patterns.end - 1]?.text !== ']') return null;
  return id && authority && domain && url && cadenceHours !== null && Number.isInteger(cadenceHours)
    ? { id, url, cadenceHours }
    : null;
};

const findArrayStart = (source: string): number => {
  const declaration = /\b(?:const|let|var)\s+SOURCES\b/.exec(source);
  if (!declaration) return -1;
  const equals = source.indexOf('=', declaration.index + declaration[0].length);
  return equals < 0 ? -1 : source.indexOf('[', equals + 1);
};

export const parseScannerSourceCatalog = (source: string): ScannerSourceCatalog => {
  const arrayStart = findArrayStart(source);
  if (arrayStart < 0) {
    return { declaredCount: 0, entries: [], failures: ['unable to locate a complete scanner SOURCES array'] };
  }
  const tokens = tokenizeScannerArray(source, arrayStart);
  const ranges = splitTopLevelRanges(tokens, 1, tokens.length - 1, ',');
  const entries: ScannerSourceEntry[] = [];
  const failures: string[] = [];
  ranges.forEach((range, index) => {
    const entry = parseObjectEntry(tokens, range) ?? parseFactoryEntry(tokens, range);
    if (entry) entries.push(entry);
    else failures.push('scanner source at index ' + index + ' must use literal ID, URL, and cadence values');
  });
  return { declaredCount: ranges.length, entries, failures };
};
