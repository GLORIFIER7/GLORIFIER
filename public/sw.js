const CACHE_NAME = 'glorifier-shell-v2';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest'];

function isBackendRequest(pathname) {
  return /^\/(?:api|auth)(?:\/|$)/.test(pathname);
}

function offlineResponse(message) {
  return new Response(message, {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}

async function serveNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match('./index.html')) ||
      offlineResponse('GLORIFIER is offline. Reconnect and reload to try again.');
  }
}

async function cacheSuccessfulAsset(request, event) {
  try {
    const response = await fetch(request);
    const cacheControl = response.headers.get('Cache-Control') || '';
    const isNoStore = /(?:^|,)\s*no-store\b/i.test(cacheControl);
    if (response.ok && response.type !== 'opaque' && !isNoStore) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
    }
    return response;
  } catch {
    return (await caches.match(request)) ||
      offlineResponse('Asset unavailable while offline.');
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key === 'glorifier-ai-v1')
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function shouldIgnoreRequest(request) {
  if (request.method !== 'GET') return true;
  const url = new URL(request.url);
  return url.origin !== self.location.origin || isBackendRequest(url.pathname);
}

function isCacheableAsset(request) {
  return ['script', 'style', 'image', 'font'].includes(request.destination);
}

function dispatchFetch(event) {
  const request = event.request;
  if (shouldIgnoreRequest(request)) return;
  if (request.mode === 'navigate') {
    event.respondWith(serveNavigation(request));
    return;
  }
  if (isCacheableAsset(request)) {
    event.respondWith(cacheSuccessfulAsset(request, event));
  }
}

self.addEventListener('fetch', dispatchFetch);
