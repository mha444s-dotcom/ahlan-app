'use strict';

// Bump this release whenever deployed HTML, CSS, JavaScript, or local data change.
// Installation commits the complete shell before it can become active. An update
// waits for old app windows to close; it never replaces code beneath a live page.
const VERSION = 'be3abe0f00c5f95d';
const BASE = new URL('./', self.location.href);
const PREFIX = 'ahlan-pwa-' + encodeURIComponent(BASE.pathname) + '-';
const SHELL_CACHE = PREFIX + VERSION + '-shell';
const IMAGE_CACHE = PREFIX + VERSION + '-images';
const MAX_IMAGES = 64;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const MAX_SINGLE_IMAGE_BYTES = 4 * 1024 * 1024;
const SHELL = [
  'index.html', 'offline.html', 'manifest.webmanifest', 'pwa.js',
  'design-system.css', 'app-v3.css', 'service-carousel.css', 'category-art.css',
  'real-experiences.css', 'compact-experiences.css', 'brand-icons.css',
  'interface-sample.css', 'explore-prototype.css', 'pwa.css', 'app-quality.css',
  'app-core.js', 'content-data.js', 'journey-data.js', 'expanded.js',
  'legacy-experiences.js', 'real-experiences.js', 'service-carousel.js',
  'compact-experiences.js', 'brand-icons.js', 'interface-sample.js',
  'explore-prototype.js', 'app-v3.js', 'ui-layout.js',
  'discover-egypt/page.html', 'discover-egypt/page.css', 'discover-egypt/native.css',
  'discover-egypt/page.js', 'discover-egypt/content.js', 'discover-egypt/view.js',
  'discover-egypt/runtime.js', 'discover-egypt/tomb.js', 'discover-egypt/effects.js',
  'discover-egypt/fonts.js', 'discover-egypt/quality.css',
  'discover-egypt/enhancements.js', 'discover-egypt/enhancements.css', 'discover-egypt/resources.js',
  'discover-egypt/images.js', 'discover-egypt/renditions.js',
  'assets/pwa/icon-192.png', 'assets/pwa/icon-512.png',
  'assets/pwa/icon-maskable-512.png', 'assets/pwa/apple-touch-icon.png'
];
const SHELL_URLS = new Set(SHELL.map(file => new URL(file, BASE).href));
const APP_URL = new URL('index.html', BASE).href;
const OFFLINE_URL = new URL('offline.html', BASE).href;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll rejects on any failed resource. A partial install cannot activate.
    await cache.addAll(SHELL.map(file => new Request(new URL(file, BASE).href, {cache: 'reload'})));
    // Pages hosts may redirect index.html to / and remove other .html suffixes.
    // A cached response that retains that redirect cannot satisfy Chrome's
    // manual-redirect navigation requests. Keep the exact decoded HTML bytes
    // and content headers, but store a fresh, non-redirected response.
    for (const file of SHELL.filter(file => file.endsWith('.html'))) {
      const url = new URL(file, BASE).href;
      const response = await cache.match(url);
      if (!response?.redirected) continue;
      const headers = new Headers(response.headers);
      headers.delete('Content-Encoding');
      headers.delete('Content-Length');
      await cache.put(url, new Response(await response.arrayBuffer(), {
        status: response.status, statusText: response.statusText, headers
      }));
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== SHELL_CACHE && name !== IMAGE_CACHE).map(name => caches.delete(name)));
    // No clients.claim(): the first page finishes with one consistent code version.
  })());
});

async function shellResponse(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  return cached || fetch(request);
}

async function navigationResponse(request, url) {
  if (url.pathname === BASE.pathname || url.pathname === new URL(APP_URL).pathname) {
    return (await caches.open(SHELL_CACHE)).match(APP_URL);
  }
  try { return await fetch(request); }
  catch {
    return (await caches.open(SHELL_CACHE)).match(OFFLINE_URL);
  }
}

// Serialize small cache mutations so simultaneous image completions cannot make
// eviction race and overflow the budget. Responses still reach the screen first.
let imageWrites = Promise.resolve();
function storeImage(request, response) {
  const size = Number(response.headers.get('Content-Length'));
  if (!response.ok || response.type === 'opaque' || !/^image\//i.test(response.headers.get('Content-Type') || '') || !Number.isFinite(size) || size <= 0 || size > MAX_SINGLE_IMAGE_BYTES) return Promise.resolve();
  imageWrites = imageWrites.catch(() => {}).then(async () => {
    const cache = await caches.open(IMAGE_CACHE);
    await cache.delete(request);
    await cache.put(request, response);
    const keys = await cache.keys();
    let total = 0;
    const sizes = [];
    for (const key of keys) {
      const value = await cache.match(key);
      const bytes = Number(value?.headers.get('Content-Length')) || MAX_SINGLE_IMAGE_BYTES;
      sizes.push(bytes); total += bytes;
    }
    while (keys.length > MAX_IMAGES || total > MAX_IMAGE_BYTES) {
      total -= sizes.shift();
      await cache.delete(keys.shift());
    }
  });
  return imageWrites;
}

async function imageResponse(event) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  event.waitUntil(storeImage(event.request, response.clone()).catch(() => {}));
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('Range')) return;
  const url = new URL(request.url);
  if (url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  // External images, Wikipedia APIs, accounts, and transactions stay online-only.
  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request, url));
  } else if (!url.search && SHELL_URLS.has(url.href)) {
    event.respondWith(shellResponse(request));
  } else if (!url.search && request.destination === 'image' && /\/(?:assets)\//.test(url.pathname)) {
    event.respondWith(imageResponse(event));
  }
});
