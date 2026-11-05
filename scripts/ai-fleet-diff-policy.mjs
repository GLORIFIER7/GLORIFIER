const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 20,
  maxAdditions: 800,
  maxDeletions: 800,
  maxChangedLinesPerFile: 500,
});

const PROTECTED_PATHS = [
  /^\.github\//i,
  /(^|\/)\.env(?:\..*)?$/i,
  /(^|\/)(?:secrets?|credentials?)(?:\/|$)/i,
  /\.(?:pem|key|p12|pfx|jks|keystore)$/i,
  /(^|\/)(?:package\.json|package-lock\.json|npm-shrinkwrap\.json)$/i,
  /(^|\/)(?:wrangler\.toml|firebase\.json|SECURITY\.md|CODEOWNERS)$/i,
  /(^|\/)(?:contracts|migrations|infra|terraform)(?:\/|$)/i,
  /^src\/lib\/capability-authorization\.ts$/i,
  /^src\/lib\/(?:auth|governance|db)\//i,
  /^src\/(?:worker|worker\.test)\.ts$/i,
  /^server\.ts$/i,
  /^scripts\/(?:ai-fleet-diff-policy|validate-ai-fleet-diff)(?:\.test)?\.mjs$/i,
  /(^|\/)(?:Dockerfile|docker-compose\.ya?ml|\.npmrc|\.nvmrc|tsconfig(?:\.[^/]+)?\.json|vite\.config\.[^/]+)$/i,
];

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/,
];

function reject(reason, metrics = {}) {
  return { allowed: false, reason, ...metrics };
}

/**
 * Validate an AI-generated staged diff before granting the workflow permission
 * to push a branch and create a pull request.
 *
 * This is a change-scope safeguard, not a replacement for CI, code review,
 * branch protection, secret scanning, or human merge approval.
 */
export function validateAiFleetDiff({ files, diffText = '', limits = {} } = {}) {
  const effectiveLimits = { ...DEFAULT_LIMITS, ...limits };
  if (!Array.isArray(files) || files.length === 0) {
    return reject('empty_diff');
  }

  if (!Number.isSafeInteger(effectiveLimits.maxFiles) || effectiveLimits.maxFiles < 1
    || !Number.isSafeInteger(effectiveLimits.maxAdditions) || effectiveLimits.maxAdditions < 0
    || !Number.isSafeInteger(effectiveLimits.maxDeletions) || effectiveLimits.maxDeletions < 0
    || !Number.isSafeInteger(effectiveLimits.maxChangedLinesPerFile) || effectiveLimits.maxChangedLinesPerFile < 1) {
    return reject('invalid_limits');
  }

  if (files.length > effectiveLimits.maxFiles) {
    return reject('too_many_files', { fileCount: files.length });
  }

  let additions = 0;
  let deletions = 0;
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || !file.path.trim()) {
      return reject('invalid_file_path');
    }

    const path = file.path.replace(/\\/g, '/');
    const segments = path.split('/');
    if (path.startsWith('/') || /^[A-Za-z]:\//.test(path) || segments.includes('..') || segments.includes('')
      || /[\0-\x1f\x7f]/.test(file.path)) {
      return reject('unsafe_file_path', { path });
    }
    if (PROTECTED_PATHS.some((pattern) => pattern.test(path))) {
      return reject('protected_path_requires_human_change', { path });
    }
    if (file.binary === true || file.symlink === true) {
      return reject('binary_or_symlink_change_not_reviewable', { path });
    }

    const fileAdditions = file.additions;
    const fileDeletions = file.deletions;
    if (!Number.isSafeInteger(fileAdditions) || fileAdditions < 0
      || !Number.isSafeInteger(fileDeletions) || fileDeletions < 0) {
      return reject('invalid_diff_statistics', { path });
    }
    if (fileAdditions + fileDeletions > effectiveLimits.maxChangedLinesPerFile) {
      return reject('file_diff_too_large', { path, changedLines: fileAdditions + fileDeletions });
    }
    additions += fileAdditions;
    deletions += fileDeletions;
  }

  if (additions > effectiveLimits.maxAdditions) {
    return reject('too_many_additions', { additions, deletions, fileCount: files.length });
  }
  if (deletions > effectiveLimits.maxDeletions) {
    return reject('too_many_deletions', { additions, deletions, fileCount: files.length });
  }

  if (typeof diffText !== 'string') {
    return reject('invalid_diff_content');
  }
  const addedLines = diffText
    .split(/\\r?\\n/)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\\n');
  if (SECRET_PATTERNS.some((pattern) => pattern.test(addedLines))) {
    return reject('secret_like_material_detected', { additions, deletions, fileCount: files.length });
  }

  return {
    allowed: true,
    reason: 'reviewable_diff',
    additions,
    deletions,
    fileCount: files.length,
    limits: effectiveLimits,
  };
}
