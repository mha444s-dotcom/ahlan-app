'use strict';

function setupServiceCarousel() {
  const carousel = $('#services');
  carousel.setAttribute('aria-label','أقسام الخدمات، اسحب يمينًا أو يسارًا');
  carousel.previousElementSibling.querySelector('.link').remove();
  const controls = document.createElement('div'); controls.className = 'carousel-controls';
  controls.innerHTML = '<small>اسحب لاكتشاف باقي الأقسام</small><span class="carousel-meter" id="servicesProgress" role="progressbar" aria-label="موضع تمرير الخدمات" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></span><button aria-label="الأقسام السابقة" id="servicesPrev">→</button><button aria-label="الأقسام التالية" id="servicesNext">←</button>';
  carousel.previousElementSibling.append(controls);
  $('#servicesPrev').onclick = () => carousel.scrollBy({left:carousel.clientWidth * .75,behavior:scrollBehavior()});
  $('#servicesNext').onclick = () => carousel.scrollBy({left:-carousel.clientWidth * .75,behavior:scrollBehavior()});
  carousel.addEventListener('scroll',updateCarouselControls,{passive:true});
  window.addEventListener('resize',updateCarouselControls);
  let startX = 0, startScroll = 0, dragging = false, moved = false;
  carousel.addEventListener('pointerdown',e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    dragging = true; moved = false; startX = e.clientX; startScroll = carousel.scrollLeft;
  });
  window.addEventListener('pointermove',e => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    if (Math.abs(delta) > 6) { moved = true; carousel.classList.add('dragging'); carousel.scrollLeft = startScroll - delta; e.preventDefault(); }
  });
  const endDrag = () => { dragging = false; carousel.classList.remove('dragging'); setTimeout(() => {moved = false;},0); };
  window.addEventListener('pointerup',endDrag); window.addEventListener('pointercancel',endDrag); window.addEventListener('blur',endDrag);
  carousel.addEventListener('click',e => { if (moved) {e.preventDefault(); e.stopImmediatePropagation();} },true);
}
function renderServices() {
  const query = normalizeSearch(Ahlan.state.query);
  // Keep all original 14 image cards. Journey-specific content is a separate
  // reference-based directory, not a destructive filter of this original panel.
  const sections = Ahlan.sections.filter(s => !query || s.search.includes(query));
  const key = sections.map(s => s.index).join(',');
  if (Ahlan.renderKeys.get('services') === key) return;
  Ahlan.renderKeys.set('services',key);
  $('#services').innerHTML = sections.map(s => `<button class="service service-tone-${s.index % 4} ${s.index === 12 ? 'emergency-tile' : ''}" onclick="openContent(${s.index})">${imageMarkup('categories',s.file,s.alt,{className:'service-image'})}<b>${esc(s.content.title.replace(/^قسم /,''))}</b><small>${esc(s.content.summary)}</small></button>`).join('') || '<p>لا توجد خدمات مطابقة لهذا البحث.</p>';
  requestAnimationFrame(updateCarouselControls);
}
function updateCarouselControls() {
  const carousel = $('#services'), progress = Math.abs(carousel.scrollLeft), max = Math.max(0,carousel.scrollWidth - carousel.clientWidth);
  $('#servicesPrev').disabled = progress < 4; $('#servicesNext').disabled = progress >= max - 4;
  const meter = $('#servicesProgress');
  if (meter) {
    const percent = max ? Math.round(Math.min(1,progress/max)*100) : 100;
    meter.style.setProperty('--carousel-progress',percent + '%');
    meter.setAttribute('aria-valuenow',percent);
  }
}
