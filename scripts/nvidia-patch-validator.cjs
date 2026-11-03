'use strict';

const fs = require('node:fs');

const MAX_PATCH_BYTES = 12_000;
const MAX_FILES = 2;
const MAX_CHANGED_LINES = 100;
const ALLOWED_PREFIXES = ['src/', 'docs/', 'scripts/', 'tests/'];
const DENIED_PATH_PARTS = [
  'src/lib/auth/', 'src/lib/ai/', 'src/lib/governance/', 'src/lib/glr-',
  'src/lib/blockchain/', 'src/lib/crypto/', 'solana/', 'ethereum/', 'contracts/',
  'deploy', 'payment', 'wallet', 'secret', '.env', 'package.json',
  'package-lock.json', '.github/', 'server.ts', 'wrangler', 'railway', 'dockerfile',
  'scripts/nvidia-patch-validator'
];

function isAllowedPath(path) {
  const normalized = path.replaceAll('\\', '/');
  return ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix)) &&
    !normalized.startsWith('/') &&
    !normalized.split('/').includes('..') &&
    !DENIED_PATH_PARTS.some((part) => normalized.toLowerCase().includes(part));
}

function countValidatedHunkChanges(lines, hunkStart, fileIndex) {
  let oldRemaining = 0;
  let newRemaining = 0;
  let hasHunk = false;
  let lastWasBodyLine = false;
  let changedLines = 0;

  for (let index = hunkStart; index < lines.length; index += 1) {
    const line = lines[index];

    // The normalized diff always ends with one newline. Do not permit other
    // empty lines outside a declared hunk.
    if (line === '' && index === lines.length - 1) break;

    if (line.startsWith('@@')) {
      if (hasHunk && (oldRemaining !== 0 || newRemaining !== 0)) {
        throw new Error('Patch file ' + fileIndex + ' has a hunk that ended before its declared line counts.');
      }
      const header = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/);
      if (!header) throw new Error('Patch file ' + fileIndex + ' has an invalid unified-diff hunk header.');
      oldRemaining = Number(header[2] === undefined ? 1 : header[2]);
      newRemaining = Number(header[4] === undefined ? 1 : header[4]);
      if (!Number.isSafeInteger(oldRemaining) || !Number.isSafeInteger(newRemaining) ||
          oldRemaining < 0 || newRemaining < 0 || (oldRemaining === 0 && newRemaining === 0)) {
        throw new Error('Patch file ' + fileIndex + ' has invalid unified-diff hunk line counts.');
      }
      hasHunk = true;
      lastWasBodyLine = false;
      continue;
    }

    if (!hasHunk) {
      throw new Error('Patch file ' + fileIndex + ' contains content outside a unified-diff hunk.');
    }

    if (line === '\\ No newline at end of file') {
      if (!lastWasBodyLine) {
        throw new Error('Patch file ' + fileIndex + ' has a misplaced no-newline marker.');
      }
      lastWasBodyLine = false;
      continue;
    }

    if (oldRemaining === 0 && newRemaining === 0) {
      throw new Error('Patch file ' + fileIndex + ' contains unexpected content after a completed hunk.');
    }

    if (line.startsWith(' ')) {
      if (oldRemaining === 0 || newRemaining === 0) {
        throw new Error('Patch file ' + fileIndex + ' exceeds its declared unified-diff context count.');
      }
      oldRemaining -= 1;
      newRemaining -= 1;
    } else if (line.startsWith('-')) {
      if (oldRemaining === 0) {
        throw new Error('Patch file ' + fileIndex + ' exceeds its declared unified-diff removal count.');
      }
      oldRemaining -= 1;
      changedLines += 1;
    } else if (line.startsWith('+')) {
      if (newRemaining === 0) {
        throw new Error('Patch file ' + fileIndex + ' exceeds its declared unified-diff addition count.');
      }
      newRemaining -= 1;
      changedLines += 1;
    } else {
      throw new Error('Patch file ' + fileIndex + ' contains an invalid line outside a unified-diff hunk.');
    }
    lastWasBodyLine = true;
  }

  if (!hasHunk) throw new Error('Patch file ' + fileIndex + ' has no unified-diff hunk.');
  if (oldRemaining !== 0 || newRemaining !== 0) {
    throw new Error('Patch file ' + fileIndex + ' ended before its declared unified-diff hunk line counts.');
  }
  return changedLines;
}

function parseExistingFilePathPair(block, fileIndex) {
  const lines = block.split(/\r?\n/);
  const gitHeader = lines[0].match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (!gitHeader) throw new Error('Patch file ' + fileIndex + ' has an invalid diff header.');
  const gitOldPath = gitHeader[1].replace(/\r$/, '');
  const gitNewPath = gitHeader[2].replace(/\r$/, '');
  if (gitOldPath !== gitNewPath) throw new Error('Patch path mismatch: renames are not allowed.');

  const hunkStart = lines.findIndex((line) => line.startsWith('@@'));
  if (hunkStart < 0) throw new Error('Patch file ' + fileIndex + ' has no unified-diff hunk.');
  const preHunkLines = lines.slice(1, hunkStart);
  const oldHeaders = preHunkLines.filter((line) => line.startsWith('--- '));
  const newHeaders = preHunkLines.filter((line) => line.startsWith('+++ '));
  if (oldHeaders.length !== 1 || newHeaders.length !== 1) {
    throw new Error('Patch file ' + fileIndex + ' must contain exactly one old/new file-header pair before its hunks.');
  }

  const oldRaw = oldHeaders[0].slice(4).replace(/\r$/, '').split('\t', 1)[0];
  const newRaw = newHeaders[0].slice(4).replace(/\r$/, '').split('\t', 1)[0];
  if (oldRaw === '/dev/null' || newRaw === '/dev/null') {
    throw new Error('Patch is creating or deleting files; only existing files may be edited.');
  }
  if (!oldRaw.startsWith('a/') || !newRaw.startsWith('b/')) {
    throw new Error('Patch file headers must use a/ and b/ paths for existing files.');
  }
  const oldPath = oldRaw.slice(2);
  const newPath = newRaw.slice(2);
  if (oldPath !== newPath || oldPath !== gitOldPath) {
    throw new Error('Patch path mismatch between git and unified-diff headers.');
  }
  if (!isAllowedPath(oldPath)) throw new Error('Patch path is not allowed: ' + oldPath);
  const changedLines = countValidatedHunkChanges(lines, hunkStart, fileIndex);
  return { path: oldPath, changedLines };
}

function validatePatchResponse(output) {
  if (typeof output !== 'string' || !output.trim()) {
    throw new Error('NVIDIA response content is empty or not text.');
  }
  if (output.trim() === 'NO_PATCH') return { kind: 'no_patch' };

  const envelope = output.match(/^\s*BEGIN_PATCH[ \t]*\r?\n([\s\S]*?)\r?\nEND_PATCH[ \t]*\s*$/);
  if (!envelope) {
    throw new Error('Patch response must contain only a complete BEGIN_PATCH and END_PATCH envelope; surrounding content is not allowed.');
  }
  const patch = envelope[1].trim() + '\n';
  const byteLength = Buffer.byteLength(patch, 'utf8');
  if (byteLength > MAX_PATCH_BYTES) {
    throw new Error('Patch exceeds byte limit (' + byteLength + ' > ' + MAX_PATCH_BYTES + '). Request a smaller patch.');
  }

  const lines = patch.split(/\r?\n/);
  const starts = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith('diff --git ')) starts.push(i);
  }
  if (starts.length === 0) throw new Error('Patch contains no unified-diff file headers.');
  if (starts[0] !== 0) throw new Error('Patch contains unexpected content before the first file header.');
  if (starts.length > MAX_FILES) {
    throw new Error('Patch exceeds file limit (' + starts.length + ' > ' + MAX_FILES + '). Request fewer files.');
  }

  const parsedFiles = [];
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1] : lines.length;
    parsedFiles.push(parseExistingFilePathPair(lines.slice(start, end).join('\n'), i + 1));
  }
  const changedLines = parsedFiles.reduce((total, file) => total + file.changedLines, 0);
  if (changedLines > MAX_CHANGED_LINES) {
    throw new Error('Patch exceeds changed-line limit (' + changedLines + ' > ' + MAX_CHANGED_LINES + '). Request fewer edits.');
  }

  if (/^(deleted file mode|new file mode|rename from|rename to|copy from|copy to)/m.test(patch)) {
    throw new Error('Patch is creating, deleting, copying, or renaming files.');
  }
  return { kind: 'patch', patch };
}

function main() {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error('Usage: node scripts/nvidia-patch-validator.cjs <response.json> <patch.diff>');
  }
  let content;
  try {
    const response = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    content = response && response.choices && response.choices[0] &&
      response.choices[0].message && response.choices[0].message.content;
  } catch {
    throw new Error('NVIDIA response JSON is malformed. No patch was applied.');
  }
  const result = validatePatchResponse(content);
  fs.writeFileSync(outputPath, result.kind === 'patch' ? result.patch : '', 'utf8');
  if (result.kind === 'no_patch') process.stdout.write('No supported safe patch; no PR will be created.\n');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write('Patch rejected: ' + error.message + '\n');
    process.exitCode = 1;
  }
}

module.exports = { validatePatchResponse };
