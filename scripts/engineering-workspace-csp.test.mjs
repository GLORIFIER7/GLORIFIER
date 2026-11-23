import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const requiredOrigin = 'https://api.github.com';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const connectOrigins = (csp) => {
  const directive = csp.split(';').map(x => x.trim()).find(x => x.startsWith('connect-src '));
  return directive ? directive.split(/\s+/).slice(1) : [];
};

test('Cloudflare Pages permits only the explicitly needed public GitHub API origin', () => {
  const headers = read('public/_headers');
  const match = headers.match(/^\s*Content-Security-Policy:\s*(.+)$/m);
  assert.ok(match, 'Cloudflare Pages CSP header should exist');
  assert.ok(connectOrigins(match[1]).includes(requiredOrigin), 'Cloudflare CSP blocks public repository observations');
});

test('Vercel permits the explicitly needed public GitHub API origin', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const policies = vercel.headers.flatMap(x => x.headers || [])
    .filter(x => x.key.toLowerCase() === 'content-security-policy')
    .map(x => x.value);
  assert.ok(policies.length > 0, 'Vercel CSP header should exist');
  assert.ok(policies.every(x => connectOrigins(x).includes(requiredOrigin)),
    'Vercel CSP blocks public repository observations');
});

test('Firebase permits the explicitly needed public GitHub API origin', () => {
  const firebase = JSON.parse(read('firebase.json'));
  const policies = firebase.hosting.headers.flatMap(x => x.headers || [])
    .filter(x => x.key.toLowerCase() === 'content-security-policy')
    .map(x => x.value);
  assert.ok(policies.length > 0, 'Firebase CSP header should exist');
  assert.ok(policies.every(x => connectOrigins(x).includes(requiredOrigin)),
    'Firebase CSP blocks public repository observations');
});
