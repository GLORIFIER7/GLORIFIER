import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [firebaseConfig, firebaseRc, hosting, firestoreRules] = await Promise.all([
  readFile(new URL('../firebase-applet-config.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../.firebaserc', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../firebase.json', import.meta.url), 'utf8').then(JSON.parse),
  readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
]);

test('Firebase SDK config targets the requested registered web app', () => {
  assert.equal(firebaseConfig.projectId, 'merchant-center-1660617751955');
  assert.equal(firebaseConfig.appId, '1:88534161155:web:860517ba43cca6b200bb36');
  assert.equal(firebaseConfig.authDomain, 'merchant-center-1660617751955.firebaseapp.com');
  assert.equal(firebaseConfig.firestoreDatabaseId, '(default)');
});

test('Firebase CLI defaults to the requested project', () => {
  assert.equal(firebaseRc.projects.default, firebaseConfig.projectId);
});

test('Hosting publishes the Vite build output without masking unconfigured API paths', () => {
  assert.equal(hosting.hosting.public, 'dist');
  assert.equal(hosting.hosting.rewrites, undefined);
  assert.ok(hosting.hosting.headers.some((entry) => entry.source === '/index.html'));
});

test('Firebase CLI deploys the repository-owned Firestore rules', () => {
  assert.equal(hosting.firestore.rules, 'firestore.rules');
  assert.match(firestoreRules, /allow read, write: if false;/);
  assert.match(firestoreRules, /request\.auth\.uid == userId/);
  assert.match(firestoreRules, /match \/users\/\{userId\}/);
});
