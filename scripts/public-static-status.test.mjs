import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const manifest = JSON.parse(read('../public/manifest.webmanifest'));
const serviceWorker = read('../public/sw.js');
const sitemap = read('../public/sitemap.xml');
const projectPage = read('../public/project.html');

test('public production entry is a single static evidence page', () => {
  assert.match(html, /GLORIFIER — Public Status/);
  assert.match(html, /PUBLIC EVIDENCE SNAPSHOT/);
  assert.match(html, /5e0078ff2202f79eebd4b5127ae283c2d9c6f834/);
  assert.match(html, /394b99f66cf5f6380fee801fc203559252c9a8d1/);
  assert.match(html, /17 commits ahead/);
  assert.match(html, /AI inference/i);
  assert.match(html, /not verified/i);
  assert.match(html, /does not make API requests/i);
  assert.doesNotMatch(html, /<script\b/i, 'static entry must not load application JavaScript');
  assert.doesNotMatch(html, /id=["']root["']/i, 'static entry must not mount the former React application');
  assert.doesNotMatch(html, /Starting the application|Gemini template|Autonomous AI Enterprise/i);
});

test('public entry cannot initiate API, authentication, embedded, or form interactions', () => {
  assert.doesNotMatch(
    html,
    /<(?:form|input|button|select|textarea|iframe|object|embed)\b/i,
    'static entry must not contain form controls or embedded active content'
  );
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'static entry must not contain inline event handlers');
  assert.doesNotMatch(html, /\s(?:action|formaction)\s*=/i, 'static entry must not submit forms');
  assert.doesNotMatch(html, /javascript\s*:/i, 'static entry must not contain executable links');
  assert.doesNotMatch(html, /<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i, 'static entry must not auto-redirect');
  assert.doesNotMatch(
    html,
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(?/i,
    'static entry must not contain request-capable JavaScript APIs'
  );
  assert.doesNotMatch(
    html,
    /(?:^|[\s"'=])\/(?:api|auth)(?:[\/?#"'\s]|$)/im,
    'static entry must not link to backend API or authentication routes'
  );
});

test('installed-app metadata describes only the public status page', () => {
  assert.equal(manifest.name, 'GLORIFIER — Public Status');
  assert.match(manifest.description, /static public status page/i);
  assert.doesNotMatch(manifest.name + ' ' + manifest.description, /autonomous AI enterprise|AI-first/i);
});

test('service-worker activation actually deletes retired dashboard caches', async () => {
  const listeners = new Map();
  const deleted = [];
  let claimed = false;
  const cachesMock = {
    async keys() {
      return ['glorifier-static-status-v3', 'glorifier-shell-v2', 'glorifier-ai-v1', 'unrelated-cache'];
    },
    async delete(key) {
      deleted.push(key);
      return true;
    }
  };
  const selfMock = {
    location: { origin: 'https://glorifier.pages.dev' },
    clients: { async claim() { claimed = true; } },
    addEventListener(type, listener) { listeners.set(type, listener); },
    async skipWaiting() {}
  };

  runInNewContext(serviceWorker, { self: selfMock, caches: cachesMock });
  const activate = listeners.get('activate');
  assert.equal(typeof activate, 'function', 'service worker must register an activate handler');

  let activation;
  activate({ waitUntil(promise) { activation = promise; } });
  assert.ok(activation, 'activation must register its asynchronous cleanup');
  await activation;

  assert.deepEqual(deleted.sort(), ['glorifier-ai-v1', 'glorifier-shell-v2']);
  assert.equal(claimed, true, 'service worker must claim clients after cache cleanup');
});

test('service-worker install pre-caches the static shell before activating', async () => {
  const listeners = new Map();
  const added = [];
  let releaseAddAll;
  let skippedWaiting = false;
  const addAllGate = new Promise((resolve) => { releaseAddAll = resolve; });
  const cache = {
    addAll(paths) {
      added.push(...paths);
      return addAllGate;
    }
  };
  const cachesMock = {
    async open(name) {
      assert.equal(name, 'glorifier-static-status-v3');
      return cache;
    }
  };
  const selfMock = {
    addEventListener(type, listener) { listeners.set(type, listener); },
    async skipWaiting() { skippedWaiting = true; }
  };

  runInNewContext(serviceWorker, { self: selfMock, caches: cachesMock });
  const install = listeners.get('install');
  assert.equal(typeof install, 'function', 'service worker must register an install handler');

  let installation;
  install({ waitUntil(promise) { installation = promise; } });
  assert.ok(installation, 'install must keep the shell cache operation alive');
  await Promise.resolve();

  assert.deepEqual(added, ['./', './index.html', './manifest.webmanifest', './glorifier-services-official-logo-001.png']);
  assert.equal(skippedWaiting, false, 'install must not skip waiting before the shell is cached');

  releaseAddAll();
  await installation;
  assert.equal(skippedWaiting, true, 'install may skip waiting only after the shell cache succeeds');
});

test('the Cloudflare sitemap contains only URLs on its canonical Pages host', () => {
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
  assert.deepEqual(locations, ['https://glorifier.pages.dev/']);
  assert.doesNotMatch(sitemap, /https:\/\/glorifier7\.github\.io\//);
});

test('the legacy project route is an inert redirect to the canonical evidence page', () => {
  assert.match(projectPage, /<meta http-equiv=["']refresh["'] content=["']0;\s*url=https:\/\/glorifier\.pages\.dev\//i);
  assert.match(projectPage, /<link rel=["']canonical["'] href=["']https:\/\/glorifier\.pages\.dev\//i);
  assert.doesNotMatch(projectPage, /<script\b|Autonomous AI Enterprise|AI-first autonomous enterprise/i);
});
