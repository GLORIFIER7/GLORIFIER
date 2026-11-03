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
  'package-lock.json', '.github/', 'server.ts', 'wrangler', 'railway', 'dockerfile'
];

function isAllowedPath(path) {
  const normalized = path.replaceAll('\\', '/');
  return ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix)) &&
    !normalized.startsWith('/') &&
    !normalized.split('/').includes('..') &&
    !DENIED_PATH_PARTS.some((part) => normalized.toLowerCase().includes(part));
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

  const gitHeaders = [...patch.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)];
  if (gitHeaders.length === 0) throw new Error('Patch contains no unified-diff file headers.');
  if (gitHeaders.length > MAX_FILES) {
    throw new Error('Patch exceeds file limit (' + gitHeaders.length + ' > ' + MAX_FILES + '). Request fewer files.');
  }

  const changedLines = patch.split(/\r?\n/).filter((line) =>
    (line.startsWith('+') || line.startsWith('-')) &&
    !line.startsWith('+++') && !line.startsWith('---')
  ).length;
  if (changedLines > MAX_CHANGED_LINES) {
    throw new Error('Patch exceeds changed-line limit (' + changedLines + ' > ' + MAX_CHANGED_LINES + '). Request fewer edits.');
  }

  const parsedGitPaths = [];
  for (const [, oldPath, newPath] of gitHeaders) {
    if (oldPath !== newPath) throw new Error('Patch path mismatch: renames are not allowed.');
    if (!isAllowedPath(oldPath)) throw new Error('Patch path is not allowed: ' + oldPath);
    parsedGitPaths.push(oldPath);
  }

  const fileHeaders = [...patch.matchAll(/^(---|\+\+\+) (.+)$/gm)];
  if (fileHeaders.length !== gitHeaders.length * 2) {
    throw new Error('Patch has missing or extra unified-diff file headers.');
  }
  const pairs = [];
  for (let i = 0; i < fileHeaders.length; i += 2) {
    const oldRaw = fileHeaders[i][2].split('\t', 1)[0];
    const newRaw = fileHeaders[i + 1][2].split('\t', 1)[0];
    if (fileHeaders[i][1] !== '---' || fileHeaders[i + 1][1] !== '+++') {
      throw new Error('Patch unified-diff file headers are out of order.');
    }
    if (oldRaw === '/dev/null' || newRaw === '/dev/null') {
      throw new Error('Patch is creating or deleting files; only existing files may be edited.');
    }
    if (!oldRaw.startsWith('a/') || !newRaw.startsWith('b/')) {
      throw new Error('Patch file headers must use a/ and b/ paths for existing files.');
    }
    const oldPath = oldRaw.slice(2);
    const newPath = newRaw.slice(2);
    if (oldPath !== newPath) throw new Error('Patch path mismatch in unified-diff headers.');
    if (!isAllowedPath(oldPath)) throw new Error('Patch file header path is not allowed: ' + oldPath);
    pairs.push(oldPath);
  }
  if (pairs.some((path, index) => path !== parsedGitPaths[index])) {
    throw new Error('Patch git headers and unified-diff path headers do not match.');
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
