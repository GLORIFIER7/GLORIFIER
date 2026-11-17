import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const serviceWorker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

test('service-worker activation removes the retired static page cache and preserves the React shell', async () => {
  const listeners = new Map();
  const deleted = [];
  let activation;
  let claimed = false;

  const self = {
    addEventListener: (name, listener) => listeners.set(name, listener),
    clients: {
      claim: async () => {
        claimed = true;
      },
    },
  };
  const caches = {
    keys: async () => [
      'glorifier-static-status-v3',
      'glorifier-ai-v1',
      'glorifier-shell-v2',
      'unrelated-cache',
    ],
    delete: async (key) => {
      deleted.push(key);
      return true;
    },
  };

  runInNewContext(serviceWorker, { self, caches, Promise, Response, URL, fetch });

  const activate = listeners.get('activate');
  assert.equal(typeof activate, 'function', 'service worker must register an activate handler');
  activate({ waitUntil: (promise) => { activation = promise; } });
  await activation;

  assert.deepEqual([...deleted].sort(), [
    'glorifier-ai-v1',
    'glorifier-static-status-v3',
  ]);
  assert.ok(!deleted.includes('glorifier-shell-v2'), 'current React app shell must be preserved');
  assert.ok(!deleted.includes('unrelated-cache'), 'unrelated origin caches must be preserved');
  assert.equal(claimed, true, 'new service worker must claim clients after cache cleanup');
});
