'use strict';

// Installation is progressive enhancement: routing and user data never depend on it.
if ('serviceWorker' in navigator && window.isSecureContext && /^https?:$/.test(location.protocol)) {
  const workerURL = new URL('./sw.js', import.meta.url);
  let lastCheck = 0;
  let registration;
  async function checkForUpdate() {
    if (!registration || document.visibilityState === 'hidden' || !navigator.onLine || Date.now() - lastCheck < 60 * 60 * 1000) return;
    lastCheck = Date.now();
    try { await registration.update(); } catch { /* A failed update keeps the active, verified shell. */ }
  }
  async function register() {
    try {
      registration = await navigator.serviceWorker.register(workerURL.href, {
        scope: new URL('./', workerURL).href,
        updateViaCache: 'none'
      });
      lastCheck = Date.now();
      // Let the native lifecycle activate updates after existing app windows close.
      // Never force a reload while a form, gallery, or local preference is in use.
      document.addEventListener('visibilitychange', checkForUpdate);
      window.addEventListener('online', checkForUpdate);
    } catch (error) {
      console.warn('Ahlan offline support is unavailable:', error.message);
    }
  }
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, {once: true});
}
