import fs from 'node:fs';
import path from 'node:path';
import { createPrivateTempDir } from './private-temp-dir.mjs';

/**
 * Write a short-lived patch file into a mode-0700 directory and always remove
 * it after the callback returns or throws.
 */
export function withPrivateTempFile({ prefix, fileName, content }, action) {
  if (typeof fileName !== 'string' || fileName.length === 0 ||
      fileName === '.' || fileName === '..' ||
      fileName.includes('/') || fileName.includes('\\')) {
    throw new TypeError('Temporary patch filename must be a single path segment.');
  }
  if (typeof content !== 'string') {
    throw new TypeError('Temporary patch content must be a string.');
  }
  if (typeof action !== 'function') {
    throw new TypeError('Temporary patch action must be a function.');
  }

  const directory = createPrivateTempDir(prefix);
  try {
    const filePath = path.join(directory, fileName);
    fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.chmodSync(filePath, 0o600);
    if ((fs.statSync(filePath).mode & 0o777) !== 0o600) {
      throw new Error('Temporary patch file permissions are not private (expected mode 0600).');
    }
    return action(filePath);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
