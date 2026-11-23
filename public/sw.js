/*
 * Beacon service worker: keeps the app and the offline Nairobi map pack on the phone so the
 * map, tap-to-identify, search and directions work with no network.
 * - Page loads: network first, falling back to the cached app shell.
 * - Built assets (/assets/*, hashed) and map pack files (/offline/*.pack|pmtiles?v=...): cache first.
 * - /offline/manifest.json: network first, so a new map pack is picked up when online.
 */
const CACHE = 'beacon-offline-v1';
const SHELL = '/index.html';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.add(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('beacon-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page sends the files it already loaded before this worker took control, plus the map pack.
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'warm' || !Array.isArray(data.urls)) return;
  event.waitUntil(caches.open(CACHE).then(async cache => {
    await Promise.all(data.urls.map(async url => {
      if (await cache.match(url, { ignoreVary: true })) return;
      try {
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
      } catch { /* offline: try again next time */ }
    }));
    // Drop older map packs, but only once every file of the new one is on the phone:
    // a download cut short must leave the old pack working offline.
    const pack = data.urls.filter(u => /\/offline\/[^?]+\?v=/.test(u));
    if (!data.packVersion || !pack.length) return;
    const have = await Promise.all(pack.map(u => cache.match(u, { ignoreVary: true })));
    if (have.some(h => !h)) return;
    for (const req of await cache.keys()) {
      const u = new URL(req.url);
      if (u.pathname.startsWith('/offline/') && u.searchParams.has('v') && u.searchParams.get('v') !== data.packVersion) await cache.delete(req);
    }
  }));
});

async function networkFirst(request, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(key || request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key || request, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, SHELL));
  } else if (url.pathname === '/offline/manifest.json' || url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(req));
  } else if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/offline/') || /\.(ico|svg|png|jpg|webp|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
  }
});
