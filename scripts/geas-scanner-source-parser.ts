type TokenKind = 'identifier' | 'string' | 'number' | 'punctuation';
type Token = { kind: TokenKind; text: string; value: string | null };
type Range = { start: number; end: number };
type DelimiterState = { expected: string[] };

export type ScannerSourceEntry = { id: string; url: string; cadenceHours: number };
export type ScannerSourceCatalog = { declaredCount: number; entries: ScannerSourceEntry[]; failures: string[] };

const isWhitespace = (value: string): boolean => /\s/.test(value);
const isIdentifierStart = (value: string): boolean => /[A-Za-z_$]/.test(value);
const isIdentifierPart = (value: string): boolean => /[A-Za-z0-9_$]/.test(value);
const isDigit = (value: string): boolean => value >= '0' && value <= '9';

const skipWhitespace = (source: string, start: number): number => {
  let index = start;
  while (index < source.length && isWhitespace(source[index] ?? '')) index += 1;
  return index;
};

const skipLineComment = (source: string, start: number): number => {
  const newline = source.indexOf('\n', start + 2);
  return newline < 0 ? source.length : newline + 1;
};

const skipBlockComment = (source: string, start: number): number => {
  const closing = source.indexOf('*/', start + 2);
  if (closing < 0) throw new Error('unterminated block comment in scanner source');
  return closing + 2;
};

const skipComment = (source: string, start: number): number | null => {
  if (!source.startsWith('//', start) && !source.startsWith('/*', start)) return null;
  return source.startsWith('//', start) ? skipLineComment(source, start) : skipBlockComment(source, start);
};

const quotedPattern = (quote: string): RegExp => {
  if (quote === "'") return /^'(?:\\.|[^'\\])*'/;
  if (quote === '"') return /^"(?:\\.|[^"\\])*"/;
  return /^`(?:\\.|[^`\\])*`/;
};

const readStaticQuotedValue = (quote: string, text: string, value: string): string | null => {
  if (text.includes('\\')) return null;
  if (quote === '`' && value.includes('${')) return null;
  return value;
};

const readQuotedToken = (source: string, start: number): { token: Token; end: number } => {
  const quote = source[start] ?? '';
  const match = quotedPattern(quote).exec(source.slice(start));
  if (!match) throw new Error('unterminated string or template literal in scanner source');
  const text = match[0];
  const value = text.slice(1, -1);
  return {
    token: { kind: 'string', text, value: readStaticQuotedValue(quote, text, value) },
    end: start + text.length,
  };
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

const readPunctuationToken = (source: string, start: number): { token: Token; end: number } => {
  const text = source.startsWith('...', start) ? '...' : source[start] ?? '';
  return { token: { kind: 'punctuation', text, value: text }, end: start + text.length };
};

type TokenReader = {
  matches: (character: string) => boolean;
  read: (source: string, start: number) => { token: Token; end: number };
};

const tokenReaders: TokenReader[] = [
  { matches: character => character === "'" || character === '"' || character === '`', read: readQuotedToken },
  { matches: isIdentifierStart, read: readIdentifierToken },
  { matches: isDigit, read: readNumberToken },
];

const readCodeToken = (source: string, start: number): { token: Token; end: number } => {
  const character = source[start] ?? '';
  const reader = tokenReaders.find(candidate => candidate.matches(character));
  return reader ? reader.read(source, start) : readPunctuationToken(source, start);
};

const readNextToken = (source: string, start: number): { token: Token | null; end: number } => {
  const whitespaceEnd = skipWhitespace(source, start);
  if (whitespaceEnd > start) return { token: null, end: whitespaceEnd };
  const commentEnd = skipComment(source, start);
  if (commentEnd !== null) return { token: null, end: commentEnd };
  return readCodeToken(source, start);
};

const expectedClosingDelimiter = (token: Token): string | null => {
  if (token.text === '[') return ']';
  if (token.text === '{') return '}';
  if (token.text === '(') return ')';
  return null;
};

const isClosingDelimiter = (token: Token): boolean =>
  token.text === ']' || token.text === '}' || token.text === ')';

const updateDelimiterState = (token: Token, state: DelimiterState): void => {
  if (token.kind !== 'punctuation') return;
  const expected = expectedClosingDelimiter(token);
  if (expected) { state.expected.push(expected); return; }
  if (!isClosingDelimiter(token)) return;
  const actual = token.text;
  const expectedActual = state.expected.pop();
  if (expectedActual !== actual) throw new Error('mismatched delimiter in scanner source');
};

const isScannerArrayClosed = (tokens: Token[], state: DelimiterState): boolean =>
  tokens[0]?.text === '[' && state.expected.length === 0;

const tokenizeScannerArray = (source: string, start: number): Token[] => {
  const tokens: Token[] = [];
  const state: DelimiterState = { expected: [] };
  let index = start;
  while (index < source.length) {
    const next = readNextToken(source, index);
    index = next.end;
    if (!next.token) continue;
    tokens.push(next.token);
    updateDelimiterState(next.token, state);
    if (isScannerArrayClosed(tokens, state)) break;
  }
  const lastToken = tokens[tokens.length - 1];
  if (tokens[0]?.text !== '[' || lastToken?.text !== ']') {
    throw new Error('unterminated scanner SOURCES array');
  }
  return tokens;
};

const isTopLevelSeparator = (token: Token, state: DelimiterState, delimiter: string): boolean =>
  token.kind === 'punctuation' && token.text === delimiter && state.expected.length === 0;

const splitTopLevelRanges = (tokens: Token[], start: number, end: number, delimiter: string): Range[] => {
  const ranges: Range[] = [];
  const state: DelimiterState = { expected: [] };
  let rangeStart = start;
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (isTopLevelSeparator(token, state, delimiter)) {
      ranges.push({ start: rangeStart, end: index });
      rangeStart = index + 1;
    } else {
      updateDelimiterState(token, state);
    }
  }
  if (state.expected.length !== 0) throw new Error('unterminated nested expression in scanner source entry');
  ranges.push({ start: rangeStart, end });
  return ranges.filter(range => range.start < range.end);
};

const readPropertyName = (token: Token | undefined): string | null => {
  if (!token) return null;
  if (token.kind === 'identifier') return token.text;
  return token.kind === 'string' ? token.value : null;
};

const getPropertyRange = (tokens: Token[], ranges: Range[], name: string): Range | null => {
  const matches = ranges.filter(range => readPropertyName(tokens[range.start]) === name);
  return matches.length === 1 ? matches[0] ?? null : null;
};

const readSinglePropertyValueToken = (tokens: Token[], range: Range | null): Token | null => {
  if (!range || range.end - range.start !== 3 || tokens[range.start + 1]?.text !== ':') return null;
  return tokens[range.start + 2] ?? null;
};

const readLiteralTokenValue = (token: Token | null, kind: 'string' | 'number'): string | number | null => {
  if (!token || token.kind !== kind || token.value === null) return null;
  return kind === 'number' ? Number(token.value) : token.value;
};

const readLiteralProperty = (tokens: Token[], ranges: Range[], name: string, kind: 'string' | 'number'): string | number | null =>
  readLiteralTokenValue(readSinglePropertyValueToken(tokens, getPropertyRange(tokens, ranges, name)), kind);

const isNonEmptyStringValue = (value: string | number | null): value is string =>
  typeof value === 'string' && value.length > 0;

const isPositiveIntegerValue = (value: string | number | null): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const createSourceEntry = (id: string | number | null, url: string | number | null, cadenceHours: string | number | null): ScannerSourceEntry | null => {
  if (!isNonEmptyStringValue(id) || !isNonEmptyStringValue(url)) return null;
  if (!isPositiveIntegerValue(cadenceHours)) return null;
  return { id, url, cadenceHours };
};

const parseObjectEntry = (tokens: Token[], range: Range): ScannerSourceEntry | null => {
  const isObject = tokens[range.start]?.text === '{' && tokens[range.end - 1]?.text === '}';
  if (!isObject) return null;
  const properties = splitTopLevelRanges(tokens, range.start + 1, range.end - 1, ',');
  if (properties.some(property => tokens[property.start]?.text === '...')) return null;
  const id = readLiteralProperty(tokens, properties, 'id', 'string');
  const url = readLiteralProperty(tokens, properties, 'url', 'string');
  const cadence = readLiteralProperty(tokens, properties, 'cadenceHours', 'number');
  return createSourceEntry(id, url, cadence);
};

const argumentRange = (arguments_: Range[], index: number): Range | null => arguments_[index] ?? null;

const readStringArgument = (tokens: Token[], arguments_: Range[], index: number): string | null => {
  const range = argumentRange(arguments_, index);
  if (!range || range.end - range.start !== 1) return null;
  const token = tokens[range.start];
  return token?.kind === 'string' ? token.value : null;
};

const readNumberArgument = (tokens: Token[], arguments_: Range[], index: number): number | null => {
  const range = argumentRange(arguments_, index);
  if (!range || range.end - range.start !== 1) return null;
  const token = tokens[range.start];
  return token?.kind === 'number' && token.value !== null ? Number(token.value) : null;
};

const isLiteralPatternArray = (tokens: Token[], range: Range | null): boolean =>
  Boolean(range && tokens[range.start]?.text === '[' && tokens[range.end - 1]?.text === ']');

const isFactoryCallRange = (tokens: Token[], range: Range): boolean =>
  tokens[range.start]?.text === 'createArchitectureSource'
  && tokens[range.start + 1]?.text === '('
  && tokens[range.end - 1]?.text === ')';

const readFactorySourceEntry = (tokens: Token[], arguments_: Range[]): ScannerSourceEntry | null => {
  const id = readStringArgument(tokens, arguments_, 0);
  const authority = readStringArgument(tokens, arguments_, 1);
  const domain = readStringArgument(tokens, arguments_, 2);
  const url = readStringArgument(tokens, arguments_, 3);
  const cadence = readNumberArgument(tokens, arguments_, 5);
  if (!authority || !domain) return null;
  return createSourceEntry(id, url, cadence);
};

const parseFactoryEntry = (tokens: Token[], range: Range): ScannerSourceEntry | null => {
  if (!isFactoryCallRange(tokens, range)) return null;
  const arguments_ = splitTopLevelRanges(tokens, range.start + 2, range.end - 1, ',');
  if (arguments_.length !== 6) return null;
  if (!isLiteralPatternArray(tokens, argumentRange(arguments_, 4))) return null;
  return readFactorySourceEntry(tokens, arguments_);
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
    else failures.push(`scanner source at index ${index} must use literal ID, URL, and cadence values`);
  });
  return { declaredCount: ranges.length, entries, failures };
};