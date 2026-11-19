/**
 * Typed facade for shared linear-time helpers in the Node/browser utility module.
 * Keep shared implementations in scripts/linear-string.mjs so script and app
 * code exercise the same implementation.
 */
import {
  extractFirstFencedContent,
  hasFingerprintAssetSegment,
  stripOuterCodeFence,
  stripTrailingCharacter,
  stripTrailingSlashes,
} from '../../scripts/linear-string.mjs';

export {
  extractFirstFencedContent,
  hasFingerprintAssetSegment,
  stripOuterCodeFence,
  stripTrailingCharacter,
  stripTrailingSlashes,
};

export function stripTrailingZeros(value: string): string {
  return stripTrailingCharacter(value, '0');
}

export function stripBase64Padding(value: string): string {
  return stripTrailingCharacter(value, '=');
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

