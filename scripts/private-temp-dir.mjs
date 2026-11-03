import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PREFIX_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/i;

/**
 * Create a unique private directory for short-lived sensitive working files.
 * The directory is restricted to the current user and must be removed by the caller.
 */
export function createPrivateTempDir(prefix) {
  if (typeof prefix !== 'string' || !PREFIX_PATTERN.test(prefix)) {
    throw new TypeError('Temporary directory prefix must be 1-40 alphanumeric/hyphen characters.');
  }

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
  try {
    fs.chmodSync(directory, 0o700);
    const mode = fs.statSync(directory).mode & 0o777;
    if (mode !== 0o700) {
      throw new Error('Temporary directory permissions are not private (expected mode 0700).');
    }
    return directory;
  } catch (error) {
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
