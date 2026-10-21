import {artRenditions} from './renditions.js';

// Original src and data remain canonical. The browser selects a smaller,
// losslessly encoded display derivative only when its resolution is sufficient.
export function installResponsiveArt(shadow) {
  const watched = new Set();
  let disposed = false;
  function unwatch(img) {
    if (watched.delete(img)) resize.unobserve(img);
  }
  function configure(img) {
    if (!img.isConnected) return;
    let url;
    try { url = new URL(img.src); } catch { return; }
    const name = url.pathname.split('/').at(-1);
    const art = url.origin === location.origin && url.pathname.includes('/discover-egypt/assets/') && artRenditions[name];
    if (!art || img.dataset.renditionFailed === name) {
      if (img.dataset.discoverRendition) {
        img.removeAttribute('srcset'); img.removeAttribute('sizes'); delete img.dataset.discoverRendition;
      }
      unwatch(img);
      return;
    }
    const variant = new URL(art.file, import.meta.url).href;
    const small = art.small && `${new URL(art.small.file,import.meta.url).href} ${art.small.width}w, `;
    const srcset = `${small||''}${variant} ${art.width}w, ${img.src} ${art.originalWidth}w`;
    if (img.srcset !== srcset) img.srcset = srcset;
    const width = Math.ceil(img.clientWidth);
    if (width > 0) img.sizes = `${width}px`;
    else if (!img.sizes) img.sizes = '256px';
    img.dataset.discoverRendition = name;
    img.decoding = 'async';
    if (!watched.has(img)) { watched.add(img); resize.observe(img); }
  }
  const resize = new ResizeObserver(entries=>entries.forEach(entry=>configure(entry.target)));
  function imagesIn(node, visit) {
    if (node.nodeType !== 1) return;
    if (node.tagName === 'IMG') visit(node);
    node.querySelectorAll('img').forEach(visit);
  }
  // Handle only images actually added, removed or given a new source. Gallery
  // labels, dust frames and text changes must not rescan the entire component.
  const mutation = new MutationObserver(records => {
    if (disposed) return;
    const changed = new Set();
    for (const record of records) {
      if (record.type === 'attributes') changed.add(record.target);
      else {
        record.removedNodes.forEach(node=>imagesIn(node,img=>{if(!img.isConnected)unwatch(img);}));
        record.addedNodes.forEach(node=>imagesIn(node,img=>changed.add(img)));
      }
    }
    changed.forEach(configure);
  });
  mutation.observe(shadow,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  function error(event) {
    const img = event.target;
    if (!img?.dataset?.discoverRendition) return;
    img.dataset.renditionFailed = img.dataset.discoverRendition;
    img.removeAttribute('srcset'); img.removeAttribute('sizes'); delete img.dataset.discoverRendition;
    // If a deployment misses a derivative, retry its unchanged original source.
    img.style.opacity = '1'; img.src = img.src;
  }
  shadow.addEventListener('error',error,true);
  shadow.querySelectorAll('img').forEach(configure);
  return {dispose(){disposed=true;mutation.disconnect();resize.disconnect();watched.clear();shadow.removeEventListener('error',error,true);}};
}
