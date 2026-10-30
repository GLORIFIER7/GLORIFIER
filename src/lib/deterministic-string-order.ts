/**
 * Locale-independent total order for stable canonicalization and identifiers.
 * Uses UTF-16 code-unit order to preserve the repository's existing hashes.
 */
export function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
