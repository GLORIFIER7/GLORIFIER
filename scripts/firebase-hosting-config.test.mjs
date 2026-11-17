import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fixturePaths = {
  firebaseConfig: { path: '../firebase-applet-config.json', json: true },
  firebaseRc: { path: '../.firebaserc', json: true },
  hosting: { path: '../firebase.json', json: true },
  firestoreRules: { path: '../firestore.rules', json: false },
  collaborationModal: { path: '../src/components/AllAiCollaborationModal.tsx', json: false },
  indexHtml: { path: '../index.html', json: false },
  startupWatchdog: { path: '../public/startup-watchdog.js', json: false },
  bootCss: { path: '../public/boot.css', json: false },
  wrangler: { path: '../wrangler.jsonc', json: true },
};

const loadFixture = async (name, { path, json }) => {
  try {
    const contents = await readFile(new URL(path, import.meta.url), 'utf8');
    return { ok: true, value: json ? JSON.parse(contents) : contents };
  } catch (error) {
    return { ok: false, error };
  }
};

const fixtureResults = Object.fromEntries(await Promise.all(
  Object.entries(fixturePaths).map(async ([name, fixtureSpec]) => [
    name,
    await loadFixture(name, fixtureSpec),
  ]),
));

const extractNamedMatchBlock = (source, escapedPath) => {
  const match = new RegExp(`match ${escapedPath}\\s*\\{`).exec(source);
  if (!match) return null;
  const openingBrace = match.index + match[0].lastIndexOf('{');
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(match.index, index + 1);
    }
  }
  return null;
};

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
  const csp = values['Content-Security-Policy'] || '';
  const directives = Object.fromEntries(csp.split(';').map((directive) => {
    const [name, ...sources] = directive.trim().split(/\\s+/);
    return [name, sources.join(' ')];
  }));
  assert.equal(directives['default-src'], "'self'");
  assert.equal(directives['base-uri'], "'self'");
  assert.equal(directives['object-src'], "'none'");
  assert.equal(directives['frame-ancestors'], "'none'");
  assert.equal(directives['script-src'], "'self' https://www.gstatic.com https://apis.google.com");
  assert.equal(directives['style-src'], "'self' https://fonts.googleapis.com");
  assert.equal(directives['font-src'], "'self' https://fonts.gstatic.com data:");
  assert.equal(directives['img-src'], "'self' data: blob: https:");
  assert.match(directives['connect-src'], /https:\\/\\/\\*\\.auth0\\.com/);
  assert.match(directives['frame-src'], /https:\\/\\/\\*\\.auth0\\.com/);
  assert.equal(directives['form-action'], "'self' https://accounts.google.com");
  assert.doesNotMatch(csp, /unsafe-inline/);
  const indexHeaders = hosting.hosting.headers.find((entry) => entry.source === '/index.html');
  assert.deepEqual(indexHeaders?.headers, [{ key: 'Cache-Control', value: 'no-cache' }]);
});

test('Firebase CLI deploys the repository-owned Firestore rules with owner checks in the user match', () => {
  const hosting = fixture('hosting');
  const firestoreRules = fixture('firestoreRules');
  assert.equal(hosting.firestore.rules, 'firestore.rules');
  assert.match(firestoreRules, /allow read, write: if false;/);
  const userMatch = extractNamedMatchBlock(firestoreRules, '\\/users\\/\\{userId\\}');
  assert.ok(userMatch, 'a /users/{userId} rules block must exist');
  assert.match(userMatch, /allow read: if isOwner\(userId\);/);
  assert.match(userMatch, /allow create, update: if isOwner\(userId\) && isValidId\(userId\);/);
});

test('Cloudflare Worker Firebase verification targets the registered project and requires its API key as a secret', () => {
  const firebaseConfig = fixture('firebaseConfig');
  const wrangler = fixture('wrangler');
  assert.equal(wrangler.vars.FIREBASE_PROJECT_ID, firebaseConfig.projectId);
  assert.equal(wrangler.previews.vars.FIREBASE_PROJECT_ID, firebaseConfig.projectId);
  assert.equal(wrangler.vars.FIREBASE_WEB_API_KEY, undefined,
    'the Worker Web API key must not be committed as a plain-text Wrangler variable');
  assert.equal(wrangler.previews.vars.FIREBASE_WEB_API_KEY, undefined,
    'preview must not duplicate the Worker Web API key as a plain-text variable');
  assert.ok(wrangler.secrets.required.includes('FIREBASE_WEB_API_KEY'),
    'the Worker Web API key must be configured as a Wrangler secret');
});

test('the Hosting CSP does not require unsafe-inline for the app progress indicator', () => {
  assert.doesNotMatch(fixture('collaborationModal'), /style=\{\{/);
});

test('startup watchdog is loaded as a same-origin asset with no inline scripts or styles', () => {
  const indexHtml = fixture('indexHtml');
  const startupWatchdog = fixture('startupWatchdog');
  const bootCss = fixture('bootCss');
  assert.match(indexHtml, /<script[^>]+src="[/]startup-watchdog[.]js"[^>]+defer[^>]*><[/]script>/);
  assert.match(indexHtml, /<link[^>]+href="[/]boot[.]css"[^>]*>/);
  assert.doesNotMatch(indexHtml, /<script\b(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(indexHtml, /\sstyle=/i);
  assert.match(startupWatchdog, /unhandledrejection/);
  assert.match(startupWatchdog, /setTimeout/);
  assert.match(bootCss, /boot-status/);
});
