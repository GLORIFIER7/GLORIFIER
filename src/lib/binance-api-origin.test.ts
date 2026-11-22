import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveBinanceReadOnlyApiOrigin } from './binance-api-origin.ts';

test('uses Binance primary API with no override', () => {
  assert.equal(resolveBinanceReadOnlyApiOrigin(undefined), 'https://api.binance.com');
});

test('accepts explicitly allowlisted Binance API origins', () => {
  for (const origin of ['https://api.binance.com', 'https://api-gcp.binance.com', 'https://api1.binance.com', 'https://api4.binance.com']) {
    assert.equal(resolveBinanceReadOnlyApiOrigin(origin + '/'), origin);
  }
});

test('rejects credential egress to unsafe or misleading origins', () => {
  for (const raw of [
    'http://api.binance.com',
    'https://api.binance.com.attacker.test',
    'https://evil.test',
    'https://api.binance.com@evil.test',
    'https://username:password@api.binance.com',
    'https://api.binance.com:8443',
    'https://api.binance.com/open',
    'https://api.binance.com?next=https://evil.test',
    'https://api.binance.com/#fragment',
    'https://api.binance.com\\@evil.test',
    'not a URL',
  ]) {
    assert.throws(() => resolveBinanceReadOnlyApiOrigin(raw), /Binance API origin must be a permitted HTTPS root origin/, raw);
  }
});
