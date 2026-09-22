const CACHE_PREFIX = 'travelplaner-shell-';
const FALLBACK_CACHE_NAME = `${CACHE_PREFIX}dev`;
const SHELL_MANIFEST_URL = '/shell-assets.json';
const STATIC_SHELL_ASSETS = ['/', '/index.html', '/favicon.svg', '/manifest.webmanifest'];
let activeCacheName = FALLBACK_CACHE_NAME;

const isDocumentRequest = (request) => (
  request.mode === 'navigate'
  || request.destination === 'document'
  || request.headers.get('accept')?.includes('text/html')
);

async function readShellManifest() {
  try {
    const response = await fetch(SHELL_MANIFEST_URL, { cache: 'no-store' });
    if (!response.ok) return null;
    const manifest = await response.json();
    if (!manifest || typeof manifest.cacheName !== 'string' || !manifest.cacheName.startsWith(CACHE_PREFIX)) return null;
    if (!Array.isArray(manifest.assets) || manifest.assets.some(asset => typeof asset !== 'string' || !asset.startsWith('/'))) return null;
    return manifest;
  } catch {
    return null;
  }
}

async function cacheResource(cache, url) {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (response.ok) await cache.put(url, response);
  } catch {
    // A partial cache is still useful for the next launch.
  }
}

async function precacheShell() {
  const manifest = await readShellManifest();
  if (manifest) activeCacheName = manifest.cacheName;
  const cache = await caches.open(activeCacheName);
  const assets = [...new Set([...STATIC_SHELL_ASSETS, ...(manifest?.assets || []), SHELL_MANIFEST_URL])];
  await Promise.all(assets.map(url => cacheResource(cache, url)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const manifest = await readShellManifest();
    if (manifest) activeCacheName = manifest.cacheName;
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== activeCacheName)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin || event.request.method !== 'GET' || requestUrl.pathname.startsWith('/api/')) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(event.request);
      if (response.ok) {
        const responseClone = response.clone();
        caches.open(activeCacheName).then(cache => cache.put(event.request, responseClone));
      }
      return response;
    } catch {
      const cached = await caches.match(event.request);
      if (isDocumentRequest(event.request)) return cached || caches.match('/index.html');
      return cached || Response.error();
    }
  })());
});
