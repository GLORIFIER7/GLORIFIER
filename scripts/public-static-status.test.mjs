import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const manifest = JSON.parse(read('../public/manifest.webmanifest'));
const serviceWorker = read('../public/sw.js');
const legacyPage = read('../public/project.html');
const sitemap = read('../public/sitemap.xml');

test('public production entry is a single static evidence page', () => {
  assert.match(html, /GLORIFIER — Public Status/);
  assert.match(html, /EVIDENCE SNAPSHOT/);
  assert.match(html, /744dee7508fc7ca1e1370e2c56049b51770daf5b/);
  assert.match(html, /394b99f66cf5f6380fee801fc203559252c9a8d1/);
  assert.match(html, /16 commits ahead/);
  assert.match(html, /AI inference/i);
  assert.match(html, /not verified/i);
  assert.match(html, /does not make API requests/i);
  assert.doesNotMatch(html, /<script\b/i, 'static entry must not load application JavaScript');
  assert.doesNotMatch(html, /<script\b/i, 'static entry must not load application JavaScript');
  assert.doesNotMatch(html, /<script\b/i, 'static entry must not load application JavaScript');
});

test('installed-app metadata describes only the public status page', () => {
  assert.equal(manifest.name, 'GLORIFIER — Public Status');
  assert.match(manifest.description, /static public status page/i);
  assert.doesNotMatch(manifest.name + ' ' + manifest.description, /autonomous AI enterprise|AI-first/i);
});

test('service-worker update replaces stale dashboard caches with the static page shell', () => {
  assert.match(serviceWorker, /glorifier-static-status-v3/);
  assert.match(serviceWorker, /glorifier-shell-v2/);
  assert.match(serviceWorker, /glorifier-ai-v1/);
  assert.match(serviceWorker, /RETIRED_CACHES\.has\(key\)/);
  assert.match(serviceWorker, /glorifier-services-official-logo-001\.png/);
});

test('legacy project URL redirects to the one canonical static page', () => {
  assert.match(legacyPage, /http-equiv="refresh" content="0; url=\.\//);
  assert.match(legacyPage, /href="\.\/">public evidence status page/);
  assert.doesNotMatch(legacyPage, /<script\b/i);
  assert.doesNotMatch(legacyPage, /<script\b/i);
  assert.match(sitemap, /https:\/\/glorifier\.pages\.dev\//);
  assert.doesNotMatch(sitemap, /project\.html/);
});
