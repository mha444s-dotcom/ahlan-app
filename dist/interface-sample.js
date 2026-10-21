'use strict';

// Presentation sample only: existing data, routes, save actions and image assets remain authoritative.
function renderSampleSection(meta) {
  const tourism = meta.index === 9, section = meta.content, active = Ahlan.state.group;
  const icons = tourism ? ['map','leisure','document'] : ['government','id-card','work','procedures'];
  const total = section.groups.reduce((sum, group) => sum + group.nodes.length, 0);
  const groups = section.groups.map((group,index) => `<button class="sample-group group-tone-${index} ${index === active ? 'selected' : ''}" ${index === active ? 'aria-current="true"' : ''} onclick="openContent(${meta.index},${index})">${brandIcon(icons[index],'',{size:48})}<span><strong>${esc(group.title)}</strong><small>${group.nodes.length} عناصر في الدليل</small></span><span class="sample-group-arrow" aria-hidden="true">←</span></button>`).join('');
  $('#sectionPage').innerHTML = `<button class="back" onclick="homeScreen()">→ الرئيسية</button>
    <div class="section-banner sample-banner">
      <div class="sample-banner-copy"><span class="panel-kicker">${tourism ? 'اكتشف مصر، على طريقتك' : 'دليلك للإقامة والحياة في مصر'}</span><div class="sample-banner-heading">${sectionIcon(meta.file)}<h1>${esc(section.title.replace(/^قسم /,''))}</h1></div><p>${esc(section.summary)}</p><div class="sample-meta"><span>${section.groups.length} مجموعات</span><span>${total} عنصرًا في الدليل</span></div><span class="muted">الرئيسية / ${esc(section.title.replace(/^قسم /,''))}</span></div>
      ${tourism ? '<div class="sample-banner-photo">' + imageMarkup('experiences','philae','معبد فيلة وسط النيل',{hero:true}) + '</div>' : ''}
    </div>
    ${tourism ? '<section class="tourism-discovery" aria-labelledby="tourismDiscoverTitle"><div class="sectionhead"><div><span class="panel-kicker">من الدليل الحالي</span><h2 id="tourismDiscoverTitle">أماكن تستحق المشوار</h2></div><button class="see-all" onclick="openExperienceGallery()">كل التجارب ←</button></div><p class="sample-intro">تعرّف على المكان، افتح موقعه، واحفظه لرحلتك. لا توجد حجوزات داخل التطبيق.</p><div class="sample-places">' + samplePlacesMarkup() + '</div></section>' : ''}
    <section class="sample-directory" aria-label="مجموعات القسم"><div class="sectionhead"><div><span class="panel-kicker">${tourism ? 'جهّز لرحلتك' : 'ابدأ من الخدمة التي تحتاجها'}</span><h2>${tourism ? 'دليل الزيارة' : 'اختر نوع الإجراء'}</h2></div></div><div class="sample-group-grid">${groups}</div></section>
    <div class="content-layout sample-content-layout"><aside class="section-menu" aria-label="في هذا القسم"><b>في هذا القسم</b>${section.groups.map((group,index) => `<button class="${index === active ? 'selected' : ''}" ${index === active ? 'aria-current="true"' : ''} onclick="openContent(${meta.index},${index})">${esc(group.title)}<span>←</span></button>`).join('')}</aside>
    <div class="content-body"><h2>${esc(section.groups[active].title)}</h2><label class="sample-content-search">${brandIcon('search','',{size:24})}<input id="sampleContentSearch" type="search" autocomplete="off" aria-label="ابحث داخل ${esc(section.groups[active].title)}" placeholder="ابحث داخل ${esc(section.groups[active].title)}"></label>${sampleBlockFilters(meta,active)}<p id="sampleSearchStatus" class="sample-search-status" role="status" aria-live="polite"></p>
    ${renderSampleGroup(meta,active)}<p id="sampleSearchEmpty" class="empty" hidden>لا توجد عناصر مطابقة في هذه المجموعة. جرّب كلمة أخرى أو اختر مجموعة مختلفة.</p>
    ${relatedTopics(meta)}<div class="section-note">${tourism ? 'هذا نموذج تفاعلي. أسماء الجهات والخدمات أمثلة من تصور المنصة، ولا تعني وجود شراكة أو توافر خدمة فعلية.' : 'محتوى الإجراءات هيكل إرشادي؛ الشروط والرسوم والمدد الواردة تحتاج إلى تحقق رسمي حسب الجنسية والحالة قبل الاعتماد عليها.'}</div></div></div>`;
  setupSampleSearch(meta,active);
}

function sampleBlockFilters(meta, groupIndex) {
  if (meta.index !== 0 || groupIndex > 1) return '';
  const blocks = groupNodes(meta.content.groups[groupIndex].nodes);
  return '<div class="sample-block-filters" role="group" aria-label="تصفية محتوى المجموعة"><button type="button" data-block-filter="all" aria-pressed="true">الكل</button>' + blocks.map((nodes,index) => `<button type="button" data-block-filter="${index}" aria-pressed="false">${esc(nodes[0].text.replace(/:$/,''))}</button>`).join('') + '</div>';
}

function setupSampleSearch(meta, groupIndex) {
  // Filter the original node text; action labels and explanatory UI copy are not search data.
  const source = groupNodes(meta.content.groups[groupIndex].nodes);
  let filter = 'all', previousOpen = null;
  const apply = () => {
    const query = normalizeSearch($('#sampleContentSearch').value), blocks = [...document.querySelectorAll('#sectionPage .topic-stack > article')];
    const disclosures = [...document.querySelectorAll('#sectionPage .topic-stack details')];
    if (query && !previousOpen) previousOpen = new Map(disclosures.map(item => [item,item.open]));
    if (!query && previousOpen) { previousOpen.forEach((open,item) => item.open = open); previousOpen = null; }
    let count = 0;
    blocks.forEach((block,index) => {
      const nodes = source[index], titleMatches = normalizeSearch(nodes[0].text).includes(query);
      const matches = (filter === 'all' || Number(filter) === index) && (!query || nodes.some(node => normalizeSearch(node.text).includes(query)));
      block.hidden = !matches;
      if (matches) {
        count++;
        if (query) block.querySelectorAll('details').forEach(item => item.open = true);
      }
      block.querySelectorAll('[data-type-text]').forEach(item => item.hidden = Boolean(query && !titleMatches && !normalizeSearch(item.dataset.typeText).includes(query)));
    });
    $('#sampleSearchEmpty').hidden = count > 0;
    $('#sampleSearchStatus').textContent = query || filter !== 'all' ? `${count} من ${blocks.length} ${meta.index === 0 ? 'مجموعات محتوى' : 'عناصر'}` : '';
  };
  $('#sampleContentSearch').addEventListener('input',apply);
  document.querySelectorAll('[data-block-filter]').forEach(button => button.addEventListener('click',() => {
    filter = button.dataset.blockFilter;
    document.querySelectorAll('[data-block-filter]').forEach(item => item.setAttribute('aria-pressed',item === button));
    apply();
  }));
}

function governmentTypeIcon(text) {
  return text.includes('سياح') ? 'tourism' : text.includes('دراس') || text.includes('طلابي') ? 'education' :
    text.includes('علاج') ? 'health' : text.includes('استثمار') ? 'office' : text.includes('عائلي') ? 'community' : text.includes('عمل') ? 'work' : 'id-card';
}
function renderGovernmentGroup(meta,groupIndex,blocks,saveButton) {
  const icons = ['government','document','id-card','traffic','office','shield'];
  return `<div class="topic-stack sample-government government-group-${groupIndex}">` + blocks.map((nodes,index) => {
    const title = nodes[0].text.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'').replace(/:$/,'').trim();
    if (groupIndex < 2 && index === 0) {
      return `<article class="topic-block gov-types"><div class="gov-module-heading"><span>${brandIcon('procedures','',{size:32})}</span><h3>${esc(title)}</h3><small>${nodes.length - 1} أنواع</small></div><div class="gov-type-grid">` + nodes.slice(1).map((node,typeIndex) => `<button class="gov-type" data-type-text="${esc(node.text)}" onclick="openGovernmentType(${groupIndex},${typeIndex + 1})">${brandIcon(governmentTypeIcon(node.text),'',{size:36})}<strong>${esc(node.text)}</strong><small>عرض المتاح ←</small></button>`).join('') + `</div><div class="gov-module-actions">${saveButton(index)}</div></article>`;
    }
    const icon = groupIndex === 3 ? icons[index] : groupIndex === 2 ? ['law','document','plan','calendar','shield'][index] : 'document';
    const content = nodes.length > 1 ? '<div class="gov-field-list">' + nodes.slice(1).map(node => '<span>' + esc(node.text) + '</span>').join('') + '</div>' : '<p class="gov-missing-data">المتاح حاليًا عنوان هذا البند فقط؛ لم تُضف تفاصيله إلى الدليل.</p>';
    return `<article class="topic-block gov-module"><details class="gov-accordion"><summary>${brandIcon(icon,'',{size:32})}<span><strong>${esc(title)}</strong><small>${nodes.length > 1 ? nodes.length - 1 + ' بنود في الدليل' : 'عنوان دون تفاصيل'}</small></span><span class="gov-expand" aria-hidden="true">+</span></summary><div class="gov-accordion-body">${content}${nodes.length > 1 ? '<p class="gov-availability">هذه عناوين واردة في المحتوى الحالي؛ لا تتضمن شروطًا أو رسومًا أو خطوات موثقة.</p>' : ''}${saveButton(index)}</div></details></article>`;
  }).join('') + '</div>';
}

function openGovernmentType(groupIndex,nodeIndex) {
  if (![0,1].includes(groupIndex)) return;
  const node = groupNodes(appContent[0].groups[groupIndex].nodes)[0]?.[nodeIndex];
  if (!node || nodeIndex < 1) return;
  modal(`<div class="gov-type-detail">${sectionIcon(governmentTypeIcon(node.text))}<span class="panel-kicker">${esc(appContent[0].groups[groupIndex].title)}</span><h2>${esc(node.text)}</h2><p>هذا النوع موجود في الدليل الحالي. لا تتوفر له بيانات تفصيلية موثقة عن الشروط أو المستندات أو الرسوم أو المدة.</p><p class="section-note">معلومات تحتاج إلى تحقق رسمي حسب الجنسية والحالة. لا يمكن التقديم أو إجراء معاملة داخل التطبيق.</p><button class="yellow" onclick="saveGovernmentType(${groupIndex},${nodeIndex})">${brandIcon('heart','',{size:20})} حفظ هذا النوع</button></div>`);
}
function saveGovernmentType(groupIndex,nodeIndex) {
  if (![0,1].includes(groupIndex)) return;
  const group = appContent[0].groups[groupIndex], node = groupNodes(group.nodes)[0]?.[nodeIndex];
  if (node && nodeIndex > 0) saveInterestLabel(appContent[0].title + ' / ' + group.title + ' / ' + node.text);
}

function renderSampleGroup(meta, groupIndex) {
  const blocks = groupNodes(meta.content.groups[groupIndex].nodes);
  const plain = text => text.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu,'').trim();
  const saveButton = index => `<button class="save-topic" onclick="saveContent(${meta.index},${groupIndex},${index})">${brandIcon('heart','',{size:18})} حفظ للرجوع إليه</button>`;
  if (meta.index === 9) {
    const kind = ['cities','activities','practical'][groupIndex];
    const activityIcons = ['diving','desert','sailboat','balloon','heritage'];
    const practicalIcons = ['calendar','money','procedures','support'];
    return `<div class="topic-stack sample-${kind}">` + blocks.map((nodes,index) => {
      const text = plain(nodes[0].text);
      if (groupIndex === 0) {
        const separator = text.indexOf(':'), city = separator < 0 ? text : text.slice(0,separator), description = separator < 0 ? '' : text.slice(separator + 1).trim();
        // Only photos with a matching city in the existing, credited catalogue are used.
        const place = realExperiences.find(item => item.city === city);
        const media = place ? `<div class="sample-city-photo">${imageMarkup('experiences',place.file,place.title)}</div>` : `<div class="sample-city-symbol">${brandIcon('map','',{size:48})}</div>`;
        return `<article class="topic-block sample-city">${media}<div class="sample-city-copy"><h3>${esc(city)}</h3>${description ? '<p>' + esc(description) + '</p>' : ''}${saveButton(index)}${place ? '<div class="photo-credit">' + credit(place) + '</div>' : ''}</div></article>`;
      }
      const icon = groupIndex === 1 ? activityIcons[index] : practicalIcons[index];
      return `<article class="topic-block sample-${groupIndex === 1 ? 'activity' : 'practical-item'}"><span class="sample-topic-icon">${brandIcon(icon,'',{size:48})}</span><div><h3>${esc(text)}</h3>${saveButton(index)}</div></article>`;
    }).join('') + '</div>';
  }
  return renderGovernmentGroup(meta,groupIndex,blocks,saveButton);
}

function samplePlacesMarkup() {
  return realExperiences.map(item => {
    const saved = Ahlan.data.saved.includes(item.id);
    return `<article class="card real-card sample-place" data-card="${item.id}"><button class="real-card-open" aria-label="عرض تفاصيل ${esc(item.title)}" onclick="detail(${item.id})"><div class="photo">${imageMarkup('experiences',item.file,item.title)}<span class="sample-place-link" aria-hidden="true">${brandIcon('arrow','flip-icon',{size:18})}</span></div><span class="badge">${esc(item.tag)}</span><h3>${esc(item.title)}</h3><p>⌖ ${esc(item.city)} · ${esc(item.cat)}</p><p class="sample-place-description">${esc(item.desc)}</p></button><button class="heart" aria-label="${saved ? 'إلغاء حفظ' : 'حفظ'} ${esc(item.title)}" aria-pressed="${saved}" onclick="toggleSampleSave(${item.id})">${brandIcon(saved ? 'heart-filled' : 'heart','',{size:22})}</button><div class="photo-credit">${credit(item)}</div></article>`;
  }).join('');
}
function toggleSampleSave(id) {
  toggleSave(id);
  const places = document.querySelector('#sectionPage .sample-places');
  if (!places) return;
  places.innerHTML = samplePlacesMarkup();
  decorateBrandIcons(places);
  places.querySelector(`[data-card="${id}"] .heart`)?.focus({preventScroll:true});
}
