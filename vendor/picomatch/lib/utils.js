/*global navigator*/
'use strict';

const {
  REGEX_BACKSLASH,
  REGEX_SPECIAL_CHARS,
  REGEX_SPECIAL_CHARS_GLOBAL
} = require('./constants');

exports.isObject = val => val !== null && typeof val === 'object' && !Array.isArray(val);
exports.hasRegexChars = str => REGEX_SPECIAL_CHARS.test(str);
exports.isRegexChar = str => str.length === 1 && exports.hasRegexChars(str);
exports.escapeRegex = str => str.replace(REGEX_SPECIAL_CHARS_GLOBAL, '\\$1');
exports.toPosixSlashes = str => str.replace(REGEX_BACKSLASH, '/');

exports.isWindows = () => {
  if (typeof navigator !== 'undefined' && navigator.platform) {
    const platform = navigator.platform.toLowerCase();
    return platform === 'win32' || platform === 'windows';
  }

  if (typeof process !== 'undefined' && process.platform) {
    return process.platform === 'win32';
  }

  return false;
};

exports.removeBackslashes = str => {
  let output = '';
  let index = 0;
  let preserveBracketClasses = true;

  while (index < str.length) {
    if (preserveBracketClasses && str[index] === '\\' && str[index + 1] === '[') {
      let close = index + 3;

      // Preserve a complete escaped-opening bracket class only when its closing
      // bracket is preceded by a non-backslash character, matching the old
      // parser contract without using a backtracking regular expression.
      while (close < str.length && (str[close] !== ']' || str[close - 1] === '\\')) {
        close++;
      }

      if (close < str.length) {
        output += str.slice(index, close + 1);
        index = close + 1;
        continue;
      }

      // No closing class exists after this opener. No later opener can form a
      // complete class either, so finish with a simple linear escape pass.
      preserveBracketClasses = false;
      index++;
      continue;
    }

    if (str[index] === '\\' && index + 1 < str.length) {
      index++;
      continue;
    }

    output += str[index];
    index++;
  }

  return output;
};

exports.escapeLast = (input, char, lastIdx) => {
  const idx = input.lastIndexOf(char, lastIdx);
  if (idx === -1) return input;
  if (input[idx - 1] === '\\') return exports.escapeLast(input, char, idx - 1);
  return `${input.slice(0, idx)}\\${input.slice(idx)}`;
};

exports.removePrefix = (input, state = {}) => {
  let output = input;
  if (output.startsWith('./')) {
    output = output.slice(2);
    state.prefix = './';
  }
  return output;
};

exports.wrapOutput = (input, state = {}, options = {}) => {
  const prepend = options.contains ? '' : '^';
  const append = options.contains ? '' : '$';

  let output = `${prepend}(?:${input})${append}`;
  if (state.negated === true) {
    output = `(?:^(?!${output}).*$)`;
  }
  return output;
};

exports.basename = (path, { windows } = {}) => {
  const segs = path.split(windows ? /[\\/]/ : '/');
  const last = segs[segs.length - 1];

  if (last === '') {
    return segs[segs.length - 2];
  }

  return last;
};
