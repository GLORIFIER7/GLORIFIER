/** Shared throw-on-false assertion for standalone GLORIFIER regression scripts. */
export function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
