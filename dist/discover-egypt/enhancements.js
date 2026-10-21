// Native Discover quality improvements. No application routes or source assets
// are replaced: image failures use the existing category art, explicitly labelled.
export function createHeritageImages({shadow, data, resources}) {
  const records = new Map(data.heritageRecords.map(record => [record.id, record]));
  const pictures = new Map(), pending = new Map(), failures = new Map();
  const watched = new Set();
  let active = true, disposed = false, detailId = '';
  const icons = new Map();
  function readIcons() {
    shadow.querySelectorAll('[data-heritage-entry]').forEach(button => {
      const src = button.querySelector('img')?.src;
      if (src) icons.set(button.dataset.heritageEntry, src);
    });
  }
  function prepare() {
    readIcons();
    for (const record of records.values()) {
      if (!pictures.has(record.wiki) && icons.has(record.category)) data.entries[record.id].image = icons.get(record.category);
    }
  }
  function recordFor(img) { return records.get(img.closest('[data-open]')?.dataset.open || (img.closest('#dialog-visual') ? detailId : '')); }
  function fallback(img, record) {
    const src = icons.get(record.category);
    if (!src) return;
    const parent = img.parentElement;
    parent.classList.add('heritage-image-placeholder');
    if (img.src !== src) img.src = src;
    img.style.opacity = '1'; img.alt = `رسم توضيحي لتصنيف ${record.category}؛ صورة ${record.title} غير متاحة حاليًا`;
    img.dataset.heritagePlaceholder = 'true';
    if (!parent.querySelector('.heritage-image-status')) {
      const note = document.createElement('span'); note.className = 'heritage-image-status';
      note.textContent = 'صورة توضيحية للتصنيف'; parent.append(note);
    }
  }
  function apply(img, record, src) {
    if (!img.isConnected || disposed) return;
    const parent = img.parentElement;
    parent.classList.remove('heritage-image-placeholder');
    parent.querySelector('.heritage-image-status')?.remove();
    delete img.dataset.heritagePlaceholder; img.style.opacity = '1';
    img.alt = record.title; if (img.src !== src) img.src = src;
  }
  async function load(img, record) {
    if (!active || disposed || !img.isConnected) return;
    if (pictures.has(record.wiki)) { apply(img, record, pictures.get(record.wiki)); return; }
    if ((failures.get(record.wiki) || 0) > Date.now()) return;
    let request = pending.get(record.wiki);
    if (!request) {
      const url = 'https://en.wikipedia.org/w/api.php?action=query&redirects=1&prop=pageimages&format=json&pithumbsize=1000&origin=*&titles=' + encodeURIComponent(record.wiki);
      request = resources.fetch(url).then(async response => {
        if (!response.ok) throw new Error('Thumbnail unavailable');
        const json = await response.json();
        const src = Object.values(json?.query?.pages || {})[0]?.thumbnail?.source;
        // Pageimage API is the original source. Accept only an actual image URL,
        // never substitute another place's stock photograph.
        if (!src || !/^https:\/\/upload\.wikimedia\.org\//.test(src)) throw new Error('No verified thumbnail');
        pictures.set(record.wiki, src);
        for (const row of data.heritageRecords) if (row.wiki === record.wiki) data.entries[row.id].image = src;
        return src;
      }).catch(() => {
        failures.set(record.wiki, Math.max(Date.now() + 60000, resources.getStats().blockedUntil));
        return null;
      }).finally(() => pending.delete(record.wiki));
      pending.set(record.wiki, request);
    }
    const src = await request;
    if (src) apply(img, record, src);
  }
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) {
      const record = recordFor(entry.target); if (record) load(entry.target, record);
    }
  }, {rootMargin:'160px 0px', threshold:0});
  function observe() {
    if (disposed) return;
    readIcons();
    // Remove detached cards after search/filter/category changes. Nothing grows
    // with repeated gallery renders; only the 170 catalogue thumbnails are cached.
    for (const img of watched) if (!img.isConnected) { io.unobserve(img); watched.delete(img); }
    const imgs = shadow.querySelectorAll('img[data-heritage-wiki],#dialog-visual img');
    imgs.forEach(img => {
      const record = recordFor(img); if (!record) return;
      img.decoding = 'async';
      if (pictures.has(record.wiki)) apply(img, record, pictures.get(record.wiki));
      else fallback(img, record);
      if (!watched.has(img)) { watched.add(img); io.observe(img); }
      // A reopened/re-filtered item can retry after the server cooldown. There
      // are no automatic retry timers or permanent cached failure values.
      else if (active && !pictures.has(record.wiki) && (failures.get(record.wiki)||0) <= Date.now()) { io.unobserve(img); io.observe(img); }
    });
  }
  function click(event) {
    const button = event.target.closest?.('[data-open]');
    if (button) detailId = button.dataset.open;
  }
  function error(event) {
    const img = event.target;
    if (img?.tagName !== 'IMG') return;
    const record = recordFor(img);
    if (record && !img.dataset.heritagePlaceholder) {
      pictures.delete(record.wiki); failures.set(record.wiki, Date.now()+60000);
      data.entries[record.id].image = icons.get(record.category) || data.entries[record.id].image;
      // The approved generic error listener runs in the same capture phase.
      // Restore the labelled local fallback after it hides the failed photo.
      queueMicrotask(()=>{if(img.isConnected&&!disposed)fallback(img, record);});
    }
  }
  shadow.addEventListener('click', click, true);
  shadow.addEventListener('keydown', click, true);
  shadow.addEventListener('error', error, true);
  const containsImage = node => node.nodeType === 1 && (node.tagName === 'IMG' || Boolean(node.querySelector('img')));
  const mutation = new MutationObserver(changes => {
    // Status labels and other text changes do not alter the set of thumbnails.
    // Avoid rescanning the catalogue after each placeholder/photo update.
    if (changes.some(change => [...change.addedNodes, ...change.removedNodes].some(containsImage))) observe();
  });
  // Only image-bearing child changes: src/alt updates never cause a loop.
  mutation.observe(shadow, {subtree:true, childList:true});
  return {
    prepare,
    observe,
    setActive(next) {
      active = Boolean(next);
      if (active) { observe(); for (const img of watched) { io.unobserve(img); io.observe(img); } }
    },
    dispose() { disposed = true; io.disconnect(); mutation.disconnect(); watched.clear(); pictures.clear(); failures.clear(); shadow.removeEventListener('click',click,true); shadow.removeEventListener('keydown',click,true); shadow.removeEventListener('error',error,true); }
  };
}

export function installDiscoverEnhancements({shadow, body}) {
  let active = true, restoring = false;
  const remove = [];
  const listen = (node, type, fn, options) => { node.addEventListener(type,fn,options); remove.push(()=>node.removeEventListener(type,fn,options)); };
  const footer = shadow.querySelector('.site-footer .foot-flex');
  const credits = shadow.querySelector('.archive-credits');
  const sourceDialog = document.createElement('dialog');
  sourceDialog.className = 'sources-licenses'; sourceDialog.id = 'discover-sources';
  sourceDialog.setAttribute('aria-labelledby','discover-sources-title');
  sourceDialog.innerHTML = '<div class="dialog-body"><div class="dialog-top"><h2 id="discover-sources-title">المصادر والتراخيص</h2><button type="button" class="close-dialog sources-close">إغلاق</button></div></div>';
  const contentNotice = document.createElement('div');
  contentNotice.className = 'sources-content-notice';
  contentNotice.innerHTML = '<p>تُقدَّم التواريخ والمعلومات في صورة مختصرة للاستكشاف. لا يتيح هذا القسم خدمة حجز.</p><p>بعض الرسوم والمشاهد توضيحية وليست توثيقًا فوتوغرافيًا لكل موقع. عند تعذّر تحميل صورة العنصر، يُعرض رسم التصنيف مع توضيح ذلك.</p>';
  sourceDialog.firstElementChild.append(contentNotice);
  if (credits) {
    credits.removeAttribute('style'); credits.querySelector('summary')?.removeAttribute('style');
    credits.querySelectorAll('[style]').forEach(node=>node.removeAttribute('style'));
    sourceDialog.firstElementChild.append(credits);
  }
  body.append(sourceDialog);
  if (footer) {
    const text = footer.querySelector('p'); if (text) text.textContent = 'اكتشف مصر بكل حكاياتها.';
    const oldNote = footer.lastElementChild;
    const open = document.createElement('button'); open.type = 'button'; open.className = 'sources-open ghost-btn'; open.textContent = 'المصادر والتراخيص';
    if (oldNote && oldNote !== footer.firstElementChild) oldNote.replaceWith(open); else footer.append(open);
    listen(open,'click',()=>sourceDialog.showModal());
  }
  shadow.querySelector('#info-dialog .dialog-note')?.remove();
  listen(sourceDialog.querySelector('.sources-close'),'click',()=>sourceDialog.close());
  // Preserve all original attribution URLs and legal publication conditions.
  const gallery = shadow.getElementById('heritage-full');
  gallery.setAttribute('aria-label','معرض الحضارة المصرية'); gallery.setAttribute('role','region');
  const underneath = [...body.children].filter(node=>node.matches('main,.site-footer'));
  function galleryState() {
    const open = !gallery.hidden;
    underneath.forEach(node=>{ node.inert = open; });
  }
  const observer = new MutationObserver(galleryState); observer.observe(gallery,{attributes:true,attributeFilter:['hidden']}); galleryState();
  const defaults = new Map();
  shadow.querySelectorAll('dialog').forEach(dialog => {
    const show = dialog.showModal.bind(dialog);
    defaults.set(dialog, show);
    dialog.showModal = function() {
      if (dialog.open) return;
      show();
      if (active && !restoring) history.pushState({...history.state, discoverDialog:dialog.id},'',location.href);
    };
    listen(dialog,'close',()=>{
      if (active && !restoring && history.state?.discoverDialog === dialog.id) history.back();
    });
    listen(dialog,'click',event=>{
      if (event.target !== dialog) return;
      const box=dialog.getBoundingClientRect();
      if (event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom) dialog.close();
    });
  });
  listen(window,'popstate',()=>{
    if (!active) return;
    restoring = true;
    try {
      const id = history.state?.discoverDialog;
      // A nested details dialog returns to favorites, then to its source page.
      shadow.querySelectorAll('dialog[open]').forEach(dialog=>{if(dialog.id!==id)dialog.close();});
      const target = id && shadow.getElementById(id); if (target && !target.open) defaults.get(target)?.();
    } finally { restoring = false; }
  });
  const globalSearch = shadow.getElementById('global-search');
  globalSearch.setAttribute('aria-label','ابحث في أماكن مصر وعصورها وتجاربها');
  shadow.getElementById('heritage-search').setAttribute('aria-label','ابحث في معرض الحضارة');
  for (const id of ['search-heading','heritage-count']) shadow.getElementById(id)?.setAttribute('aria-live','polite');
  shadow.querySelectorAll('img').forEach(img=>{img.decoding='async';});
  const emptyObserver = new MutationObserver(()=>{
    const empty=shadow.querySelector('.search-empty');
    if(empty?.textContent.includes('في النموذج الحالي'))empty.textContent=empty.textContent.replace('في النموذج الحالي','');
  });
  emptyObserver.observe(shadow.getElementById('results-grid'),{childList:true});
  return {
    setActive(next) {
      active=Boolean(next);
      if(!active){restoring=true; shadow.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close()); restoring=false; underneath.forEach(node=>{node.inert=false;});}
      else galleryState();
    },
    dispose(){observer.disconnect();emptyObserver.disconnect();remove.forEach(fn=>fn()); for(const [dialog,show]of defaults)dialog.showModal=show;}
  };
}
