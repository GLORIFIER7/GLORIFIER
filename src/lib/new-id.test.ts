import { newId } from './new-id';
import assert from 'node:assert/strict';
import test from 'node:test';

test("Shared identifier helper regression cases", () => {
  function expectThrows(action: () => unknown, expectedMessage: string): void {
    let thrown: unknown;
    try {
      action();
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof Error && thrown.message === expectedMessage, expectedMessage);
  }
  
  function assertCryptoUnavailable(cryptoValue: unknown): void {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    try {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        enumerable: originalDescriptor?.enumerable ?? false,
        writable: true,
        value: cryptoValue,
      });
      expectThrows(
        () => newId('test'),
        'A cryptographically secure UUID generator is not available in this runtime',
      );
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'crypto', originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'crypto');
      }
    }
  }
  
  const ids = new Set<string>();
  for (let index = 0; index < 10_000; index += 1) {
    const id = newId('test-prefix');
    assert.ok(id.startsWith('test-prefix-'), 'ID must retain its normalized prefix');
    assert.ok(!ids.has(id), 'ID collision detected across rapid calls');
    ids.add(id);
  }
  
  assert.ok(newId('  Team @@@ Member  ').startsWith('Team-Member-'), 'Invalid character runs must normalize to one hyphen');
  assert.ok(newId('feature--one').startsWith('feature--one-'), 'Existing allowed hyphens must be preserved');
  assert.ok(newId('__underscore__').startsWith('__underscore__-'), 'Allowed underscores must be preserved');
  assert.ok(newId('!feature!').startsWith('feature-'), 'Leading and trailing replacement hyphens must be trimmed');
  
  expectThrows(
    () => newId('---'),
    'ID prefix must contain at least one alphanumeric character',
  );
  expectThrows(
    () => newId('!!!'),
    'ID prefix must contain at least one alphanumeric character',
  );
  
  assertCryptoUnavailable(undefined);
  assertCryptoUnavailable({});
  
  console.log('Shared ID helper tests passed.');
});
