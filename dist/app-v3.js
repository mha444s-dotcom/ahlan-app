'use strict';

// Section metadata is keyed once, in the same order as appContent.
Ahlan.sections = [
  ['إجراءات وتأشيرات','procedures','مستندات وإجراءات'],
  ['سكن وإقامة','housing','منزل للإقامة'],
  ['تعليم ودراسة','education','الدراسة والجامعة'],
  ['عمل ووظائف','work','مساحة عمل'],
  ['صحة وعلاج','health','مستشفى ورعاية صحية'],
  ['مواصلات','transport','قيادة وتنقل'],
  ['خدمات يومية','daily','التسوق والخدمات اليومية'],
  ['المجتمع','community','أصدقاء ومجتمع'],
  ['الخريطة الذكية','map','خريطة للتنقل'],
  ['أماكن وتجارب','tourism','أهرامات مصر'],
  ['ترجمة ولغات','translation','الكتابة والترجمة'],
  ['المساعد الذكي','assistant','تقنية ومساعد ذكي'],
  ['الطوارئ','emergency','خدمات الطوارئ'],
  ['ملفي الشخصي','profile','الحساب الشخصي'],
].map(([name,file,alt],index) => ({name,file,alt,index,
  content:window.appContent[index], search:normalizeSearch([name, window.appContent[index].title,
    window.appContent[index].summary, ...window.appContent[index].groups.flatMap(group =>
      [group.title, ...group.nodes.map(node => node.text)])].join(' '))}));

function render() {
  if (Ahlan.state.view === 'journey' && Ahlan.state.tab !== 'explore') { renderJourneyDirectory(); return; }
  if (isExplorePrototype()) { renderExplorePrototype(); return; }
  if (Ahlan.state.view === 'gallery') { renderGalleryCards(); return; }
  if (!['home','saved','plan'].includes(Ahlan.state.view)) return;
  renderServices(); renderRealFilters(); renderRealCards(); renderGalleryCards();
}
function journeyKey(value) { return value === 'live' ? 'inside' : Object.hasOwn(window.ahlanJourneys,value) ? value : 'explore'; }
function journeyText(copy) { return copy?.[Ahlan.data.language === 'en' ? 'en' : 'ar'] || ''; }
function changeJourneyLanguage(language) {
  if (!['ar','en'].includes(language)) return;
  saveData('language',language); closeModal(); renderRoute();
}
function journeyResults(key, query = Ahlan.state.query) {
  const needle = normalizeSearch(query);
  return (window.ahlanJourneys[journeyKey(key)].groups || []).map(category => ({...category,
    refs:category.refs.filter(([si,gi]) => {
      const group = window.appContent[si].groups[gi];
      return !needle || normalizeSearch([category.title.ar,category.title.en,Ahlan.sections[si].name,
        group.title,...group.nodes.map(n => n.text)].join(' ')).includes(needle);
    }),
  })).filter(category => category.refs.length);
}
function renderJourneyDirectory() {
  const groups = journeyResults(Ahlan.state.tab);
  const key = JSON.stringify([Ahlan.state.tab,Ahlan.data.language,groups.map(g => g.refs)]);
  if (Ahlan.renderKeys.get('journey') === key) return;
  Ahlan.renderKeys.set('journey',key);
  $('#journeyPage').innerHTML = '<div class="journey-grid">' + groups.map(category =>
    `<article class="journey-card"><h2>${brandIcon(category.icon,'',{size:36})}${esc(journeyText(category.title))}</h2><div class="journey-links" lang="ar" dir="rtl">${category.refs.map(([si,gi]) => {
      const section = window.appContent[si], group = section.groups[gi];
      return `<button onclick="openContent(${si},${gi})"><span>${esc(group.title)}</span><small>${esc(section.title.replace(/^قسم /,''))}</small><span aria-hidden="true">←</span></button>`;
    }).join('')}</div>${category.gap ? `<p class="journey-gap">${esc(journeyText(window.ahlanJourneyCopy[category.gap]))}</p>` : ''}</article>`
  ).join('') + '</div>' + (groups.length ? '' : `<p class="empty" role="status">${esc(journeyText(window.ahlanJourneyCopy.empty))}</p>`);
}
function renderJourneyChrome() {
  const locale = Ahlan.data.language === 'en' ? 'en' : 'ar';
  if (document.documentElement) { document.documentElement.lang = locale; document.documentElement.dir = locale === 'en' ? 'ltr' : 'rtl'; }
  const isJourney = Ahlan.state.view === 'journey', showChoices = ['home','journey','section'].includes(Ahlan.state.view);
  $('#journeyChoicesTitle').hidden = Ahlan.state.view !== 'home';
  $('#journeyChoicesTitle').textContent = journeyText(window.ahlanJourneyCopy.help);
  $('.tabs').hidden = !showChoices;
  $('.tabs').setAttribute('aria-label',journeyText(window.ahlanJourneyCopy.help));
  document.querySelectorAll('[data-tab]').forEach(button => {
    button.textContent = journeyText(window.ahlanJourneys[button.dataset.tab].title);
    const active = isJourney && button.dataset.tab === Ahlan.state.tab;
    button.classList.toggle('active',active); button.setAttribute('aria-pressed',active);
  });
  $('.lang-label').textContent = locale === 'en' ? 'English' : 'العربية';
  $('.lang').setAttribute('aria-label',locale === 'en' ? 'Language: English' : 'اللغة: العربية');
  $('#search').placeholder = journeyText(window.ahlanJourneyCopy.search);
  $('#search').setAttribute('aria-label',journeyText(window.ahlanJourneyCopy.search));
  $('#journeyIntro').hidden = !isJourney || Ahlan.state.tab === 'explore';
  $('#journeyPage').hidden = !isJourney || Ahlan.state.tab === 'explore';
  if (isJourney && Ahlan.state.tab !== 'explore') {
    const journey = window.ahlanJourneys[Ahlan.state.tab];
    $('#journeyIntro').innerHTML = `<button class="back" onclick="homeScreen()">${esc(journeyText(window.ahlanJourneyCopy.home))}</button><h1>${esc(journeyText(journey.title))}</h1><p>${esc(journeyText(journey.description))}</p>${Ahlan.state.tab !== 'explore' ? `<small>${esc(journeyText(window.ahlanJourneyCopy.original))}</small>` : ''}${locale === 'en' ? `<small>${esc(journeyText(window.ahlanJourneyCopy.languageNote))}</small>` : ''}`;
  }
}
function renderRoute(scroll = false) {
  Ahlan.lastRenderedHash = location.hash;
  const state = Ahlan.state;
  const atHome = ['home','saved','plan'].includes(state.view);
  const atExplore = state.view === 'journey' && state.tab === 'explore';
  document.body.dataset.explorePrototype = String(atExplore);
  $('#explorePrototype').hidden = !atExplore;
  // The redesign is deliberately limited to the three pages awaiting approval.
  document.body.dataset.designSample = state.view === 'home' || atExplore ? 'home' :
    state.view === 'section' && state.section === 0 ? 'government' :
    state.view === 'section' && state.section === 9 ? 'tourism' : '';
  $('#home').hidden = !atHome;
  $('.search').hidden = !atHome && state.view !== 'gallery' && state.view !== 'journey';
  $('#welcome').hidden = state.view !== 'home';
  $('#sectionPage').classList.toggle('visible', ['section','trust','legacy'].includes(state.view));
  $('#experienceGallery').classList.toggle('visible', state.view === 'gallery');
  $('#search').value = state.query;
  renderJourneyChrome();
  const activeNav = state.view === 'section' && state.section === 8 ? 'map' :
    state.view === 'section' && state.section === 13 ? 'profile' :
    state.view === 'gallery' ? (state.origin === 'journey' ? 'home' : state.origin) : ['saved','plan'].includes(state.view) ? state.view : 'home';
  document.querySelectorAll('[data-nav]').forEach(b => {
    const active = b.dataset.nav === activeNav;
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  $('#resultsTitle').textContent = state.view === 'saved' ? 'تجاربك المفضلة' : state.view === 'plan' ? 'خطة رحلتك' : 'تجارب تستاهل المشوار';
  updateCity();
  if (state.view === 'section') renderSection();
  else if (state.view === 'legacy') renderLegacySection(sectionData[state.legacy]);
  else if (state.view === 'trust') renderLegacySection(sectionData.find(x => x.name === 'التقييمات والثقة'));
  render();
  decorateBrandIcons($('#sectionPage'));
  if (scroll) {
    window.scrollTo({top:0, behavior:'instant'});
    const heading = state.view === 'journey' ? $('#journeyIntro h1') : (atHome ? $('#journeyChoicesTitle') : document.querySelector('.section-page.visible h1'));
    if (heading) { heading.tabIndex = -1; heading.focus({preventScroll:true}); }
  }
}
function renderSection() {
  const {section:index} = Ahlan.state;
  const meta = Ahlan.sections[index], s = meta.content;
  Ahlan.state.group = Math.min(Ahlan.state.group, s.groups.length - 1);
  const group = Ahlan.state.group;
  if (index === 0 || index === 9) {
    renderSampleSection(meta);
    return;
  }
  $('#sectionPage').innerHTML = `<button class="back" onclick="homeScreen()">→ الرئيسية</button>
    <div class="section-banner">${sectionIcon(meta.file)}<h1>${esc(s.title.replace(/^قسم /,''))}</h1><p>${esc(s.summary)}</p><span class="muted">الرئيسية / ${esc(s.title.replace(/^قسم /,''))}</span></div>
    ${index === 12 ? emergencyCards() : ''}
    <div class="content-layout"><aside class="section-menu" aria-label="في هذا القسم"><b>في هذا القسم</b>${s.groups.map((g,i) => `<button class="${i === group ? 'selected' : ''}" ${i === group ? 'aria-current="true"' : ''} onclick="openContent(${index},${i})">${esc(g.title)} <span>←</span></button>`).join('')}</aside>
    <div class="content-body"><h2>${esc(s.groups[group].title)}</h2>${renderGroup(s.groups[group],index,group)}
    ${relatedTopics(meta)}${index === 13 ? profileForm() : ''}${index === 11 ? assistantBox() : ''}${index === 10 ? dictionary() : ''}
    ${index === 8 ? '<p class="section-note">الخريطة التفاعلية والمسارات داخل التطبيق غير متاحة حاليًا. يمكنك فتح موقع كل تجربة في خدمة خرائط خارجية من تفاصيلها.</p>' : ''}
    <div class="section-note">${index === 0 ? 'محتوى الإجراءات هيكل إرشادي؛ الشروط والرسوم والمدد الواردة تحتاج إلى تحقق رسمي حسب الجنسية والحالة قبل الاعتماد عليها.' : 'هذا نموذج تفاعلي. أسماء الجهات والخدمات أمثلة من تصور المنصة، ولا تعني وجود شراكة أو توافر خدمة فعلية.'}</div></div></div>`;
  if (index === 13) loadProfile();
}

function relatedTopics(meta) {
  const topics = [...(sectionData.find(s => s.name === meta.name)?.topics || []),
    ...(meta.index === 13 ? sectionData.find(s => s.name === 'التنبيهات').topics : [])];
  const original = legacyServiceDescriptions[meta.name] || [];
  return '<details class="topic-block"><summary>موضوعات وخدمات مرتبطة</summary><p>هذه قائمة بالخدمات المقترحة، وليست خدمات متصلة أو عروضًا متاحة للحجز.</p>' + [...new Set([...topics,...original])].map(text => '<p>' + esc(text) + '</p>').join('') + (meta.index === 9 ? '<h3>مطاعم وكافيهات</h3>' + (legacyServiceDescriptions['مطاعم وكافيهات'] || []).map(text => '<p>' + esc(text) + '</p>').join('') : '') + '</details>';
}

function renderGroup(group, sectionIndex, groupIndex = Ahlan.state.group) {
  return '<div class="topic-stack">' + groupNodes(group.nodes).map((nodes,i) => `<article class="topic-block"><div class="topic-top"><span class="number">${String(i + 1).padStart(2,'0')}</span><h3>${esc(nodes[0].text.replace(/:$/,''))}</h3></div>${nodes.slice(1).map(n => `<p class="nested-item" style="margin-inline-start:${Math.min(3, Math.max(0, (n.indent - nodes[0].indent) / 4)) * 16}px">${esc(n.text)}</p>`).join('')}<button class="save-topic" onclick="saveContent(${sectionIndex},${groupIndex},${i})">♡ حفظ للرجوع إليه</button></article>`).join('') + '</div>';
}
function saveContent(si, gi, bi) {
  const section = window.appContent[si], group = section?.groups[gi];
  const block = group && groupNodes(group.nodes)[bi];
  if (!block) return;
  const label = section.title + ' / ' + group.title + ' / ' + block[0].text;
  saveInterestLabel(label);
}
function saveInterestLabel(label) {
  const values = Ahlan.data.interests.includes(label) ? Ahlan.data.interests : [...Ahlan.data.interests,label];
  const persisted = saveData('interests',values);
  guide(persisted ? 'تم الحفظ ♡' : 'محفوظ في هذه الجلسة',label);
}
function service(name) {
  // Accept both the existing service name and its displayed title without the "قسم" prefix.
  const key = normalizeSearch(name).replace(/^قسم\s+/,'');
  const meta = Ahlan.sections.find(s => [s.name,s.content.title].some(title =>
    normalizeSearch(title).replace(/^قسم\s+/,'') === key));
  if (meta) return openContent(meta.index);
  if (name === 'التقييمات والثقة') return navigate({view:'trust'});
  if (name === 'التنبيهات') return openContent(13);
  const legacy = sectionData.find(x => x.name === name);
  if (legacy) navigate({view:'legacy',legacy:sectionData.indexOf(legacy)});
}
function renderLegacySection(section) {
  $('#sectionPage').innerHTML = `<button class="back" onclick="homeScreen()">→ الرئيسية وكل الأقسام</button><div class="section-banner">${sectionIcon(Ahlan.sections.find(s => s.name === section.name)?.file || ({'التقييمات والثقة':'shield','مساعدة شخصية':'support','التنبيهات':'bell'})[section.name] || 'document')}<h1>${esc(section.title)}</h1><p>${esc(section.summary)}</p></div><div class="detail-grid">${section.topics.map((topic,i) => `<button class="detail-card" onclick="topicDetail(${sectionData.indexOf(section)},${i})"><span class="number">${String(i + 1).padStart(2,'0')}</span><h3>${esc(topic)}</h3><p>تعرّف على الخيارات والتفاصيل المرتبطة بهذه الخدمة.</p><b>استكشف التفاصيل ←</b></button>`).join('')}</div><p class="section-note">محتوى تعريفي؛ لا توجد مراجعات أو توثيق هوية أو معالجة شكاوى فعلية في النموذج الحالي.</p>`;
  decorateBrandIcons($('#sectionPage'));
  const originalTopics = legacyServiceDescriptions[section.name] || [];
  if (originalTopics.length) {
    const extra = document.createElement('div'); extra.className = 'section-note';
    extra.textContent = originalTopics.join(' • '); $('#sectionPage').append(extra);
  }
}
function topicDetail(si,ti) {
  const section = sectionData[si], topic = section?.topics[ti];
  if (!topic) return;
  modal(`<h2>${esc(topic)}</h2><p>${esc(section.summary)}</p><p>دليل الجهات والتواصل والتقديم ضمن الخدمات التي ستُربط بالنسخة الفعلية.</p><button class="yellow" onclick="saveInterest(${si},${ti})">احفظ في اهتماماتي ♡</button>`);
}
function saveInterest(si,ti) { const topic = sectionData[si]?.topics[ti]; if (topic) saveInterestLabel(topic); }
function emergencyCards() {
  return '<div class="emergency-cards">' + [['الشرطة','122'],['الإسعاف','123'],['المطافئ','180'],['الطوارئ','112'],['شرطة السياحة','126']].map(([title,number]) => `<a href="tel:${number}"><span>${title}</span><strong dir="ltr">${number}</strong><small>${brandIcon('phone','',{size:20})} اتصال ↗</small></a>`).join('') + '</div><p class="source-line">مصادر الأرقام: <a href="https://www.tra.gov.eg/en/atrc-faq/important-telephone-numbers/" target="_blank" rel="noopener">الجهاز القومي لتنظيم الاتصالات</a> · <a href="https://www.gov.uk/foreign-travel-advice/egypt/getting-help" target="_blank" rel="noopener">إرشادات السفر البريطانية</a></p>';
}
function profileForm() {
  return `<section class="topic-block"><h2>${brandIcon('profile')} بياناتي</h2><p>تُحفظ اختياريًا على هذا الجهاز، دون حساب أو مزامنة. اختيار مدينة التصفح مستقل عن المدينة المكتوبة هنا.</p><form id="localProfile"><div class="form-grid">${[['nationality','الجنسية'],['language','اللغة'],['city','المدينة'],['residence','نوع الإقامة'],['expiry','تاريخ انتهاء الوثائق'],['organization','الجامعة / جهة العمل']].map(([key,label]) => `<label>${label}<input name="${key}" ${key === 'expiry' ? 'type="date"' : ''}></label>`).join('')}</div><button class="yellow" type="submit">حفظ بياناتي</button><p id="profileStatus" role="status"></p><div id="profileConflictActions" hidden><button class="chip" type="button" id="keepProfileDraft">حفظ تعديلاتي مع الاحتفاظ بنسخة من القيم السابقة</button><button class="chip" type="button" id="useStoredProfile">استخدام القيم المحفوظة للحقول المتعارضة</button></div></form><h3>${brandIcon('heart')} اهتماماتي المحفوظة</h3><div id="interestList"></div><h3>${brandIcon('bell')} تذكيرات الوثائق</h3><form id="reminderForm"><label>عنوان التذكير<input id="reminderTitle" required placeholder="تجديد وثيقة"></label><label>التاريخ<input type="date" id="reminderDate" required></label><button class="yellow" type="submit" id="saveReminderButton">حفظ تذكير</button><button type="button" id="cancelReminder" class="chip" hidden>إلغاء التعديل</button><p id="reminderStatus" role="status"></p></form><div id="reminderList"></div><p>التذكيرات محفوظة محليًا؛ لا تُرسل إشعارات خارج التطبيق.</p></section>`;
}
let editingReminder = -1;
let profileBaseline = {}, pendingProfileConflict = null, profileSavePending = false;
const profileLabels = {nationality:'الجنسية',language:'اللغة',city:'المدينة',residence:'نوع الإقامة',expiry:'تاريخ انتهاء الوثائق',organization:'الجامعة / جهة العمل'};
const profileValue = (profile,key) => profile[key] || '';
function setProfileField(key,value) {
  const input = document.querySelector(`#localProfile [name="${key}"]`);
  if (!input) return;
  if (key === 'expiry') {
    // A date input silently discards old non-ISO text. Keep that value editable.
    input.type = value && !validDate(value) ? 'text' : 'date';
    if (input.type === 'text') input.setAttribute('aria-label','تاريخ انتهاء الوثائق: قيمة محفوظة بصيغة قديمة');
    else input.removeAttribute('aria-label');
  }
  input.value = value;
}
function profileDraft() {
  return Object.fromEntries(profileFields.map(key => [key,document.querySelector(`#localProfile [name="${key}"]`)?.value || '']));
}
function clearProfileConflict() {
  pendingProfileConflict = null;
  if ($('#profileConflictActions')) $('#profileConflictActions').hidden = true;
}
function reconcileProfileUpdates() {
  if (!$('#localProfile')) return;
  const draft = profileDraft();
  for (const key of profileFields) {
    if (draft[key] !== profileValue(profileBaseline,key)) continue;
    const value = profileValue(Ahlan.data.profile,key);
    setProfileField(key,value); profileBaseline[key] = value;
  }
  clearProfileConflict();
  $('#profileStatus').textContent = 'تغيرت البيانات المحفوظة في نافذة أخرى. حُدثت الحقول التي لم تعدلها، وبقيت مسودتك كما هي.';
}
function loadProfile() {
  if (!profileSavePending) profileBaseline = {...Ahlan.data.profile};
  clearProfileConflict();
  for (const key of profileFields) setProfileField(key,profileValue(Ahlan.data.profile,key));
  $('#interestList').textContent = Ahlan.data.interests.join(' • ') || 'لم تحفظ أي عناصر بعد.';
  $('#localProfile').addEventListener('submit',saveProfile);
  $('#keepProfileDraft').addEventListener('click',keepProfileDraft);
  $('#useStoredProfile').addEventListener('click',useStoredProfile);
  $('#reminderForm').addEventListener('submit',saveReminder);
  $('#cancelReminder').addEventListener('click',resetReminderForm);
  editingReminder = -1; renderReminders();
}
function saveProfile(event) {
  event.preventDefault();
  commitProfileDraft(Object.fromEntries(new FormData(event.target)));
}
function commitProfileDraft(draft, approvedConflict = null) {
  let latest = Ahlan.data.profile;
  try {
    // Read again at commit time, including writes whose storage event is pending.
    const raw = localStorage.getItem('ahlan-profile');
    latest = raw === null ? {} : readStored('profile');
  } catch { /* Preserve the current session when persistent storage is unavailable. */ }
  const edited = profileFields.filter(key => Object.hasOwn(draft,key) && draft[key] !== profileValue(profileBaseline,key));
  const conflicts = edited.filter(key => profileValue(latest,key) !== profileValue(profileBaseline,key) && draft[key] !== profileValue(latest,key));
  const approved = approvedConflict && profileFields.every(key => profileValue(latest,key) === profileValue(approvedConflict.latest,key) && draft[key] === approvedConflict.draft[key]);
  if (conflicts.length && !approved) {
    pendingProfileConflict = {latest:{...latest},draft:{...draft},conflicts};
    $('#profileConflictActions').hidden = false;
    $('#profileStatus').textContent = 'تغيرت هذه الحقول في نافذة أخرى أيضًا: ' + conflicts.map(key => profileLabels[key] + ' (مسودتك: ' + (draft[key] || 'فارغ') + '؛ المحفوظ: ' + (profileValue(latest,key) || 'فارغ') + ')').join('، ') + '. لم يُستبدل أي شيء. اختر القيم التي تريد الاحتفاظ بها.';
    return false;
  }
  if (conflicts.length) {
    try {
      // An explicit overwrite retains the previous version independently first.
      const key = 'ahlan-profile-recovery-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      localStorage.setItem(key,JSON.stringify(latest));
    } catch {
      $('#profileStatus').textContent = 'تعذر الاحتفاظ بنسخة من القيم السابقة. بقيت النسخة المحفوظة ومسودتك دون تغيير.';
      return false;
    }
  }
  const values = {...latest};
  for (const key of edited) values[key] = draft[key];
  const persisted = saveData('profile',values);
  profileSavePending = !persisted;
  if (persisted) profileBaseline = {...Ahlan.data.profile};
  for (const key of profileFields) setProfileField(key,profileValue(Ahlan.data.profile,key));
  clearProfileConflict();
  $('#profileStatus').textContent = persisted ? 'تم حفظ بياناتك على هذا الجهاز ✓' : 'بياناتك متاحة في هذه الجلسة فقط؛ تعذر الحفظ الدائم.';
  return persisted;
}
function keepProfileDraft() {
  if (!pendingProfileConflict) return;
  const approval = pendingProfileConflict;
  commitProfileDraft(profileDraft(),approval);
}
function useStoredProfile() {
  if (!pendingProfileConflict) return;
  const keys = pendingProfileConflict.conflicts;
  let latest = Ahlan.data.profile;
  try { if (localStorage.getItem('ahlan-profile') !== null) latest = readStored('profile'); } catch {}
  for (const key of keys) {
    const value = profileValue(latest,key);
    setProfileField(key,value); profileBaseline[key] = value;
  }
  Ahlan.data.profile = latest; clearProfileConflict();
  $('#profileStatus').textContent = 'استخدمت القيم المحفوظة للحقول المتعارضة. بقية مسودتك باقية؛ اضغط حفظ بياناتي لحفظها.';
}
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value;
}
function saveReminder(event) {
  event?.preventDefault();
  const title = $('#reminderTitle').value.trim(), date = $('#reminderDate').value;
  if (!title || !validDate(date)) { $('#reminderStatus').textContent = 'أدخل عنوانًا وتاريخًا صحيحين.'; return; }
  const reminders = [...Ahlan.data.reminders];
  if (editingReminder >= 0 && editingReminder < reminders.length) reminders[editingReminder] = {...reminders[editingReminder], title, date};
  else reminders.push({title,date});
  const persisted = saveData('reminders',reminders);
  resetReminderForm(); renderReminders();
  $('#reminderStatus').textContent = persisted ? 'تم حفظ التذكير على هذا الجهاز.' : 'التذكير متاح في هذه الجلسة فقط؛ تعذر الحفظ الدائم.';
}
function resetReminderForm() {
  editingReminder = -1; $('#reminderForm').reset(); $('#saveReminderButton').textContent = 'حفظ تذكير';
  $('#cancelReminder').hidden = true;
}
function renderReminders() {
  const list = $('#reminderList'); if (!list) return;
  list.replaceChildren();
  if (!Ahlan.data.reminders.length) { list.textContent = 'لا توجد تذكيرات بعد.'; return; }
  Ahlan.data.reminders.forEach((reminder,index) => {
    const row = document.createElement('article'); row.className = 'reminder-row';
    const title = document.createElement('strong'), date = document.createElement('span');
    title.textContent = reminder.title || 'تذكير بدون عنوان'; date.textContent = reminder.date || 'بدون تاريخ';
    const edit = document.createElement('button'); edit.className = 'chip'; edit.innerHTML = brandIcon('edit','',{size:18}) + ' تعديل';
    edit.setAttribute('aria-label','تعديل التذكير: ' + title.textContent);
    edit.addEventListener('click',() => { editingReminder = index; $('#reminderTitle').value = reminder.title;
      $('#reminderDate').value = validDate(reminder.date) ? reminder.date : ''; $('#saveReminderButton').textContent = 'حفظ التعديل';
      $('#cancelReminder').hidden = false; $('#reminderTitle').focus(); });
    const remove = document.createElement('button'); remove.className = 'chip'; remove.innerHTML = brandIcon('trash','',{size:18}) + ' حذف';
    remove.setAttribute('aria-label','حذف التذكير: ' + title.textContent);
    remove.addEventListener('click',() => confirmDeleteReminder(index)); row.append(title,date,edit,remove); list.append(row);
  });
}
function confirmDeleteReminder(index) {
  const record = Ahlan.data.reminders[index]; if (!record) return;
  modal(`<h2>حذف التذكير؟</h2><p>${esc(record.title)}</p><p>لن تُحذف بقية التذكيرات.</p><button class="yellow" id="confirmReminderDelete">حذف هذا التذكير</button><button class="chip" onclick="closeModal()">إلغاء</button>`);
  $('#confirmReminderDelete').addEventListener('click',() => {
    if (Ahlan.data.reminders[index] !== record) { closeModal(); return; }
    const persisted = saveData('reminders',Ahlan.data.reminders.filter((_,i) => i !== index));
    closeModal(false); resetReminderForm(); renderReminders(); $('#reminderTitle').focus();
    $('#reminderStatus').textContent = persisted ? 'تم حذف التذكير المحدد.' : 'حُذف من هذه الجلسة فقط؛ تعذر تحديث التخزين.';
  });
}
function assistantBox() {
  const prompts = [['وصلت القاهرة اليوم، أبدأ بإيه؟',0],['كيف أجد سكنًا قرب الجامعة؟',1],
    ['أحتاج طبيب أسنان',4],['كيف أفتح حسابًا بنكيًا؟',6],['أول مرة في مصر',0],['بدور على سكن',1]];
  return '<div class="topic-block"><h3>ابدأ بسؤال</h3><p>اختر السؤال للوصول للقسم المناسب. هذا توجيه جاهز، وليس مساعد ذكاء اصطناعي متصلًا.</p>' +
    prompts.map(([text,index]) => `<button class="assistant-question" onclick="openContent(${index})">${esc(text)} ←</button>`).join('') +
    '<button class="assistant-question" onclick="openExperienceGallery()">عايز أخرج النهارده ←</button><p>ابدأ بالانتقال من المطار، ثم السكن، ثم خط الهاتف. افتح الخدمات لمعرفة الأقسام المتاحة في هذا التصور.</p></div>';
}
function dictionary() {
  return '<div class="topic-block"><h3>قاموس سريع</h3><p>مصطلحات ثابتة؛ الترجمة الفورية غير متاحة في النموذج.</p><div class="dictionary">' + [['إقامة','Residence Permit'],['تصريح عمل','Work Permit'],['جواز سفر','Passport'],['موعد طبي','Medical Appointment'],['فاتورة','Invoice'],['عقد','Contract']].map(([arabic,english]) => `<p><b>${arabic}</b><span lang="en" dir="ltr">${english}</span></p>`).join('') + '</div></div>';
}
function initializeApp() {
  loadStoredData(); setupModal(); setupNavigation();
  const journey = document.createElement('section'); journey.id = 'journeyPage'; journey.hidden = true; $('main').append(journey);
  const section = document.createElement('section'); section.id = 'sectionPage'; section.className = 'section-page'; section.lang = 'ar'; section.dir = 'rtl'; $('main').append(section);
  const footer = document.createElement('div'); footer.className = 'footerlinks';
  footer.innerHTML = `<button onclick="service(\'التقييمات والثقة\')">${brandIcon('shield')} الثقة والأمان</button><button onclick="service(\'مساعدة شخصية\')">${brandIcon('support')} المساعدة الشخصية</button><button onclick="businessInfo()">الشراكات وخدمات Premium</button><button onclick="visionInfo()">عن أهلاً ورؤيتنا</button>`;
  $('#home').append(footer);
  setupServiceCarousel(); setupExperienceGallery();
  if (!$('.nav').querySelector('.brand-icon')) setupBrandIcons();
  setupExplorePrototype();
  $('#search').placeholder = 'ابحث عن أي خدمة، مستند أو مكان...';
  let searchFrame = 0;
  $('#search').addEventListener('input',() => {
    Ahlan.state.query = $('#search').value;
    cancelAnimationFrame(searchFrame); searchFrame = requestAnimationFrame(render);
  });
  $('#location').onclick = showCityPicker;
  window.addEventListener('storage',event => {
    const name = event.key?.replace(/^ahlan-/,'');
    if (!Object.hasOwn(storageSchemas,name)) return;
    Ahlan.data[name] = readStored(name);
    if (name === 'language') { renderRoute(); return; }
    if (name === 'city') { Ahlan.state.city = Ahlan.data.city; updateCity(); }
    if (name === 'profile') reconcileProfileUpdates();
    if (name === 'reminders') {
      editingReminder = -1;
      if ($('#reminderForm')) {
        $('#saveReminderButton').textContent = 'حفظ كتذكير جديد';
        $('#reminderStatus').textContent = 'تغيرت التذكيرات في نافذة أخرى. مسودة العنوان والتاريخ باقية؛ يمكنك حفظها كتذكير جديد.';
      }
      renderReminders();
    }
    if (name === 'interests' && $('#interestList')) $('#interestList').textContent = Ahlan.data.interests.join(' • ');
    render();
  });
  Object.assign(Ahlan.state,readRoute()); renderRoute(); decorateBrandIcons(document.body);
  delete document.documentElement.dataset.startupView;
}
initializeApp();
