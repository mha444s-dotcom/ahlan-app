'use strict';

// Generated asset names are a closed, trusted registry. Never interpolate user input in an asset URL.
const brandIconRegistry = Object.freeze({
  "home": "الرئيسية",
  "nearby": "قريب منك",
  "heart": "إضافة للمفضلة",
  "heart-filled": "عنصر محفوظ في المفضلة",
  "plan": "خطتي",
  "profile": "حسابي",
  "search": "البحث",
  "location": "الموقع والمدينة",
  "language": "اختيار اللغة",
  "assistant": "مساعد أهلاً الذكي",
  "emergency": "الطوارئ",
  "arrow": "الانتقال والرجوع",
  "external": "رابط خارجي",
  "close": "إغلاق",
  "plus": "إضافة",
  "check": "تأكيد",
  "star": "تقييم",
  "egypt": "مصر",
  "document": "المستندات",
  "phone": "اتصال",
  "shield": "الثقة والأمان",
  "bell": "التذكيرات",
  "edit": "تعديل",
  "trash": "حذف",
  "support": "مساعدة شخصية",
  "wave": "ترحيب",
  "procedures": "الإجراءات والتأشيرات",
  "housing": "السكن",
  "education": "الدراسة والتعليم",
  "work": "العمل",
  "health": "الصحة والعلاج",
  "transport": "المواصلات والتنقل",
  "daily": "الخدمات اليومية",
  "community": "المجتمع والتواصل",
  "map": "الخريطة والأماكن",
  "tourism": "السياحة والتجارب",
  "translation": "الترجمة واللغات",
  "government": "الجهات الحكومية والجوازات",
  "embassy": "السفارات",
  "heritage": "الجولات الأثرية",
  "id-card": "الأحوال المدنية",
  "traffic": "المرور والسيارات",
  "office": "المكاتب والمؤسسات",
  "clock": "المواعيد وساعات العمل",
  "money": "الرسوم والأسعار والدخل",
  "website": "المواقع الرسمية",
  "law": "القوانين",
  "camera": "الصور",
  "metro": "المترو والمواصلات القريبة",
  "shopping": "السوبر ماركت والمتاجر",
  "books": "التخصصات والدراسة",
  "calendar": "التواريخ والتقديم ومدة العقد",
  "target": "الاستعداد للاختبارات والمقابلات",
  "gift": "المزايا",
  "ambulance": "الإسعاف",
  "hospital": "المستشفيات والرعاية الصحية",
  "medical": "الرعاية الطبية",
  "tooth": "طب الأسنان",
  "laundry": "الغسيل والمغاسل",
  "cleaning": "التنظيف",
  "tools": "الصيانة والكهرباء والسباكة",
  "moving": "نقل الأثاث",
  "cooling": "التكييف",
  "food-delivery": "توصيل الطعام",
  "parcel": "الشحن والطرود",
  "cinema": "السينما",
  "leisure": "مراكز الترفيه",
  "fitness": "الجيم واللياقة",
  "theatre": "المسرح",
  "university": "الجامعات والمعاهد",
  "bank": "البنوك",
  "restaurant": "المطاعم",
  "coffee": "المقاهي",
  "hotel": "الفنادق",
  "fuel": "محطات الوقود",
  "police": "الشرطة وشرطة السياحة",
  "diving": "الغوص",
  "desert": "الرحلات الصحراوية",
  "sailboat": "الرحلات النيلية",
  "balloon": "رحلات البالون",
  "firetruck": "الإطفاء",
  "saved-folder": "العناصر المحفوظة",
  "stats": "الإحصائيات",
  "notary": "الشهر العقاري والتوثيق",
  "work-permit": "تصاريح العمل",
  "night-clinic": "الرعاية والطوارئ الليلية"
});
function brandIcon(name, extra = '', {size = 22, legacy = false, sizes = ''} = {}) {
  if (legacy) {
    // Service carousel controls are part of the protected, unchanged home section.
    return `<img class="brand-icon ${extra}" src="assets/icons/${name}.svg" alt="" aria-hidden="true" draggable="false">`;
  }
  if (!Object.hasOwn(brandIconRegistry, name)) return '';
  const pixels = Number.isFinite(size) ? Math.max(12, Math.min(128, Math.round(size))) : 22;
  const classes = String(extra).split(/\s+/).filter(token => ['flip-icon','rotate-down','section-symbol'].includes(token)).join(' ');
  const responsive = sizes || pixels + 'px';
  return `<img class="brand-icon ${classes}" data-icon="${name}" src="assets/ahlan-ui-icons/64/${name}.webp" srcset="assets/ahlan-ui-icons/32/${name}.webp 32w, assets/ahlan-ui-icons/64/${name}.webp 64w, assets/ahlan-ui-icons/128/${name}.webp 128w, assets/ahlan-ui-icons/256/${name}.webp 256w" sizes="${responsive}" width="${pixels}" height="${pixels}" alt="" aria-hidden="true" draggable="false" decoding="async">`;
}
function sectionIcon(name) {
  return `<div class="section-art section-icon-tile">${brandIcon(name, 'section-symbol', {size:64, sizes:'(min-width: 768px) 80px, 64px'})}</div>`;
}
const iconTokens = Object.freeze({
  '♡':'heart','♥':'heart-filled','⌕':'search','⌖':'location','☺':'profile','☻':'profile',
  '◉':'home','♧':'nearby','▤':'plan','✦':'assistant','★':'star','→':'arrow','←':'arrow',
  '↖':'external','↗':'external','＋':'plus','×':'close','﹀':'chevron','⌄':'chevron',
  '✓':'check','✅':'check','🚨':'emergency','🇪🇬':'egypt','👋':'wave','🛡️':'shield','🔔':'bell',
  '📝':'document','📄':'document','📋':'document','📞':'phone','📍':'location','🏠':'housing','🛏️':'housing',
  '🛂':'procedures','💼':'work','🛍️':'daily','🚕':'transport','👤':'profile',
  
  "🏛️": "heritage",
  "💍": "id-card",
  "🚗": "traffic",
  "🏢": "office",
  "⏰": "clock",
  "🕐": "clock",
  "💰": "money",
  "🌐": "website",
  "⚖️": "law",
  "📸": "camera",
  "🚇": "metro",
  "🛒": "shopping",
  "📚": "books",
  "📅": "calendar",
  "🎯": "target",
  "🎁": "gift",
  "🚑": "ambulance",
  "🏥": "hospital",
  "🩺": "medical",
  "🦷": "tooth",
  "🧺": "laundry",
  "🧹": "cleaning",
  "🔧": "tools",
  "🚚": "moving",
  "❄️": "cooling",
  "🍔": "food-delivery",
  "📦": "parcel",
  "🎬": "cinema",
  "🎳": "leisure",
  "🏋️": "fitness",
  "🎭": "theatre",
  "🎓": "university",
  "🏦": "bank",
  "🍽️": "restaurant",
  "☕": "coffee",
  "🏨": "hotel",
  "⛽": "fuel",
  "🚓": "police",
  "👮": "police",
  "🏊": "diving",
  "🐪": "desert",
  "⛵": "sailboat",
  "🎈": "balloon",
  "🚒": "firetruck",
  "💾": "saved-folder",
  "📊": "stats",
  "🗺️": "map",
  "💬": "community",
  "⭐": "star"

});
const iconPattern = new RegExp(Object.keys(iconTokens).sort((a,b) => b.length - a.length)
  .map(token => token.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'gu');
function semanticIcon(token, text, parent) {
  if (token === '📋') return /الشهر العقاري/.test(text) ? 'notary' : /تصاريح العمل/.test(text) ? 'work-permit' : 'document';
  if (token === '🩺' && /ليل/.test(text)) return 'night-clinic';
  if ((token === '📄' || token === '📝') && /ترجم/.test(text)) return 'translation';
  if (token === '🏛️') return /سفارات?/.test(text) ? 'embassy' : /جولات|أثري|أثرية|معابد/.test(text) ? 'heritage' : 'government';
  if (token === '🌐') return /لغة|اللغة|لغات/.test(text) ? 'language' : 'website';
  if (token === '💬') return /ترجم/.test(text) || parent.closest('.dictionary') ? 'translation' : 'community';
  return iconTokens[token];
}
function decorateBrandIcons(root) {
  if (!root || root.nodeType !== 1) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement.closest('script,style,textarea,input,.brand-icon,.brand-replaced,.photo-credit,#interestList,#reminderList') ?
        NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  for (const textNode of nodes) {
    const text = textNode.nodeValue;
    iconPattern.lastIndex = 0;
    if (!iconPattern.test(text)) continue;
    iconPattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of text.matchAll(iconPattern)) {
      fragment.append(document.createTextNode(text.slice(last,match.index)));
      const token = match[0];
      const key = semanticIcon(token, text, textNode.parentElement);
      const span = document.createElement('span'); span.className = 'brand-replaced';
      const legacy = Boolean(textNode.parentElement.closest('#services,.carousel-controls'));
      // Internal galleries use navigation arrows; only real external links use the external-link icon.
      const internal = key === 'external' && textNode.parentElement.closest('.see-all');
      const name = key === 'chevron' || internal ? 'arrow' : key;
      const extra = key === 'chevron' ? 'rotate-down' : token === '←' || internal || token === '↖' ? 'flip-icon' : '';
      span.innerHTML = brandIcon(name, extra, {legacy});
      fragment.append(span); last = match.index + token.length;
    }
    fragment.append(document.createTextNode(text.slice(last))); textNode.replaceWith(fragment);
  }
}
function setupBrandIcons() {
  const names = {home:'home',map:'nearby',saved:'heart',plan:'plan',profile:'profile'};
  const labels = {home:'الرئيسية',map:'قريب منك',saved:'المفضلة',plan:'خطتي',profile:'حسابي'};
  document.querySelectorAll('[data-nav]').forEach(button => {
    const key = button.dataset.nav;
    button.innerHTML = brandIcon(names[key], '', {size:24, sizes:'(min-width: 768px) 22px, 24px'}) + '<span class="nav-label">' + labels[key] + '</span>';
  });
  $('.search>span').innerHTML = brandIcon('search');
  $('.avatar').innerHTML = brandIcon('profile', '', {size:24});
  $('.assist .symbol').innerHTML = brandIcon('assistant', '', {size:40});
}
