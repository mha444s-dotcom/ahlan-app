'use strict';

// Presentation only. No application state, routing, or stored user data is changed here.
(() => {
  const nav = document.querySelector('.nav');
  if (nav && typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(nav.getBoundingClientRect().height);
      // Includes safe-area padding and font scaling. Desktop main uses normal flow spacing.
      if (height > 0) document.documentElement.style.setProperty('--nav-space', height + 'px');
    });
    observer.observe(nav);
  }

  const mediaSelector = '.media-image, .hero > img, .guide > img';
  const settleImage = image => {
    const loaded = image.naturalWidth > 0;
    image.classList.remove('is-loading');
    image.classList.toggle('is-loaded', loaded);
    image.classList.toggle('is-error', !loaded);
    image.setAttribute('aria-busy', 'false');
  };
  const onImageSettled = event => {
    if (event.target instanceof HTMLImageElement && event.target.matches(mediaSelector)) settleImage(event.target);
  };
  // Capture load/error for images added later by existing render functions; no MutationObserver.
  document.addEventListener('load', onImageSettled, true);
  document.addEventListener('error', onImageSettled, true);
  document.querySelectorAll(mediaSelector).forEach(image => {
    if (image.complete) settleImage(image);
    else { image.classList.add('is-loading'); image.setAttribute('aria-busy', 'true'); }
  });

  // One motion controller for the existing app header and journey tabs. Moving
  // `top` (not transform) keeps the mobile nav fixed to the viewport bottom.
  const header = document.querySelector('body > .site-header');
  const tabs = document.querySelector('main > .tabs');
  if (!header || !tabs || typeof header.getBoundingClientRect !== 'function' || typeof header.after !== 'function' || typeof window.getComputedStyle !== 'function') return;
  const html = document.documentElement, main = document.querySelector('main');
  const headerSpace = document.createElement('div'), tabsSpace = document.createElement('div');
  headerSpace.className = 'ahlan-header-space'; tabsSpace.className = 'ahlan-tabs-space';
  headerSpace.setAttribute('aria-hidden','true'); tabsSpace.setAttribute('aria-hidden','true');
  let hidden = false, headerHeight = 0, distance = 0, normalEnd = 0, tabTop = 0;
  let source = '', lastY = 0, direction = 0, travel = 0, measurePending = false, scrollPending = false;
  const write = (name,value) => { if (html.style.getPropertyValue(name) !== value) html.style.setProperty(name,value); };
  const embedded = () => document.body.dataset.explorePrototype === 'true';
  const clearDirection = () => { source = ''; direction = travel = 0; };
  function applyMotion() {
    write('--ahlan-chrome-shift',hidden ? -distance+'px' : '0px');
    // Native page content scrolls in the main document. Its flow must not be
    // resized when the shared headers move out of view.
    write('--ahlan-chrome-reclaim','0px');
    html.dataset.chromeHidden = String(hidden);
    window.dispatchEvent(new Event('ahlan:chrome-layout'));
  }
  function showOrHide(next) { if (hidden !== next) { hidden = next; applyMotion(); } }
  function measure() {
    measurePending = false;
    headerHeight = header.getBoundingClientRect().height;
    const tabHeight = tabs.hidden ? 0 : tabs.getBoundingClientRect().height;
    const style = window.getComputedStyle(tabs), padding = parseFloat(window.getComputedStyle(main).paddingTop) || 0;
    const before = parseFloat(style.marginTop) || 0, after = parseFloat(style.marginBottom) || 0;
    write('--ahlan-header-height',headerHeight+'px');
    write('--ahlan-tabs-space',tabHeight ? tabHeight+before+after+'px' : '0px');
    tabsSpace.hidden = tabs.hidden;
    const box = tabsSpace.getBoundingClientRect(), scrollY = Math.max(0,window.scrollY || 0);
    tabTop = Math.max(headerHeight+padding,box.top);
    write('--ahlan-tabs-top',tabTop+'px');
    write('--ahlan-tabs-left',box.left+'px'); write('--ahlan-tabs-width',box.width+'px');
    distance = tabHeight ? headerHeight+padding+before+tabHeight+after : headerHeight;
    normalEnd = tabHeight ? box.bottom+scrollY : headerHeight;
    applyMotion();
  }
  function scheduleMeasure() { if (!measurePending) { measurePending = true; requestAnimationFrame(measure); } }
  function sample(key,y,reset = false) {
    y = Math.max(0,y);
    if (y <= 4) { showOrHide(false); source = key; lastY = y; direction = travel = 0; return; }
    if (key !== source || reset) {
      if (source && key !== source) showOrHide(false);
      source = key; lastY = y; direction = travel = 0; return;
    }
    const delta = y-lastY;
    if (Math.abs(delta) < 2) return;
    lastY = y;
    const nextDirection = Math.sign(delta);
    travel = nextDirection === direction ? travel+Math.abs(delta) : Math.abs(delta);
    direction = nextDirection;
    if (direction > 0 && travel >= 16 && (key !== 'window' || y >= normalEnd)) showOrHide(true);
    else if (direction < 0 && travel >= 12) showOrHide(false);
  }
  function onWindowScroll() {
    scrollPending = false;
    const discover = document.getElementById('explorePrototype');
    // The full heritage gallery owns its own scroll container. Ignore window
    // movement while it is open, but keep normal Explore scrolling native.
    if (embedded() && discover && !discover.hidden && discover.shadowRoot?.querySelector('#heritage-full:not([hidden])')) return;
    // The placeholder scrolls normally; tabs dock below the unchanged header.
    const padding = parseFloat(window.getComputedStyle(main).paddingTop) || 0;
    tabTop = Math.max(headerHeight+padding,tabsSpace.getBoundingClientRect().top);
    write('--ahlan-tabs-top',tabTop+'px');
    sample('window',Math.max(0,window.scrollY || 0));
  }
  function requestDiscoverBaseline() {
    const discover = document.getElementById('explorePrototype');
    if (embedded() && discover && !discover.hidden) discover.dispatchEvent(new CustomEvent('ahlan:request-scroll'));
  }
  function resetRoute() {
    showOrHide(false); clearDirection();
    // A route can return to an already-at-top document without a scroll event.
    // Seed that baseline now so its first downward scroll is not discarded.
    source = 'window'; lastY = Math.max(0,window.scrollY || 0);
    scheduleMeasure(); requestDiscoverBaseline();
  }

  // Establish the original box sizes before taking either element out of flow.
  const originalHeader = header.getBoundingClientRect(), originalTabs = tabs.getBoundingClientRect();
  const originalMargins = window.getComputedStyle(tabs);
  write('--ahlan-header-height',originalHeader.height+'px');
  write('--ahlan-tabs-space',tabs.hidden ? '0px' : originalTabs.height+(parseFloat(originalMargins.marginTop)||0)+(parseFloat(originalMargins.marginBottom)||0)+'px');
  write('--ahlan-tabs-top',originalTabs.top+'px'); write('--ahlan-tabs-left',originalTabs.left+'px'); write('--ahlan-tabs-width',originalTabs.width+'px');
  header.after(headerSpace); tabs.before(tabsSpace); tabsSpace.hidden = tabs.hidden;
  html.classList.add('ahlan-chrome-ready'); measure();
  source = 'window'; lastY = Math.max(0,window.scrollY || 0);
  window.addEventListener('scroll',() => { if (!scrollPending) { scrollPending = true; requestAnimationFrame(onWindowScroll); } },{passive:true});
  window.addEventListener('resize',() => { direction = travel = 0; scheduleMeasure(); });
  window.visualViewport?.addEventListener('resize',scheduleMeasure);
  document.addEventListener('focusin',event => { if (header.contains(event.target) || tabs.contains(event.target)) showOrHide(false); });
  document.addEventListener('ahlan:discover-scroll',event => {
    const discover = document.getElementById('explorePrototype'), data = event.detail;
    if (!embedded() || !discover || discover.hidden || event.target !== discover) return;
    if (!data || !['page','gallery'].includes(data.source) || !Number.isFinite(data.y) || !Number.isFinite(data.max) || data.max < 0 || !Number.isFinite(data.viewport) || data.viewport <= 0) return;
    sample(data.source === 'page' ? 'window' : 'discover:gallery',Math.min(data.max,Math.max(0,data.y)),data.reset === true);
  });
  if (typeof ResizeObserver === 'function') {
    const sizes = new ResizeObserver(scheduleMeasure); sizes.observe(header); sizes.observe(tabs);
  }
  if (typeof MutationObserver === 'function') {
    const routes = new MutationObserver(resetRoute);
    routes.observe(document.body,{attributes:true,attributeFilter:['data-explore-prototype','data-design-sample']});
    routes.observe(tabs,{attributes:true,attributeFilter:['hidden']});
  }
})();
