/**
 * Apply a validated unified diff without writing it to a temporary file.
 * The git process receives the diff over stdin.
 */
export function applyUnifiedDiff(patch, execute) {
  if (typeof patch !== 'string' || !patch.startsWith('diff --git ')) {
    throw new TypeError('Expected a non-empty unified diff starting with a diff --git header.');
  }
  if (typeof execute !== 'function') {
    throw new TypeError('A git executor function is required.');
  }
  return execute('git', ['apply', '--whitespace=fix', '--recount'], { input: patch });
}
