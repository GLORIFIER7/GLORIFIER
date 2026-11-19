/**
 * Small linear-time string helpers for repository maintenance scripts.
 */

export function stripTrailingCharacter(value, character) {
  if (typeof character !== 'string' || character.length !== 1) {
    throw new TypeError('The trailing character must be exactly one character.');
  }
  let end = value.length;
  while (end > 0 && value[end - 1] === character) end -= 1;
  return value.slice(0, end);
}

export function stripTrailingSlashes(value) {
  return stripTrailingCharacter(value, '/');
}

export function hasFingerprintAssetSegment(filename) {
  const isHashCharacter = (character) =>
    (character >= 'a' && character <= 'z')
    || (character >= 'A' && character <= 'Z')
    || (character >= '0' && character <= '9')
    || character === '_'
    || character === '-';

  let index = 0;
  while (index < filename.length) {
    if (filename[index] !== '.' && filename[index] !== '-') {
      index += 1;
      continue;
    }

    const hashStart = index + 1;
    // A hyphen starts a segment; it must not also become the first hash
    // character, otherwise a repeated separator can satisfy the length gate.
    if (filename[hashStart] === '-' || !isHashCharacter(filename[hashStart] ?? '')) {
      index += 1;
      continue;
    }

    let end = hashStart;
    while (end < filename.length && isHashCharacter(filename[end])) end += 1;
    if (end - hashStart >= 8 && filename[end] === '.') return true;
    index = end;
  }
  return false;
}

export function extractFirstFencedContent(value, language, options = {}) {
  const openingPattern = /```([^\r\n]*)\r?\n/.exec(value);
  if (!openingPattern) return null;

  const label = openingPattern[1].trim();
  if (language && label.toLowerCase() !== language.toLowerCase()) return null;

  const contentStart = openingPattern.index + openingPattern[0].length;
  let closingIndex;
  if (options.requireStandaloneClosing) {
    const closingPattern = /^ {0,3}```[ \t]*(?:\r?\n|$)/gm;
    closingPattern.lastIndex = contentStart;
    closingIndex = closingPattern.exec(value)?.index ?? -1;
  } else {
    closingIndex = value.indexOf('```', contentStart);
  }

  return closingIndex < 0 ? null : value.slice(contentStart, closingIndex);
}

export function stripOuterCodeFence(value, language) {
  let result = value.trim();
  if (!result.startsWith('```')) return result;

  let start = 3;
  if (
    language
    && result.slice(start, start + language.length).toLowerCase() === language.toLowerCase()
    && !/[a-z0-9_-]/i.test(result[start + language.length] ?? '')
  ) {
    start += language.length;
  }
  while (result[start] !== undefined && result[start].trim() === '') start += 1;
  result = result.slice(start);

  let end = result.length;
  while (end > 0 && result[end - 1].trim() === '') end -= 1;
  if (result.slice(Math.max(0, end - 3), end) === '```') {
    end -= 3;
    while (end > 0 && result[end - 1].trim() === '') end -= 1;
  }

  return result.slice(0, end);
}
