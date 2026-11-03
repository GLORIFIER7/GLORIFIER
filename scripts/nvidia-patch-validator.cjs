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
  const changedLines = lines.slice(hunkStart + 1).filter((line) =>
    line.startsWith('+') || line.startsWith('-')
  ).length;
  return { path: oldPath, changedLines };
}

function validatePatchResponse(output) {
  if (typeof output !== 'string' || !output.trim()) {
    throw new Error('NVIDIA response content is empty or not text.');
  }
  if (output.trim() === 'NO_PATCH') return { kind: 'no_patch' };

  const envelope = output.match(/BEGIN_PATCH\s*\n([\s\S]*?)\nEND_PATCH/);
  if (!envelope) throw new Error('Patch response must contain BEGIN_PATCH and END_PATCH markers.');
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
