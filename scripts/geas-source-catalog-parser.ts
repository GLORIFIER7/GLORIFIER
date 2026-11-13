type TokenKind = 'identifier' | 'string' | 'number' | 'punctuation';
type Token = { kind: TokenKind; text: string; value: string | null };
type Range = { start: number; end: number };
type LiteralValue = string | number | null;
type DelimiterState = { expected: string[] };

export type ScannerSourceEntry = { id: string; url: string; cadenceHours: number; claimsAllowed: string[] };
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

const isStaticQuotedValue = (quote: string, text: string, value: string): boolean =>
  !text.includes('\\') && !(quote === '`' && value.includes('${'));

const readStaticQuotedValue = (quote: string, text: string, value: string): string | null =>
  isStaticQuotedValue(quote, text, value) ? value : null;

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

const skipTrivia = (source: string, start: number): number => {
  let index = start;
  while (index < source.length) {
    const whitespaceEnd = skipWhitespace(source, index);
    if (whitespaceEnd > index) {
      index = whitespaceEnd;
      continue;
    }
    const commentEnd = skipComment(source, index);
    if (commentEnd !== null) {
      index = commentEnd;
      continue;
    }
    break;
  }
  return index;
};

const readNextToken = (source: string, start: number): { token: Token | null; end: number } => {
  const tokenStart = skipTrivia(source, start);
  if (tokenStart >= source.length) return { token: null, end: tokenStart };
  return readCodeToken(source, tokenStart);
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

const appendScannerToken = (tokens: Token[], state: DelimiterState, token: Token): boolean => {
  tokens.push(token);
  updateDelimiterState(token, state);
  return isScannerArrayClosed(tokens, state);
};

const scanUntilArrayClosed = (
  source: string,
  start: number,
  tokens: Token[],
  state: DelimiterState,
): boolean => {
  let index = start;
  while (index < source.length) {
    const next = readNextToken(source, index);
    index = next.end;
    if (next.token && appendScannerToken(tokens, state, next.token)) return true;
  }
  return false;
};

const isCompleteScannerArray = (tokens: Token[]): boolean =>
  tokens[0]?.text === '[' && tokens.at(-1)?.text === ']';

const tokenizeScannerArray = (source: string, start: number): Token[] => {
  const tokens: Token[] = [];
  const state: DelimiterState = { expected: [] };
  const isClosed = scanUntilArrayClosed(source, start, tokens, state);
  if (!isClosed || !isCompleteScannerArray(tokens)) {
    throw new Error('unterminated scanner SOURCES array');
  }
  return tokens;
};

const isTopLevelSeparator = (token: Token, state: DelimiterState, delimiter: string): boolean =>
  token.kind === 'punctuation' && token.text === delimiter && state.expected.length === 0;

const advanceRangeBoundary = (
  ranges: Range[],
  rangeStart: number,
  index: number,
  token: Token,
  state: DelimiterState,
  delimiter: string,
): number => {
  if (!isTopLevelSeparator(token, state, delimiter)) {
    updateDelimiterState(token, state);
    return rangeStart;
  }
  ranges.push({ start: rangeStart, end: index });
  return index + 1;
};

const splitTopLevelRanges = (tokens: Token[], start: number, end: number, delimiter: string): Range[] => {
  const ranges: Range[] = [];
  const state: DelimiterState = { expected: [] };
  let rangeStart = start;
  for (let index = start; index < end; index += 1) {
    const token = tokens[index];
    if (token) rangeStart = advanceRangeBoundary(ranges, rangeStart, index, token, state, delimiter);
  }
  if (state.expected.length !== 0) throw new Error('unterminated nested expression in scanner source entry');
  if (rangeStart < end) ranges.push({ start: rangeStart, end });
  return ranges;
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

const readLiteralTokenValue = (token: Token | null, kind: 'string' | 'number'): LiteralValue => {
  if (token?.kind !== kind || token.value === null) return null;
  return kind === 'number' ? Number(token.value) : token.value;
};

const readLiteralProperty = (tokens: Token[], ranges: Range[], name: string, kind: 'string' | 'number'): LiteralValue =>
  readLiteralTokenValue(readSinglePropertyValueToken(tokens, getPropertyRange(tokens, ranges, name)), kind);

const isNonEmptyStringValue = (value: LiteralValue): value is string =>
  typeof value === 'string' && value.length > 0;

const isPositiveIntegerValue = (value: LiteralValue): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

type ValidSourceEntryValues = { id: string; url: string; cadenceHours: number; claimsAllowed: string[] };

const isValidSourceEntryValues = (
  value: { id: LiteralValue; url: LiteralValue; cadenceHours: LiteralValue; claimsAllowed: string[] | null },
): value is ValidSourceEntryValues =>
  isNonEmptyStringValue(value.id)
  && isNonEmptyStringValue(value.url)
  && isPositiveIntegerValue(value.cadenceHours)
  && Array.isArray(value.claimsAllowed)
  && value.claimsAllowed.length > 0
  && value.claimsAllowed.every(claim => typeof claim === 'string' && claim.length > 0)
  && new Set(value.claimsAllowed).size === value.claimsAllowed.length;

const createSourceEntry = (
  id: LiteralValue,
  url: LiteralValue,
  cadenceHours: LiteralValue,
  claimsAllowed: string[] | null,
): ScannerSourceEntry | null => {
  const values = { id, url, cadenceHours, claimsAllowed };
  return isValidSourceEntryValues(values) ? values : null;
};

const readObjectPropertyRanges = (tokens: Token[], range: Range): Range[] | null => {
  const isObject = tokens[range.start]?.text === '{' && tokens[range.end - 1]?.text === '}';
  return isObject ? splitTopLevelRanges(tokens, range.start + 1, range.end - 1, ',') : null;
};

const hasUnsupportedObjectSpread = (tokens: Token[], properties: Range[]): boolean =>
  properties.some(property => tokens[property.start]?.text === '...');

const readObjectSourceEntry = (tokens: Token[], properties: Range[]): ScannerSourceEntry | null => {
  const id = readLiteralProperty(tokens, properties, 'id', 'string');
  const url = readLiteralProperty(tokens, properties, 'url', 'string');
  const cadence = readLiteralProperty(tokens, properties, 'cadenceHours', 'number');
  const claimsAllowed = readLiteralStringArrayProperty(tokens, properties, 'claimsAllowed');
  return createSourceEntry(id, url, cadence, claimsAllowed);
};

const parseObjectEntry = (tokens: Token[], range: Range): ScannerSourceEntry | null => {
  const properties = readObjectPropertyRanges(tokens, range);
  return properties && !hasUnsupportedObjectSpread(tokens, properties)
    ? readObjectSourceEntry(tokens, properties)
    : null;
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

const readLiteralStringArray = (tokens: Token[], range: Range | null): string[] | null => {
  if (!isLiteralPatternArray(tokens, range) || !range) return null;
  const ranges = splitTopLevelRanges(tokens, range.start + 1, range.end - 1, ',');
  const values = ranges.map(item => {
    if (item.end - item.start !== 1) return null;
    const token = tokens[item.start];
    return token?.kind === 'string' ? token.value : null;
  });
  return values.every((value): value is string => typeof value === 'string' && value.length > 0)
    ? values
    : null;
};

const readLiteralStringArrayProperty = (tokens: Token[], properties: Range[], name: string): string[] | null => {
  const property = getPropertyRange(tokens, properties, name);
  if (!property || tokens[property.start + 1]?.text !== ':') return null;
  return readLiteralStringArray(tokens, { start: property.start + 2, end: property.end });
};

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
  const claimsAllowed = readLiteralStringArray(tokens, argumentRange(arguments_, 6));
  if (!authority || !domain) return null;
  return createSourceEntry(id, url, cadence, claimsAllowed);
};

const parseFactoryEntry = (tokens: Token[], range: Range): ScannerSourceEntry | null => {
  const arguments_ = isFactoryCallRange(tokens, range)
    ? splitTopLevelRanges(tokens, range.start + 2, range.end - 1, ',')
    : [];
  const hasExpectedArguments = arguments_.length === 7;
  const hasLiteralPatterns = isLiteralPatternArray(tokens, argumentRange(arguments_, 4));
  const hasLiteralClaimTypes = isLiteralPatternArray(tokens, argumentRange(arguments_, 6));
  return hasExpectedArguments && hasLiteralPatterns && hasLiteralClaimTypes
    ? readFactorySourceEntry(tokens, arguments_)
    : null;
};

const isVariableDeclaration = (token: Token | null): boolean =>
  token?.kind === 'identifier'
  && (token.text === 'const' || token.text === 'let' || token.text === 'var');

const findSourcesDeclarationEnd = (source: string): number | null => {
  let index = 0;
  while (index < source.length) {
    const keyword = readNextToken(source, index);
    if (!keyword.token) return null;
    index = keyword.end;
    if (!isVariableDeclaration(keyword.token)) continue;
    const name = readNextToken(source, index);
    if (name.token?.kind === 'identifier' && name.token.text === 'SOURCES') return name.end;
  }
  return null;
};

const findArrayInitializerStart = (source: string, declarationEnd: number): number => {
  let index = declarationEnd;
  while (index < source.length) {
    const token = readNextToken(source, index);
    if (!token.token || token.token.text === ';') return -1;
    if (token.token.text === '=') {
      const initializer = readNextToken(source, token.end);
      return initializer.token?.text === '[' ? initializer.end - 1 : -1;
    }
    index = token.end;
  }
  return -1;
};

const findArrayStart = (source: string): number => {
  const declarationEnd = findSourcesDeclarationEnd(source);
  return declarationEnd === null ? -1 : findArrayInitializerStart(source, declarationEnd);
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