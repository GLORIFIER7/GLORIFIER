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

  for (let index = 0; index < filename.length; index += 1) {
    if (filename[index] !== '.' && filename[index] !== '-') continue;
    let end = index + 1;
    while (end < filename.length && isHashCharacter(filename[end])) end += 1;
    if (end - index - 1 >= 8 && filename[end] === '.') return true;
  }
  return false;
}

export function stripOuterCodeFence(value, language) {
  let result = value.trim();

  if (result.startsWith('```')) {
    let start = 3;
    if (language && result.slice(start, start + language.length).toLowerCase() === language.toLowerCase()) {
      start += language.length;
    }
    while (result[start] !== undefined && result[start].trim() === '') start += 1;
    result = result.slice(start);
  }

  let end = result.length;
  while (end > 0 && result[end - 1].trim() === '') end -= 1;
  if (result.slice(Math.max(0, end - 3), end) === '```') {
    end -= 3;
    while (end > 0 && result[end - 1].trim() === '') end -= 1;
  }

  return result.slice(0, end);
}
