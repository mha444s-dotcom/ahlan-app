// Explore-only Wikipedia thumbnails. Original URLs and response shapes stay intact.
// Requests to every other resource continue through the browser's normal fetch.
export function createDiscoverResourceLoader({
  fetch: nativeFetch,
  now = () => Date.now(),
  maxConcurrent = 3,
  maxCacheEntries = 180,
  maxPendingEntries = 180,
  maxCacheBytes = 1024 * 1024,
  maxResponseBytes = 64 * 1024,
  retryAfterMs = 60000
} = {}) {
  if (typeof nativeFetch !== 'function') throw new TypeError('A fetch implementation is required.');
  const limit = Math.max(1, Math.floor(maxConcurrent));
  const cache = new Map(), pending = new Map(), queue = [];
  const controllers = new Set();
  let active = true, disposed = false, running = 0, cacheBytes = 0;
  let blockedUntil = 0, cooldownResponse = null;

  function abortError() { return new DOMException('Explore resource loading was disposed.', 'AbortError'); }
  function eligible(input, options) {
    // Do not share requests with credentials, custom headers, bodies or caller
    // signals: their identity/cancellation may differ even for the same URL.
    if (options && Object.keys(options).length) return null;
    if (typeof input !== 'string' && !(input instanceof URL)) return null;
    try {
      const url = new URL(input);
      if (url.protocol !== 'https:' || url.hostname !== 'en.wikipedia.org' || url.pathname !== '/w/api.php') return null;
      if (url.username || url.password || url.searchParams.get('action') !== 'query' || !url.searchParams.get('prop')?.split('|').includes('pageimages')) return null;
      return url.href;
    } catch { return null; }
  }
  function cached(key) {
    const value = cache.get(key);
    if (!value) return null;
    cache.delete(key); cache.set(key, value);
    return value.response.clone();
  }
  function remember(key, response, bytes) {
    if (disposed || !maxCacheEntries || bytes > maxCacheBytes) return;
    const old = cache.get(key);
    if (old) { cacheBytes -= old.bytes; cache.delete(key); }
    while (cache.size && (cache.size >= maxCacheEntries || cacheBytes + bytes > maxCacheBytes)) {
      const oldest = cache.keys().next().value;
      cacheBytes -= cache.get(oldest).bytes; cache.delete(oldest);
    }
    cache.set(key, {response: response.clone(), bytes}); cacheBytes += bytes;
  }
  async function responseBytes(response) {
    if (!response.ok || /(?:^|,)\s*no-store\b/i.test(response.headers.get('cache-control') || '')) return null;
    const declared = Number(response.headers.get('content-length'));
    if (declared > maxResponseBytes) return null;
    // Limit the cloned stream, rather than buffering arbitrary response bodies.
    const reader = response.clone().body?.getReader();
    if (!reader) return 0;
    let bytes = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) return bytes;
        bytes += part.value.byteLength;
        if (bytes > maxResponseBytes) {
          reader.cancel().catch(() => {}); return null;
        }
      }
    } catch { return null; }
    finally { reader.releaseLock(); }
  }
  function rateLimited() {
    if (now() < blockedUntil && cooldownResponse) return cooldownResponse.clone();
    blockedUntil = 0; cooldownResponse = null; return null;
  }
  function cooldown(response) {
    const raw = response.headers.get('retry-after') || '';
    const seconds = /^\s*\d+(?:\.\d+)?\s*$/.test(raw) ? Number(raw) * 1000 : NaN;
    const date = Date.parse(raw);
    const delay = Number.isFinite(seconds) ? seconds : Number.isFinite(date) ? Math.max(0, date - now()) : retryAfterMs;
    blockedUntil = Math.max(blockedUntil, now() + Math.max(1000, delay));
    // Keep only failure metadata, not a potentially large server error page.
    cooldownResponse = new Response(null, {status:429, statusText:'Too Many Requests', headers:{'Retry-After':raw || String(Math.ceil(retryAfterMs / 1000))}});
    for (const task of queue.splice(0)) {
      pending.delete(task.key); task.resolve(cooldownResponse.clone());
    }
  }
  async function run(task) {
    running++;
    const controller = new AbortController(); controllers.add(controller);
    try {
      const response = await nativeFetch(task.key, {signal:controller.signal});
      if (disposed) throw abortError();
      if (response.status === 429) cooldown(response);
      else if (response.ok) {
        const bytes = await responseBytes(response);
        if (bytes !== null) remember(task.key, response, bytes);
      }
      task.resolve(response);
    } catch (error) { task.reject(error); }
    finally {
      pending.delete(task.key); controllers.delete(controller); running--; pump();
    }
  }
  function pump() {
    if (!active || disposed) return;
    const failure = rateLimited();
    if (failure) {
      for (const task of queue.splice(0)) { pending.delete(task.key); task.resolve(failure.clone()); }
      return;
    }
    while (running < limit && queue.length) run(queue.shift());
  }
  function fetchResource(input, options) {
    if (disposed) return Promise.reject(abortError());
    const key = eligible(input, options);
    if (!key) return nativeFetch(input, options);
    const saved = cached(key);
    if (saved) return Promise.resolve(saved);
    const failure = rateLimited();
    if (failure) return Promise.resolve(failure);
    let promise = pending.get(key);
    if (!promise) {
      // The approved catalogue contains 170 entries. Bound accidental repeated
      // unique queries too, without bypassing the concurrency limit.
      if (pending.size >= maxPendingEntries) return Promise.resolve(new Response(null, {
        status:503, statusText:'Thumbnail queue is busy', headers:{'Retry-After':'1'}
      }));
      promise = new Promise((resolve, reject) => { queue.push({key, resolve, reject}); });
      pending.set(key, promise); pump();
    }
    // Every caller owns its response body, including callers sharing a request.
    return promise.then(response => response.clone());
  }
  return {
    fetch: fetchResource,
    setActive(next) { if (disposed) return; active = Boolean(next); if (active) pump(); },
    dispose() {
      if (disposed) return;
      disposed = true; active = false;
      for (const task of queue.splice(0)) { pending.delete(task.key); task.reject(abortError()); }
      for (const controller of controllers) controller.abort();
      cache.clear(); cacheBytes = 0; cooldownResponse = null;
    },
    getStats: () => ({active, disposed, running, queued:queue.length, pending:pending.size, cached:cache.size, cacheBytes, blockedUntil})
  };
}
