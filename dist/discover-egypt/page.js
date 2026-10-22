import {createDiscoverData} from './content.js';
import {installView} from './view.js';
import {installTomb} from './tomb.js';
import {installAmbientEffects, finalizeEffects} from './effects.js';
import {createRuntime} from './runtime.js';
import {installDiscoverFonts} from './fonts.js';
import {createDiscoverResourceLoader} from './resources.js';
import {createHeritageImages, installDiscoverEnhancements} from './enhancements.js';
import {installResponsiveArt} from './images.js';

const resource = name => new URL(name, import.meta.url).href;
const iconBase = new URL('../assets/ahlan-ui-icons/', import.meta.url);

async function textResource(name) {
  const response = await fetch(resource(name));
  if (!response.ok) throw new Error(`Discover resource ${name}: HTTP ${response.status}`);
  return response.text();
}
function stylesheet(shadow, name) {
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = resource(name);
    link.addEventListener('load', resolve, {once:true});
    link.addEventListener('error', () => reject(new Error(`Discover stylesheet ${name}`)), {once:true});
    shadow.append(link);
  });
}
function sharedIcon(name) {
  const image = document.createElement('img');
  image.className = 'ahlan-shared-icon'; image.alt = ''; image.setAttribute('aria-hidden', 'true');
  image.width = image.height = 24;
  image.src = new URL(`64/${name}.webp`, iconBase).href;
  image.srcset = [32,64,128].map(size => `${new URL(`${size}/${name}.webp`, iconBase).href} ${size}w`).join(', ');
  image.sizes = '24px'; return image;
}
function decorateSharedSymbols(shadow) {
  shadow.querySelectorAll('.searchbar > .search-icon,.heritage-search-wrap > span:first-child').forEach(element => {
    if (!element.querySelector('.ahlan-shared-icon')) element.replaceChildren(sharedIcon('search'));
  });
  shadow.querySelectorAll('button.fav[data-fav]').forEach(button => {
    const name = button.getAttribute('aria-pressed') === 'true' ? 'heart-filled' : 'heart';
    if (button.firstElementChild?.dataset.sharedIcon !== name) {
      const image = sharedIcon(name); image.dataset.sharedIcon = name; button.replaceChildren(image);
    }
  });
  const favorites = shadow.getElementById('guide-favorites');
  if (favorites && !favorites.querySelector('.ahlan-shared-icon')) {
    const label = favorites.textContent.replace(/^\s*[♡♥]\s*/u, '');
    favorites.replaceChildren(sharedIcon('heart'), document.createTextNode(label));
  }
}

export async function mountDiscover(host) {
  const shadow = host.attachShadow({mode:'open'});
  // Fetch the template and its styles concurrently. Remote swap-fonts must not
  // hold the native page behind an optional network dependency (also offline).
  void installDiscoverFonts();
  const [markup] = await Promise.all([textResource('page.html'),
    stylesheet(shadow, 'page.css'), stylesheet(shadow, 'native.css'),
    stylesheet(shadow, 'quality.css'), stylesheet(shadow, 'enhancements.css')]);
  const localDocument = document.createElement('div'); localDocument.dataset.discoverDocument = ''; localDocument.dir = 'rtl';
  const body = document.createElement('div'); body.dataset.discoverBody = ''; body.innerHTML = markup;
  const anchorSlot = document.createElement('slot'); anchorSlot.name = 'anchor';
  localDocument.append(anchorSlot, body); shadow.append(localDocument);
  // A user may leave while resources are arriving. Initialize the original
  // canvas/camera only after the cached component has a real visible box.
  if (host.hidden) await new Promise(resolve => {
    const visibility = new MutationObserver(() => {
      if (!host.hidden) { visibility.disconnect(); resolve(); }
    });
    visibility.observe(host, {attributes:true, attributeFilter:['hidden']});
  });

  let active = true, disposed = false, layoutFrame = 0, layoutUntil = 0, scrollFrame = 0;
  let visibleHeight = window.innerHeight, lastSource = '', lastWidth = 0, lastHeight = 0;
  let originalOverflow = null, decoratePending = false;
  const write = (name, value) => { if (host.style.getPropertyValue(name) !== value) host.style.setProperty(name, value); };
  function layout() {
    layoutFrame = 0;
    if (!active || disposed || host.hidden) return;
    const header = document.querySelector('body > .site-header');
    const tabs = document.querySelector('main > .tabs');
    const nav = document.querySelector('.site-header .nav');
    const rect = host.getBoundingClientRect();
    const tabBottom = tabs && !tabs.hidden ? tabs.getBoundingClientRect().bottom : 0;
    const tabMargin = tabBottom > 0 ? parseFloat(getComputedStyle(tabs).marginBottom) || 0 : 0;
    const visualTop = window.visualViewport?.offsetTop || 0;
    const visualBottom = visualTop + (window.visualViewport?.height || window.innerHeight);
    const top = Math.max(visualTop, header?.getBoundingClientRect().bottom || 0, tabBottom + tabMargin);
    const mainBottom = parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom) || 0;
    const navRect = nav?.getBoundingClientRect();
    const fixedNavVisible = nav && getComputedStyle(nav).position === 'fixed' && navRect.top < visualBottom && navRect.bottom > visualTop;
    const usableBottom = fixedNavVisible ? Math.min(visualBottom,navRect.top) : visualBottom - (visualBottom >= window.innerHeight-1 ? mainBottom : 0);
    const bottom = Math.max(0, window.innerHeight - usableBottom);
    visibleHeight = Math.max(1, window.innerHeight - top - bottom);
    write('--discover-visible-top', `${top}px`);
    write('--discover-bottom', `${bottom}px`);
    write('--discover-left', `${rect.left}px`);
    write('--discover-right', `${Math.max(0, window.innerWidth-rect.right)}px`);
    write('--discover-width', `${rect.width}px`);
    write('--discover-viewport-height', `${visibleHeight}px`);
    // A growing gallery viewport can clamp its scroll offset. Refresh that
    // baseline during the header transition, before the next deliberate scroll.
    const openGallery = shadow.getElementById('heritage-full');
    if (openGallery && !openGallery.hidden && (lastHeight !== openGallery.clientHeight || lastWidth !== host.clientWidth)) reportScroll(true);
    if (performance.now() < layoutUntil) layoutFrame = requestAnimationFrame(layout);
  }
  function scheduleLayout(animate = false) {
    if (!active || disposed) return;
    if (animate) layoutUntil = performance.now() + 220;
    if (!layoutFrame) layoutFrame = requestAnimationFrame(layout);
  }
  const resources = createDiscoverResourceLoader({fetch:window.fetch.bind(window)});
  const scope = {host, shadow, body, documentElement:localDocument, assetURL:resource, viewportHeight:() => visibleHeight, fetchResource:resources.fetch};
  const runtime = createRuntime(scope), ambient = createRuntime(scope), tomb = createRuntime(scope);
  const data = createDiscoverData(resource);
  const images = createHeritageImages({shadow,data,resources});
  runtime.env.heritageImages = images;
  layout();
  let api, enhancements, art;
  try {
    // Observe sources before the original renderers assign them, so responsive
    // candidates are selected during the same update rather than after mount.
    art = installResponsiveArt(shadow);
    api = installView(runtime.env, data);
    installAmbientEffects(ambient.env);
    installTomb(tomb.env);
    finalizeEffects(ambient.env);
    enhancements = installDiscoverEnhancements({shadow,body});
  } catch (error) {
    art?.dispose();images.dispose();resources.dispose();runtime.dispose();ambient.dispose();tomb.dispose();throw error;
  }

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let sceneVisible = false;
  const effectVisibility = new Map();
  const scene = shadow.getElementById('heritage-tomb-stage');
  function syncEffects() {
    const showing = active && !document.hidden;
    const canAnimate = showing && sceneVisible && !body.classList.contains('heritage-screen-open');
    tomb.setActive(canAnimate);
    // Its original pause/play controls are retained. Paused effects no longer
    // schedule idle frames, and off-screen/hidden/reduced-motion scopes sleep.
    ambient.setActive(canAnimate && !reducedMotion.matches);
    for(const [node,visible]of effectVisibility)node.toggleAttribute('data-effects-paused',!showing||!visible||reducedMotion.matches);
    shadow.querySelectorAll('.heritage-dust-field').forEach(node=>node.toggleAttribute('data-effects-paused',!canAnimate||reducedMotion.matches));
  }
  const effectsObserver = new IntersectionObserver(entries=>{
    for(const entry of entries) {
      if(entry.target===scene)sceneVisible=entry.isIntersecting;
      effectVisibility.set(entry.target,entry.isIntersecting);
    }
    syncEffects();
  },{rootMargin:'80px 0px'});
  shadow.querySelectorAll('#heritage-tomb-stage,#time-gateway,.culture-world,.hero').forEach(node=>effectsObserver.observe(node));
  const onVisibility = ()=>{resources.setActive(active&&!document.hidden);images.setActive(active&&!document.hidden);syncEffects();};
  document.addEventListener('visibilitychange',onVisibility);
  reducedMotion.addEventListener('change',syncEffects);
  syncEffects();

  function lockScroll(lock) {
    if (lock && !originalOverflow) {
      originalOverflow = {html:document.documentElement.style.overflow, body:document.body.style.overflow};
      document.documentElement.style.overflow = 'hidden'; document.body.style.overflow = 'hidden';
    } else if (!lock && originalOverflow) {
      if (document.documentElement.style.overflow === 'hidden') document.documentElement.style.overflow = originalOverflow.html;
      if (document.body.style.overflow === 'hidden') document.body.style.overflow = originalOverflow.body;
      originalOverflow = null;
    }
  }
  function reportScroll(reset = false) {
    scrollFrame = 0;
    if (!active || disposed || host.hidden || shadow.querySelector('dialog[open]')) return;
    const gallery = shadow.getElementById('heritage-full'), inGallery = gallery && !gallery.hidden;
    const source = inGallery ? 'gallery' : 'page';
    const viewport = inGallery ? gallery.clientHeight : window.innerHeight;
    const max = Math.max(0, inGallery ? gallery.scrollHeight-gallery.clientHeight : document.documentElement.scrollHeight-window.innerHeight);
    const y = Math.min(max, Math.max(0, inGallery ? gallery.scrollTop : window.scrollY));
    const baseline = reset || source !== lastSource || lastWidth !== host.clientWidth || lastHeight !== viewport;
    lastSource = source; lastWidth = host.clientWidth; lastHeight = viewport;
    host.dispatchEvent(new CustomEvent('ahlan:discover-scroll', {bubbles:true, detail:{source,y,max,viewport,reset:baseline}}));
  }
  function onGalleryScroll() { if (!scrollFrame) scrollFrame = requestAnimationFrame(() => reportScroll()); }
  const onBaseline = () => reportScroll(true);
  const onLayout = () => scheduleLayout(true);
  const onResize = () => { scheduleLayout(true); reportScroll(true); };
  const gallery = shadow.getElementById('heritage-full');
  gallery.addEventListener('scroll', onGalleryScroll, {passive:true});
  host.addEventListener('ahlan:request-scroll', onBaseline);
  window.addEventListener('ahlan:chrome-layout', onLayout);
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize',onResize);
  window.visualViewport?.addEventListener('scroll',onResize);
  const bodyObserver = new MutationObserver(() => {
    if (!active || disposed) return;
    lockScroll(body.classList.contains('heritage-screen-open'));
    syncEffects(); scheduleLayout(); reportScroll(true);
  });
  bodyObserver.observe(body, {attributes:true, attributeFilter:['class']});
  const symbols = new MutationObserver(() => {
    if (decoratePending || disposed) return;
    decoratePending = true;
    queueMicrotask(() => { decoratePending = false; if (!disposed) decorateSharedSymbols(shadow); });
  });
  decorateSharedSymbols(shadow); symbols.observe(body, {childList:true, subtree:true});
  shadow.addEventListener('click', event => {
    const link = event.target.closest?.('a[href^="#"]');
    if (!link) return;
    const id = decodeURIComponent(link.getAttribute('href').slice(1));
    const target = shadow.getElementById(id);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block:'start'});
  });

  function setActive(next) {
    if (disposed || active === next) return;
    if (!next) {
      enhancements.setActive(false);
      api.heritageHide(true);
      shadow.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
      lockScroll(false); active = false; runtime.setActive(false);images.setActive(false);resources.setActive(false);syncEffects();
      cancelAnimationFrame(layoutFrame); cancelAnimationFrame(scrollFrame); layoutFrame = scrollFrame = 0;
    } else {
      active = true; layout(); runtime.setActive(true);
      enhancements.setActive(true);resources.setActive(!document.hidden);images.setActive(!document.hidden);syncEffects();
      if (history.state?.heritageScreen) api.heritageShow();
      reportScroll(true); scheduleLayout(true);
    }
  }
  host.dataset.discoverMounted = 'true'; host.setAttribute('aria-busy', 'false');
  scheduleLayout(true); reportScroll(true);
  return {
    setActive,
    showFavorites() { if (active) api.showFavorites(); },
    dispose() {
      if (disposed) return;
      setActive(false); disposed = true; art.dispose();images.dispose();resources.dispose();enhancements.dispose();runtime.dispose();ambient.dispose();tomb.dispose();effectsObserver.disconnect();bodyObserver.disconnect(); symbols.disconnect();
      gallery.removeEventListener('scroll', onGalleryScroll);
      host.removeEventListener('ahlan:request-scroll', onBaseline);
      window.removeEventListener('ahlan:chrome-layout', onLayout); window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize',onResize);window.visualViewport?.removeEventListener('scroll',onResize);
      document.removeEventListener('visibilitychange',onVisibility);reducedMotion.removeEventListener('change',syncEffects);
    }
  };
}
