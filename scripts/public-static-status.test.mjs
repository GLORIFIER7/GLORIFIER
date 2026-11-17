import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

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
  assert.doesNotMatch(html, /id=["']root["']/i, 'static entry must not mount the former React application');
  assert.doesNotMatch(html, /Starting the application|Gemini template|Autonomous AI Enterprise/i);
});
