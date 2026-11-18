/**
 * Linear-time string helpers used where regular expressions were previously
 * used for repeated suffix trimming and simple delimiter extraction.
 */

export function stripTrailingCharacter(value: string, character: string): string {
  if (character.length !== 1) {
    throw new TypeError('The trailing character must be exactly one character.');
  }

  let end = value.length;
  while (end > 0 && value[end - 1] === character) end -= 1;
  return value.slice(0, end);
}

export function stripTrailingSlashes(value: string): string {
  return stripTrailingCharacter(value, '/');
}

export function stripTrailingZeros(value: string): string {
  return stripTrailingCharacter(value, '0');
}

export function stripBase64Padding(value: string): string {
  return stripTrailingCharacter(value, '=');
}

export function hasFingerprintAssetSegment(filename: string): boolean {
  const isHashCharacter = (character: string): boolean =>
    (character >= 'a' && character <= 'z')
    || (character >= 'A' && character <= 'Z')
    || (character >= '0' && character <= '9')
    || character === '_'
    || character === '-';

  for (let index = 0; index < filename.length; index += 1) {
    if (filename[index] !== '.' && filename[index] !== '-') continue;
    let end = index + 1;
    while (end < filename.length && isHashCharacter(filename[end])) end += 1;
    if (end - index - 1 >= 8 && filename[end] === '.') return true;
    index = end - 1;
  }

  return false;
}

export function stripHtmlTags(value: string): string {
  let result = '';
  let index = 0;

  while (index < value.length) {
    if (value[index] === '<') {
      const closing = value.indexOf('>', index + 1);
      if (closing < 0) {
        result += value.slice(index);
        break;
      }
      if (closing > index + 1) {
        result += ' ';
        index = closing + 1;
        continue;
      }
    }

    result += value[index];
    index += 1;
  }

  return result;
}

export function extractGreedyBracedText(value: string): string | null {
  const opening = value.indexOf('{');
  const closing = value.lastIndexOf('}');
  if (opening < 0 || closing < opening) return null;
  return value.slice(opening, closing + 1);
}

export function extractAngleBracketContent(value: string): string | null {
  let searchFrom = 0;

  while (searchFrom < value.length) {
    const opening = value.indexOf('<', searchFrom);
    if (opening < 0) return null;
    const closing = value.indexOf('>', opening + 1);
    if (closing < 0) return null;
    if (closing > opening + 1) return value.slice(opening + 1, closing);
    searchFrom = closing + 1;
  }

  return null;
}

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && character.trim() === '';
}

export function stripOuterCodeFence(value: string, language?: string): string {
  let result = value.trim();

  if (result.startsWith('```')) {
    let start = 3;
    if (language && result.slice(start, start + language.length).toLowerCase() === language.toLowerCase()) {
      start += language.length;
    }
    while (isWhitespace(result[start])) start += 1;
    result = result.slice(start);
  }

  let end = result.length;
  while (end > 0 && isWhitespace(result[end - 1])) end -= 1;
  if (result.slice(Math.max(0, end - 3), end) === '```') {
    end -= 3;
    while (end > 0 && isWhitespace(result[end - 1])) end -= 1;
  }

  return result.slice(0, end);
}

export function extractFirstFencedContent(value: string, language?: string): string | null {
  const opening = value.indexOf('```');
  if (opening < 0) return null;

  let start = opening + 3;
  if (language && value.slice(start, start + language.length).toLowerCase() === language.toLowerCase()) {
    start += language.length;
  }
  while (isWhitespace(value[start])) start += 1;

  const closing = value.indexOf('```', start);
  if (closing < 0) return null;
  return value.slice(start, closing);
}
