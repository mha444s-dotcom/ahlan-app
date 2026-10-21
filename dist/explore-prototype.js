'use strict';

// Ahlan owns routing; this page keeps one native DOM and one local lifecycle.
const DiscoverEgyptPage = (() => {
  let root, page, loading, wasActive = false, restoreCarousel = false;
  function syncActive() {
    const active = isExplorePrototype() && !root.hidden;
    if (page) page.setActive(active);
    if (wasActive && !active) restoreCarousel = true;
    wasActive = active;
    // Window resizes while this route is open measure the hidden home carousel
    // as zero width. Refresh its existing controls when that view is visible again.
    if (restoreCarousel && !active && !document.querySelector('#home').hidden) {
      restoreCarousel = false;
      requestAnimationFrame(() => { if (!isExplorePrototype() && typeof updateCarouselControls === 'function') updateCarouselControls(); });
    }
  }
  function setup() {
    root = document.createElement('section'); root.id = 'explorePrototype'; root.hidden = true;
    root.setAttribute('aria-label', 'اكتشف مصر');
    const anchor = document.createElement('span'); anchor.id = 'xpPlaces'; anchor.slot = 'anchor'; anchor.setAttribute('aria-hidden', 'true');
    root.append(anchor); document.querySelector('#home').before(root);
    if (typeof MutationObserver === 'function') new MutationObserver(syncActive).observe(root, {attributes:true, attributeFilter:['hidden']});
    document.addEventListener('click', event => {
      if (!isExplorePrototype() || !page || !event.target.closest?.('.nav [data-nav="saved"]')) return;
      event.preventDefault(); event.stopImmediatePropagation(); page.showFavorites();
    }, true);
  }
  function render() {
    if (!isExplorePrototype() || !root) return;
    if (page) { syncActive(); return; }
    if (loading) return;
    root.setAttribute('aria-busy', 'true');
    const status = document.createElement('p'); status.className = 'discover-load-status'; status.setAttribute('role', 'status');
    status.textContent = 'جارٍ تحميل اكتشف مصر…'; root.append(status);
    loading = import('./discover-egypt/page.js').then(module => module.mountDiscover(root)).then(instance => {
      page = instance; status.remove(); syncActive();
    }).catch(error => {
      root.setAttribute('aria-busy', 'false'); root.dataset.discoverError = 'true';
      status.textContent = 'تعذر تحميل اكتشف مصر. تأكد من تشغيل التطبيق عبر الخادم المحلي وإتاحة ملفاته.';
      if (root.shadowRoot) root.shadowRoot.replaceChildren(status);
      console.error('Discover could not be mounted:', error);
    });
  }
  return {setup, render};
})();
function isExplorePrototype() { return Ahlan.state.view === 'journey' && Ahlan.state.tab === 'explore'; }
function setupExplorePrototype() { DiscoverEgyptPage.setup(); }
function renderExplorePrototype() { DiscoverEgyptPage.render(); }
