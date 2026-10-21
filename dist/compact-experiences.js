'use strict';

function setupExperienceGallery() {
  const actions = document.createElement('div'); actions.className = 'experience-heading-actions';
  actions.innerHTML = '<button class="arrow-button" aria-label="التجارب السابقة" onclick="scrollExperiences(1)">→</button><button class="arrow-button" aria-label="التجارب التالية" onclick="scrollExperiences(-1)">←</button><button class="see-all" onclick="openExperienceGallery()">عرض الكل ↖</button>';
  $('#experiences .sectionhead').append(actions);
  const context = document.createElement('div'); context.className = 'city-context';
  context.innerHTML = '<p id="cityContextText"></p><button class="chip" id="cityOnlyButton" aria-pressed="false">المدينة المختارة فقط</button>';
  $('#filters').before(context);
  $('#cityOnlyButton').onclick = () => { Ahlan.state.cityOnly = !Ahlan.state.cityOnly; renderRealCards(); renderGalleryCards(); };
  const gallery = document.createElement('section'); gallery.id = 'experienceGallery'; gallery.className = 'section-page experience-gallery'; gallery.lang = 'ar'; gallery.dir = 'rtl';
  gallery.innerHTML = `<button class="back" onclick="closeExperienceGallery()">→ رجوع للتجارب</button><div class="section-banner">${sectionIcon('tourism')}<span class="eyebrow">اكتشف مصر</span><h1>تجارب تستاهل المشوار</h1><p>أماكن حقيقية، من شوارع القاهرة لآثار الأقصر وهدوء أسوان.</p></div><p class="gallery-subtitle">اختار مكانًا لمعرفة تفاصيله وموقعه، أو احفظه في خطة رحلتك.</p><p id="galleryContext"></p><button class="chip" onclick="clearExperienceFilters()">عرض كل النتائج في هذه القائمة</button><div id="galleryCards"></div>`;
  $('main').append(gallery);
}
function scrollExperiences(direction) { $('#cards').scrollBy({left:direction * 560,behavior:scrollBehavior()}); }
function openExperienceGallery() { navigate({view:'gallery',origin:['journey','saved','plan'].includes(Ahlan.state.view) ? Ahlan.state.view : 'home'}); }
function closeExperienceGallery() { navigate({view:Ahlan.state.origin}); (isExplorePrototype() ? $('#xpPlaces') : $('#experiences')).scrollIntoView({block:'center'}); }
function clearExperienceFilters() { Ahlan.state.query = ''; Ahlan.state.filter = 'الكل'; Ahlan.state.cityOnly = false; $('#search').value = ''; render(); }
function renderGalleryCards() {
  if (Ahlan.state.view !== 'gallery') return;
  renderCards($('#galleryCards'),'gallery');
}
