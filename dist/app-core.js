'use strict';

// Shared state, safe persistence, and navigation. Feature files never replace globals.
const Ahlan = {
  state: { view: 'home', tab: 'explore', section: 0, group: 0, origin: 'home',
    query: '', filter: 'الكل', city: 'القاهرة', cityOnly: false },
  data: {}, storageProblems: new Set(), renderKeys: new Map(),
};
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
  ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const normalizeSearch = value => String(value).normalize('NFKC').toLowerCase()
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآ]/g, 'ا').trim();
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const ids = value => Array.isArray(value) ? [...new Set(value.map(x =>
  typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : x)
  .filter(x => Number.isSafeInteger(x) && x > 0))] : [];
const strings = value => Array.isArray(value) ? value.filter(x => typeof x === 'string') : [];
const profileFields = ['nationality','language','city','residence','expiry','organization'];
const storageSchemas = {
  saved: ids, plan: ids, interests: strings,
  profile: value => Object.fromEntries(profileFields.filter(k => isObject(value) &&
    typeof value[k] === 'string').map(k => [k, value[k]])),
  reminders: value => Array.isArray(value) ? value.filter(isObject).map(x => ({...x,
    title: typeof x.title === 'string' ? x.title : '',
    date: typeof x.date === 'string' ? x.date : ''})) : [],
  city: value => cities.includes(value) ? value : 'القاهرة',
  language: value => ['ar','en'].includes(value) ? value : 'ar',
};
const cities = ['القاهرة','الجيزة','الإسكندرية','الأقصر','أسوان','الغردقة','شرم الشيخ'];
const protectedStorage = new Map();
function storageNotice(message) {
  Ahlan.storageProblems.add(message);
  const target = $('#storageNotice');
  if (target) { target.hidden = false; target.textContent = [...Ahlan.storageProblems].join(' '); }
}
function readStored(name) {
  const key = 'ahlan-' + name;
  let raw = null, parsed;
  try { raw = localStorage.getItem(key); parsed = raw === null ? undefined : JSON.parse(raw); }
  catch (error) {
    if (raw !== null) protectedStorage.set(key, raw);
    storageNotice('تعذر قراءة بعض البيانات المحفوظة؛ بقي الأصل دون تغيير. يمكن متابعة الاستخدام على هذا الجهاز.');
  }
  const normalized = storageSchemas[name](parsed);
  if (raw !== null && JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    protectedStorage.set(key, raw);
    storageNotice('بعض البيانات القديمة تحتاج إلى استعادة؛ سيُحتفظ بنسخة من أصلها قبل أي تحديث.');
  }
  return normalized;
}
function writeStored(name, value) {
  const key = 'ahlan-' + name;
  try {
    if (protectedStorage.has(key)) {
      const recoveryKey = key + '-recovery-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem(recoveryKey, protectedStorage.get(key));
      protectedStorage.delete(key);
    }
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    storageNotice('تعذر الحفظ الدائم. التغييرات متاحة في هذه الجلسة فقط؛ البيانات السابقة لم تُحذف.');
    return false;
  }
}
function loadStoredData() {
  for (const name of Object.keys(storageSchemas)) Ahlan.data[name] = readStored(name);
  Ahlan.state.city = Ahlan.data.city;
}
function saveData(name, value) {
  Ahlan.data[name] = storageSchemas[name](value);
  return writeStored(name, Ahlan.data[name]);
}
function announce(message) { $('#appStatus').textContent = message; }
function scrollBehavior() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
function scrollToExperiences() { (typeof isExplorePrototype === 'function' && isExplorePrototype() ? $('#xpPlaces') : $('#experiences')).scrollIntoView({behavior:scrollBehavior()}); }

// Only trusted templates call modal(); user strings go through guide()/textContent.
let modalReturnFocus = null;
function modal(html) {
  const overlay = $('#overlay');
  if (!overlay.classList.contains('open')) modalReturnFocus = document.activeElement;
  $('#modal').innerHTML = '<button class="close" type="button" aria-label="إغلاق" onclick="closeModal()">×</button>' + html;
  const heading = $('#modal h2');
  if (heading) { heading.id = 'modalTitle'; $('#modal').setAttribute('aria-labelledby', heading.id); $('#modal').removeAttribute('aria-label'); }
  else { $('#modal').removeAttribute('aria-labelledby'); $('#modal').setAttribute('aria-label', 'تفاصيل'); }
  overlay.classList.add('open'); overlay.removeAttribute('aria-hidden');
  for (const node of document.querySelectorAll('body > header, body > main, body > nav')) node.inert = true;
  document.body.classList.add('modal-open');
  $('#modal').scrollTop = 0;
  if (typeof decorateBrandIcons === 'function') decorateBrandIcons($('#modal'));
  $('#modal .close').focus();
}
function closeModal(restore = true) {
  if (!$('#overlay').classList.contains('open')) return;
  $('#overlay').classList.remove('open'); $('#overlay').setAttribute('aria-hidden', 'true');
  for (const node of document.querySelectorAll('body > header, body > main, body > nav')) node.inert = false;
  document.body.classList.remove('modal-open');
  if (restore) {
    const target = modalReturnFocus?.isConnected ? modalReturnFocus : document.querySelector('.nav [aria-current="page"]');
    target?.focus();
  }
}
function guide(title, text) {
  const content = document.createElement('div');
  const h = document.createElement('h2'), p = document.createElement('p');
  h.textContent = title; p.textContent = text; content.append(h, p);
  modal(content.innerHTML);
}
function setupModal() {
  $('#overlay').addEventListener('click', e => { if (e.target === $('#overlay')) closeModal(); });
  document.addEventListener('keydown', e => {
    if (!$('#overlay').classList.contains('open')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    if (e.key !== 'Tab') return;
    const controls = [...$('#modal').querySelectorAll('button,input,select,textarea,a[href],[tabindex]')]
      .filter(x => !x.disabled && x.tabIndex >= 0 && !x.hidden);
    const first = controls[0], last = controls.at(-1);
    if (e.shiftKey && (document.activeElement === first || !$('#modal').contains(document.activeElement))) {
      e.preventDefault(); last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  });
}
function routeHash(state) {
  const params = new URLSearchParams();
  params.set('tab', state.tab);
  if (state.view === 'section') { params.set('section', state.section); params.set('group', state.group); }
  if (state.view === 'gallery') params.set('origin', state.origin);
  if (state.view === 'legacy') params.set('legacy',state.legacy);
  return '#/' + state.view + '?' + params;
}
function readRoute() {
  const match = location.hash.match(/^#\/(home|journey|saved|plan|section|gallery|trust|legacy)(?:\?(.*))?$/);
  if (!match) return {view:'home'};
  const params = new URLSearchParams(match[2]);
  const section = Number(params.get('section') || 0), group = Number(params.get('group') || 0);
  const legacy = Number(params.get('legacy') || 0);
  const tab = journeyKey(params.get('tab'));
  return {legacy:Number.isInteger(legacy) && legacy >= 0 && legacy < sectionData.length ? legacy : 0, view:match[1] === 'home' && params.get('tab') === 'live' ? 'journey' : match[1], tab,
    section:Number.isInteger(section) && section >= 0 && section < window.appContent.length ? section : 0,
    group:Number.isInteger(group) && group >= 0 ? group : 0,
    origin:['home','journey','saved','plan'].includes(params.get('origin')) ? params.get('origin') : 'home'};
}
function navigate(patch, {replace = false, scroll = true} = {}) {
  closeModal(false);
  Object.assign(Ahlan.state, patch);
  Ahlan.state.tab = journeyKey(Ahlan.state.tab);
  const hash = routeHash(Ahlan.state);
  if (hash !== location.hash) history[replace ? 'replaceState' : 'pushState']({ahlan:true}, '', hash);
  renderRoute(scroll);
}
function setupNavigation() {
  const onHistory = () => {
    // Back/forward can emit both events for the same hash. Render that location once.
    if (Ahlan.lastRenderedHash === location.hash) return;
    closeModal(false); Object.assign(Ahlan.state, readRoute());
    const anchor = location.hash && !location.hash.startsWith('#/');
    renderRoute(!anchor);
    if (anchor) {
      try { document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); }
      catch { /* A malformed external fragment is ignored. */ }
    }
  };
  window.addEventListener('popstate', onHistory);
  window.addEventListener('hashchange', onHistory);
  document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => {
    const nav = button.dataset.nav;
    if (nav === 'map') return openContent(8);
    if (nav === 'profile') return profile();
    navigate({view:nav, query:'', filter:'الكل', cityOnly:false});
    $('#experiences').scrollIntoView({block:'start'});
  }));
  document.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => {
    navigate({view:'journey', tab:button.dataset.tab, query:'', filter:'الكل'}, {scroll:true});
  }));
}
function homeScreen() { navigate({view:'home'}); }
function openContent(index, group = 0) { navigate({view:'section', section:index, group}); }
function profile() { openContent(13); }
function assistant() { openContent(11); }
function allServices() { navigate({view:'home', query:''}, {scroll:false}); $('#services').scrollIntoView(); }
function showLanguages() {
  const english = Ahlan.data.language === 'en';
  modal(`<div lang="${english ? 'en' : 'ar'}" dir="${english ? 'ltr' : 'rtl'}"><h2>${english ? 'Interface language' : 'لغة الواجهة'}</h2><p>${esc(journeyText(window.ahlanJourneyCopy.languageNote))}</p><button class="chip" lang="ar" dir="rtl" onclick="changeJourneyLanguage('ar')" aria-pressed="${!english}">العربية</button><button class="chip" lang="en" dir="ltr" onclick="changeJourneyLanguage('en')" aria-pressed="${english}">English</button></div>`);
}
function showCityPicker() {
  modal('<h2>أنت فين في مصر؟</h2><p>نرتب الأماكن المتاحة الأقرب لاختيارك أولًا، مع بقاء بقية المدن ظاهرة. لا نجمع موقعك الفعلي.</p><label for="citySelect">المدينة</label><select id="citySelect">' +
    cities.map(city => `<option ${city === Ahlan.state.city ? 'selected' : ''}>${esc(city)}</option>`).join('') +
    '</select><button class="yellow" onclick="changeCity()">تأكيد المدينة</button>');
}
function changeCity() {
  const city = $('#citySelect').value;
  if (!cities.includes(city)) return;
  Ahlan.state.city = city; Ahlan.state.cityOnly = false;
  saveData('city', city); closeModal(); updateCity(); render();
  announce('تم اختيار ' + city + '. جميع المدن ما زالت متاحة.');
}
function updateCity() { $('#city').textContent = Ahlan.state.city + '، مصر'; }
function imageMarkup(kind, file, alt, {hero = false, className = ''} = {}) {
  const fallback = kind === 'categories' ? `assets/optimized/${kind}/${file}-960.jpg` : `assets/${kind}/${file}.jpg`;
  return `<picture><source type="image/jpeg" srcset="assets/optimized/${kind}/${file}-480.jpg 480w, assets/optimized/${kind}/${file}-960.jpg 960w" sizes="${kind === 'categories' ? '225px' : '(max-width:700px) 90vw, 400px'}"><img src="${fallback}" alt="${esc(alt)}" ${hero ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'} class="${className} media-image is-loading" aria-busy="true" width="960" height="640"></picture>`;
}
function groupNodes(nodes) {
  // A shallower heading resets the local level; later siblings no longer swallow earlier blocks.
  const blocks = [];
  let level = Infinity;
  for (const node of nodes) {
    const indent = Math.max(0, Number(node.indent) || 0);
    if (!blocks.length || indent <= level) { blocks.push([]); level = indent; }
    blocks.at(-1).push({...node, indent});
  }
  return blocks;
}
