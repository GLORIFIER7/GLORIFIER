'use strict';

const fs = require('node:fs');

const MAX_PATCH_BYTES = 12_000;
const MAX_PATCH_RESPONSE_BYTES = MAX_PATCH_BYTES + 256;
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

const NO_NEWLINE_MARKER = String.raw`\ No newline at end of file`;

function parseUnifiedDiffHunkHeader(line, fileIndex) {
  const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(line);
  if (!header) {
    throw new Error('Patch file ' + fileIndex + ' has an invalid unified-diff hunk header.');
  }

  const oldRemaining = Number(header[2] === undefined ? 1 : header[2]);
  const newRemaining = Number(header[4] === undefined ? 1 : header[4]);
  if (!Number.isSafeInteger(oldRemaining) || !Number.isSafeInteger(newRemaining) ||
      oldRemaining < 0 || newRemaining < 0 || (oldRemaining === 0 && newRemaining === 0)) {
    throw new Error('Patch file ' + fileIndex + ' has invalid unified-diff hunk line counts.');
  }
  return { oldRemaining, newRemaining };
}

function assertCurrentHunkComplete(state, fileIndex) {
  if (state.oldRemaining !== 0 || state.newRemaining !== 0) {
    throw new Error('Patch file ' + fileIndex + ' has a hunk that ended before its declared line counts.');
  }
}

function openUnifiedDiffHunk(line, state, fileIndex) {
  assertCurrentHunkComplete(state, fileIndex);
  const range = parseUnifiedDiffHunkHeader(line, fileIndex);
  state.oldRemaining = range.oldRemaining;
  state.newRemaining = range.newRemaining;
  state.hasHunk = true;
  state.lastWasBodyLine = false;
}

function consumeContextLine(state, fileIndex) {
  if (state.oldRemaining === 0 || state.newRemaining === 0) {
    throw new Error('Patch file ' + fileIndex + ' exceeds its declared unified-diff context count.');
  }
  state.oldRemaining -= 1;
  state.newRemaining -= 1;
}

function consumeRemovalLine(state, fileIndex) {
  if (state.oldRemaining === 0) {
    throw new Error('Patch file ' + fileIndex + ' exceeds its declared unified-diff removal count.');
  }
  state.oldRemaining -= 1;
  state.changedLines += 1;
}

function consumeAdditionLine(state, fileIndex) {
  if (state.newRemaining === 0) {
    throw new Error('Patch file ' + fileIndex + ' exceeds its declared unified-diff addition count.');
  }
  state.newRemaining -= 1;
  state.changedLines += 1;
}

function consumeHunkBodyLine(line, state, fileIndex) {
  if (line.startsWith(' ') || (line === '' && state.oldRemaining > 0 && state.newRemaining > 0)) {
    consumeContextLine(state, fileIndex);
  } else if (line.startsWith('-')) {
    consumeRemovalLine(state, fileIndex);
  } else if (line.startsWith('+')) {
    consumeAdditionLine(state, fileIndex);
  } else {
    throw new Error('Patch file ' + fileIndex + ' contains an invalid line outside a unified-diff hunk.');
  }
  state.lastWasBodyLine = true;
}

function processUnifiedDiffHunkLine(line, state, fileIndex) {
  if (line.startsWith('@@')) {
    openUnifiedDiffHunk(line, state, fileIndex);
    return;
  }
  if (!state.hasHunk) {
    throw new Error('Patch file ' + fileIndex + ' contains content outside a unified-diff hunk.');
  }
  if (line === NO_NEWLINE_MARKER) {
    if (!state.lastWasBodyLine) {
      throw new Error('Patch file ' + fileIndex + ' has a misplaced no-newline marker.');
    }
    state.lastWasBodyLine = false;
    return;
  }
  if (state.oldRemaining === 0 && state.newRemaining === 0) {
    throw new Error('Patch file ' + fileIndex + ' contains unexpected content after a completed hunk.');
  }
  consumeHunkBodyLine(line, state, fileIndex);
}

function countValidatedHunkChanges(lines, hunkStart, fileIndex) {
  const state = {
    oldRemaining: 0,
    newRemaining: 0,
    hasHunk: false,
    lastWasBodyLine: false,
    changedLines: 0,
  };

  for (let index = hunkStart; index < lines.length; index += 1) {
    const line = lines[index];
    // The normalized diff always ends with one newline.
    if (line === '' && index === lines.length - 1) break;
    processUnifiedDiffHunkLine(line, state, fileIndex);
  }

  if (!state.hasHunk) throw new Error('Patch file ' + fileIndex + ' has no unified-diff hunk.');
  if (state.oldRemaining !== 0 || state.newRemaining !== 0) {
    throw new Error('Patch file ' + fileIndex + ' ended before its declared unified-diff hunk line counts.');
  }
  return state.changedLines;
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

function hasOnlyMarkerWhitespace(line, marker) {
  return line.startsWith(marker) && /^[ \t]*$/.test(line.slice(marker.length));
}

function extractPatchEnvelope(output) {
  if (typeof output !== 'string') {
    throw new Error('NVIDIA response content is empty or not text.');
  }

  const responseByteLength = Buffer.byteLength(output, 'utf8');
  if (responseByteLength > MAX_PATCH_RESPONSE_BYTES) {
    throw new Error('Patch response exceeds response byte limit (' + responseByteLength +
      ' > ' + MAX_PATCH_RESPONSE_BYTES + ').');
  }

  const trimmed = output.trim();
  if (!trimmed) throw new Error('NVIDIA response content is empty or not text.');
  if (trimmed === 'NO_PATCH') return { kind: 'no_patch' };

  const openingLineEnd = trimmed.indexOf('\n');
  const closingLineStart = trimmed.lastIndexOf('\n');
  if (openingLineEnd < 0 || closingLineStart <= openingLineEnd) {
    throw new Error('Patch response must contain only a complete BEGIN_PATCH and END_PATCH envelope; surrounding content is not allowed.');
  }

  const openingLine = trimmed.slice(0, openingLineEnd).replace(/\r$/, '');
  const closingLine = trimmed.slice(closingLineStart + 1).replace(/\r$/, '');
  if (!hasOnlyMarkerWhitespace(openingLine, 'BEGIN_PATCH') ||
      !hasOnlyMarkerWhitespace(closingLine, 'END_PATCH')) {
    throw new Error('Patch response must contain only a complete BEGIN_PATCH and END_PATCH envelope; surrounding content is not allowed.');
  }

  let patchBody = trimmed.slice(openingLineEnd + 1, closingLineStart);
  if (patchBody.endsWith('\r')) patchBody = patchBody.slice(0, -1);
  const patch = patchBody + '\n';
  const byteLength = Buffer.byteLength(patch, 'utf8');
  if (byteLength > MAX_PATCH_BYTES) {
    throw new Error('Patch exceeds byte limit (' + byteLength + ' > ' + MAX_PATCH_BYTES + '). Request a smaller patch.');
  }
  return { kind: 'patch', patch };
}

function validatePatchResponse(output) {
  const envelope = extractPatchEnvelope(output);
  if (envelope.kind === 'no_patch') return envelope;
  const { patch } = envelope;

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
    content = response?.choices?.[0]?.message?.content;
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
