import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixturePaths = {
  firebaseConfig: '../firebase-applet-config.json',
  firebaseRc: '../.firebaserc',
  hosting: '../firebase.json',
  firestoreRules: '../firestore.rules',
  wrangler: '../wrangler.jsonc',
};

const loadFixture = async (name, relativePath, parseJson = false) => {
  try {
    const contents = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    return { ok: true, value: parseJson ? JSON.parse(contents) : contents };
  } catch (error) {
    return { ok: false, error };
  }
};

const fixtureResults = Object.fromEntries(await Promise.all(
  Object.entries(fixturePaths).map(async ([name, relativePath]) => [
    name,
    await loadFixture(name, relativePath, relativePath.endsWith('.json') || relativePath.endsWith('.jsonc')),
  ]),
));

const fixture = (name) => {
  const result = fixtureResults[name];
  assert.ok(
    result?.ok,
    `Unable to load required Firebase fixture "${name}": ${result?.error?.message || 'fixture result missing'}`,
  );
  return result.value;
};

test('Firebase SDK config targets the requested registered web app', () => {
  const firebaseConfig = fixture('firebaseConfig');
  assert.equal(firebaseConfig.projectId, 'merchant-center-1660617751955');
  assert.equal(firebaseConfig.appId, '1:88534161155:web:860517ba43cca6b200bb36');
  assert.equal(firebaseConfig.authDomain, 'merchant-center-1660617751955.firebaseapp.com');
  assert.equal(firebaseConfig.firestoreDatabaseId, '(default)');
});

test('Firebase CLI defaults to the requested project', () => {
  const firebaseConfig = fixture('firebaseConfig');
  const firebaseRc = fixture('firebaseRc');
  assert.equal(firebaseRc.projects.default, firebaseConfig.projectId);
});

test('Hosting publishes only the Vite build output and does not mask unconfigured API paths', () => {
  const hosting = fixture('hosting');
  assert.equal(hosting.hosting.public, 'dist');
  assert.equal(hosting.hosting.rewrites, undefined);
  assert.ok(hosting.hosting.ignore.includes('server.cjs'));
  assert.ok(hosting.hosting.ignore.includes('server.cjs.map'));
});

test('Hosting publishes clickjacking, content-loading, and cache-control protections', () => {
  const hosting = fixture('hosting');
  const globalHeaders = hosting.hosting.headers.find((entry) => entry.source === '**');
  const values = Object.fromEntries((globalHeaders?.headers || []).map(({ key, value }) => [key, value]));
  assert.equal(values['X-Content-Type-Options'], 'nosniff');
  assert.equal(values['X-Frame-Options'], 'DENY');
  assert.equal(values['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(values['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()');
  assert.match(values['Content-Security-Policy'] || '', /default-src 'self'/);
  assert.match(values['Content-Security-Policy'] || '', /object-src 'none'/);
  assert.match(values['Content-Security-Policy'] || '', /frame-ancestors 'none'/);
  const indexHeaders = hosting.hosting.headers.find((entry) => entry.source === '/index.html');
  assert.deepEqual(indexHeaders?.headers, [{ key: 'Cache-Control', value: 'no-cache' }]);
});

test('Firebase CLI deploys the repository-owned Firestore rules with owner checks in the user match', () => {
  const hosting = fixture('hosting');
  const firestoreRules = fixture('firestoreRules');
  assert.equal(hosting.firestore.rules, 'firestore.rules');
  assert.match(firestoreRules, /allow read, write: if false;/);
  const userMatch = firestoreRules.match(/match \/users\/\{userId\}\s*\{([\s\S]*?)\n    \}/);
  assert.ok(userMatch, 'a /users/{userId} rules block must exist');
  assert.match(userMatch[1], /allow read: if isOwner\(userId\);/);
  assert.match(userMatch[1], /allow create, update: if isOwner\(userId\) && isValidId\(userId\);/);
});

test('Cloudflare Worker Firebase verification targets the same project and web key as the registered browser app', () => {
  const firebaseConfig = fixture('firebaseConfig');
  const wrangler = fixture('wrangler');
  assert.equal(wrangler.vars.FIREBASE_PROJECT_ID, firebaseConfig.projectId);
  assert.equal(wrangler.vars.FIREBASE_WEB_API_KEY, firebaseConfig.apiKey);
  assert.equal(wrangler.previews.vars.FIREBASE_PROJECT_ID, firebaseConfig.projectId);
  assert.equal(wrangler.previews.vars.FIREBASE_WEB_API_KEY, firebaseConfig.apiKey);
});
