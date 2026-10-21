const realExperiences=[
{id:101,title:'الأهرامات وأبو الهول',city:'الجيزة',cat:'آثار وثقافة',tag:'عجائب مصر',file:'giza',photo:'Giza pyramid complex, Giza, Egypt3.jpg',author:'Diego Delso, delso.photo',license:'by-sa/3.0',desc:'تمشّى في هضبة الجيزة وشاهد أهرامات خوفو وخفرع ومنقرع وأبو الهول. تجربة للتصوير واكتشاف آثار مصر القديمة.',source:'https://egymonuments.gov.eg/en/archaeological-sites/giza-plateau/'},
{id:102,title:'جولة في خان الخليلي',city:'القاهرة',cat:'أسواق وخروجات',tag:'روح القاهرة',file:'khan-street',photo:'Flickr - HuTect ShOts - Khan El-Khalili Street شارع خان الخليلي - Cairo - Egypt - 09 04 2010.jpg',author:'Ahmed Al.Badawy',license:'by-sa/2.0',desc:'اكتشف سوق خان الخليلي في القاهرة التاريخية، بين الحِرف والهدايا والمشغولات والفوانيس. جولة مشي تستمتع فيها بتفاصيل المكان.',source:'https://commons.wikimedia.org/wiki/Category:Khan_el-Khalili'},
{id:103,title:'قلعة قايتباي على البحر',city:'الإسكندرية',cat:'على البحر',tag:'إسكندرية',file:'qaitbay',photo:'Qaitbay Citadel.jpg',author:'Moaazk12',license:'by-sa/3.0',desc:'زور قلعة قايتباي في الإسكندرية، واستمتع بمشهد القلعة الحجرية على ساحل البحر المتوسط.',source:'https://commons.wikimedia.org/wiki/Citadel_of_Qaitbay'},
{id:104,title:'بين أعمدة معابد الكرنك',city:'الأقصر',cat:'آثار وثقافة',tag:'رحلة في التاريخ',file:'karnak',photo:'Karnak Hypostyle Hall R01.jpg',author:'Marc Ryckaert',license:'by-sa/4.0',desc:'اكتشف مجمع معابد الكرنك بالأقصر، وشاهد قاعة الأعمدة الكبرى بتفاصيلها ونقوشها الأثرية.',source:'https://egymonuments.gov.eg/en/archaeological-sites/karnak/'},
{id:105,title:'معبد فيلة وسط النيل',city:'أسوان',cat:'على النيل',tag:'سحر أسوان',file:'philae',photo:'The Temple of Isis from Philae, Lake Nasser, Egypt.jpg',author:'Vyacheslav Argenberg',license:'by/4.0',desc:'اكتشف مجموعة معابد فيلة في أسوان ومعبد إيزيس، في موقعها على جزيرة أجيليكا وسط المياه.',source:'https://egymonuments.gov.eg/en/archaeological-sites/philae/'},
{id:106,title:'مسجد محمد علي بالقلعة',city:'القاهرة',cat:'آثار وثقافة',tag:'عمارة القاهرة',file:'citadel',photo:'Mosque of Muhammad Ali.jpg',author:'Abdelrhman 1990',license:'by/3.0',desc:'تأمل قباب مسجد محمد علي ومآذنه داخل قلعة صلاح الدين بالقاهرة، ضمن جولة لاكتشاف عمارة القلعة.',source:'https://commons.wikimedia.org/wiki/Cairo_Citadel'}
];

function realImage(item) { return item.legacy ? `https://images.unsplash.com/${item.img}?auto=format&fit=crop&w=800&q=85` : 'assets/experiences/' + item.file + '.jpg'; }
function photoSource(item) { return 'https://commons.wikimedia.org/wiki/File:' + encodeURIComponent(item.photo.replaceAll(' ','_')); }
function credit(item) {
  if (item.legacy) return '<span>تجربة توضيحية محفوظة من النسخة السابقة؛ لا تتوفر حجوزات فعلية.</span>';
  return `<span>تصوير: ${esc(item.author)} · <a href="${photoSource(item)}" target="_blank" rel="noopener">المصدر</a> · <a href="https://creativecommons.org/licenses/${item.license}/" target="_blank" rel="noopener">CC ${esc(item.license.toUpperCase().replace('/',' '))}</a></span>`;
}
function allExperiences() {
  return [...realExperiences,...legacyExperiences.map(item => ({...item,city:item.id === 1 ? 'الجيزة' : 'القاهرة',legacy:true}))];
}
function experienceView() { return Ahlan.state.view === 'gallery' ? Ahlan.state.origin : Ahlan.state.view; }
function filteredExperiences() {
  const state = Ahlan.state, view = experienceView(), query = normalizeSearch(state.query);
  const selected = view === 'saved' ? Ahlan.data.saved : view === 'plan' ? Ahlan.data.plan : null;
  // Keep earlier saved demonstration IDs visible without mixing illustrative offers into the main catalogue.
  return allExperiences().filter(item => (!item.legacy || selected?.includes(item.id)) &&
    (!selected || selected.includes(item.id)) && (state.filter === 'الكل' || item.cat === state.filter) &&
    (!query || normalizeSearch(item.title + ' ' + item.city + ' ' + item.cat + ' ' + item.desc).includes(query)) &&
    (!state.cityOnly || cityMatches(item.city,state.city)))
    .sort((a,b) => Number(cityMatches(b.city,state.city)) - Number(cityMatches(a.city,state.city)));
}
function cityMatches(city, selectedCity) { return city === selectedCity || selectedCity === 'القاهرة' && city === 'الجيزة'; }
function renderRealFilters() {
  const categories = [...new Set(['الكل',...realExperiences.map(x => x.cat),
    ...allExperiences().filter(x => x.legacy && (Ahlan.data.saved.includes(x.id) || Ahlan.data.plan.includes(x.id))).map(x => x.cat)])];
  const key = JSON.stringify([categories,Ahlan.state.filter]);
  if (Ahlan.renderKeys.get('filters') === key) return;
  Ahlan.renderKeys.set('filters',key);
  const filters = $('#filters');
  const focusedCategory = [...filters.querySelectorAll('[data-filter]')].find(button => button === document.activeElement)?.dataset.filter;
  filters.innerHTML = categories.map(category => `<button class="chip ${category === Ahlan.state.filter ? 'active' : ''}" aria-pressed="${category === Ahlan.state.filter}" data-filter="${esc(category)}">${esc(category)}</button>`).join('');
  const buttons = [...filters.querySelectorAll('[data-filter]')];
  buttons.forEach(button => button.addEventListener('click',() => {
    Ahlan.state.filter = button.dataset.filter; renderRealFilters(); renderRealCards(); renderGalleryCards();
  }));
  // Replacing the selected chip must not send keyboard users back to the page start.
  if (focusedCategory !== undefined) buttons.find(button => button.dataset.filter === focusedCategory)?.focus({preventScroll:true});
}
function cardMarkup(item) {
  const saved = Ahlan.data.saved.includes(item.id);
  const image = item.legacy ? `<img src="${realImage(item)}" alt="${esc(item.title)}" loading="lazy" decoding="async">` : imageMarkup('experiences',item.file,'صورة فوتوغرافية حقيقية: ' + item.title);
  return `<article class="card real-card" data-card="${item.id}"><button class="real-card-open" onclick="detail(${item.id})"><div class="photo">${image}</div><span class="badge">${esc(item.tag)}</span><h3>${esc(item.title)}</h3><p>⌖ ${esc(item.city)} · ${esc(item.cat)}</p><div class="price">${item.legacy ? esc(item.price) : 'اكتشف المكان ←'}</div></button><button class="heart" aria-label="${saved ? 'إلغاء حفظ' : 'حفظ'} ${esc(item.title)}" aria-pressed="${saved}" onclick="toggleSave(${item.id})">${saved ? '♥' : '♡'}</button><div class="photo-credit">${credit(item)}</div></article>`;
}
function renderCards(target, keyName) {
  if (!target) return;
  const list = filteredExperiences();
  const selected = experienceView() === 'saved' ? Ahlan.data.saved : experienceView() === 'plan' ? Ahlan.data.plan : [];
  const unknown = selected.filter(id => !allExperiences().some(item => item.id === id));
  const key = JSON.stringify([list.map(item => item.id), Ahlan.data.saved, unknown,
    experienceView(), Boolean(Ahlan.state.query || Ahlan.state.cityOnly || Ahlan.state.filter !== 'الكل')]);
  if (Ahlan.renderKeys.get(keyName) === key) return;
  Ahlan.renderKeys.set(keyName,key);
  target.innerHTML = list.map(cardMarkup).join('') || '<div class="empty">' +
    (Ahlan.state.query || Ahlan.state.cityOnly || Ahlan.state.filter !== 'الكل' ? 'لا توجد نتائج بهذه الخيارات. جرّب تغيير البحث أو التصنيف أو عرض جميع المدن.' :
      experienceView() === 'saved' ? 'احفظ الأماكن اللي عجبتك من علامة القلب ♡' : experienceView() === 'plan' ? 'أضف مكانًا لخطتك من صفحة تفاصيله.' : 'لا توجد نتائج.') + '</div>';
  if (unknown.length) {
    const message = document.createElement('p'); message.className = 'section-note';
    message.textContent = 'توجد عناصر قديمة غير متاحة في الدليل الحالي. معرفاتها محفوظة دون حذف: ' + unknown.join('، '); target.append(message);
  }
  decorateBrandIcons(target);
}
function renderRealCards() {
  if (typeof isExplorePrototype === 'function' && isExplorePrototype()) { renderExplorePrototype(); return; }
  renderCards($('#cards'),'cards'); renderCityContext();
}
function renderCityContext() {
  const count = realExperiences.filter(item => cityMatches(item.city,Ahlan.state.city)).length;
  $('#cityContextText').textContent = count ? `الأماكن المتاحة في ${Ahlan.state.city}${Ahlan.state.city === 'القاهرة' ? ' والجيزة' : ''}: ${count}. تظهر أولًا؛ جميع المدن متاحة.` : `لا توجد تجارب موثقة في ${Ahlan.state.city} حاليًا. نعرض الأماكن المتاحة في بقية المدن.`;
  const button = $('#cityOnlyButton'); button.disabled = count === 0;
  button.setAttribute('aria-pressed',Ahlan.state.cityOnly);
  button.textContent = Ahlan.state.cityOnly ? 'عرض جميع المدن' : 'المدينة المختارة فقط';
  const galleryContext = $('#galleryContext');
  if (galleryContext) galleryContext.textContent = 'المدينة: ' + Ahlan.state.city + ' · البحث والتصنيف الحاليان يطبّقان على هذا المعرض.';
}
function toggleSave(id) {
  if (!allExperiences().some(x => x.id === id)) return;
  const values = Ahlan.data.saved.includes(id) ? Ahlan.data.saved.filter(x => x !== id) : [...Ahlan.data.saved,id];
  const persisted = saveData('saved',values); renderRealCards(); renderGalleryCards();
  announce(persisted ? 'تم تحديث المفضلة.' : 'تم تحديث المفضلة لهذه الجلسة فقط.');
  // Preserve keyboard focus after the affected card list is replaced.
  focusExperience(id, '.heart');
}
function addPlan(id) {
  if (!allExperiences().some(x => x.id === id)) return;
  const values = Ahlan.data.plan.includes(id) ? Ahlan.data.plan.filter(x => x !== id) : [...Ahlan.data.plan,id];
  const persisted = saveData('plan',values); closeModal(); renderRealCards(); renderGalleryCards();
  focusExperience(id, '.real-card-open');
  announce(persisted ? 'تم تحديث خطة رحلتك.' : 'تم تحديث الخطة لهذه الجلسة فقط.');
}
function focusExperience(id, control) {
  const exploring = typeof isExplorePrototype === 'function' && isExplorePrototype();
  const scope = exploring ? '#explorePrototype' : Ahlan.state.view === 'gallery' ? '#galleryCards' : '#home:not([hidden])';
  if (exploring) control = control === '.heart' ? '.xp-heart' : '.xp-place-open';
  const target = document.querySelector(`${scope} [data-card="${id}"] ${control}`) ||
    document.querySelector(`${scope} .real-card-open`) || document.querySelector('.nav [aria-current="page"]');
  target?.focus({preventScroll:true});
}
function detail(id) {
  const item = allExperiences().find(x => x.id === id); if (!item) return;
  const image = item.legacy ? `<img src="${realImage(item)}" alt="${esc(item.title)}">` : imageMarkup('experiences',item.file,item.title,{hero:true});
  modal(`${image}<h2>${esc(item.title)}</h2><p>⌖ ${esc(item.city)} · ${esc(item.cat)}</p><p>${esc(item.desc)}</p><div class="photo-credit">${credit(item)}${item.legacy ? '' : '<br>الصورة محفوظة بنسختها الفوتوغرافية؛ إطار العرض يقتصّ أطرافها حسب حجم الشاشة.'}</div>${item.legacy ? `<p>★ ${esc(item.rating)} · ${esc(item.loc)}</p><b>${esc(item.price)}</b><p>سعر وتقييم توضيحيان من النسخة السابقة.</p>` : '<p>راجع المصدر لمعرفة تفاصيل الزيارة الحالية. أسعار التذاكر وساعات العمل تختلف، ولا يتم الحجز داخل النموذج.</p>'}<div class="real-actions">${item.source ? `<a href="${esc(item.source)}" target="_blank" rel="noopener">معلومات المكان ↗</a>` : ''}<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.title + ' ' + item.city + ' مصر')}" target="_blank" rel="noopener">الموقع على الخريطة ↗</a></div><button class="yellow" aria-pressed="${Ahlan.data.plan.includes(id)}" onclick="addPlan(${id})">${brandIcon(Ahlan.data.plan.includes(id) ? 'trash' : 'plus','',{size:20})} ${Ahlan.data.plan.includes(id) ? 'إزالة من خطتي' : 'أضف إلى خطتي'}</button>`);
}
