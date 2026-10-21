// Extracted from the approved Discover page. Preserve source content and behavior.
export function installView(env, data) {
const {document,window,history,location,localStorage,requestAnimationFrame,cancelAnimationFrame,setTimeout,clearTimeout,matchMedia,IntersectionObserver,ResizeObserver,performance,getComputedStyle,fetch,alert,devicePixelRatio,queueMicrotask,Event} = env;
const assetURL = env.assetURL;
const {photo,entries,add,tourism,featured,eras,ancient,greek,coptic,islam,dynasties,dynastiesDetails,modern,culture,regions,experiences,heritageRecords,heritageFallback,heritageCategories,eraVisuals,eraArtifacts,timeScenes} = data;
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function tile(d,cls='',label='',imgOverride=null){let painted=['bg-violet','bg-mint','bg-sand','bg-navy','bg-wine'].some(x=>cls.includes(x));return `<button type="button" data-open="${esc(d.id)}" class="card ${esc(cls)}">${painted?`<img class="art" loading="lazy" src="${esc(imgOverride||d.image)}" alt="">`:`<img class="back" loading="lazy" src="${esc(imgOverride||d.image)}" alt="">`}<span class="ctitle">${esc(d.title)}</span>${label?`<span class="csub">${esc(label)}</span>`:''}</button>`}
function placeCard(d){return `<article class="rail-card" data-open="${esc(d.id)}" role="button" tabindex="0"><div class="rail-photo"><img loading="lazy" src="${esc(d.image)}" alt=""><button class="fav" type="button" data-fav="${esc(d.id)}" aria-label="حفظ ${esc(d.title)}" aria-pressed="false">♡</button><span class="float-info">${esc(d.category)}</span></div><h3>${esc(d.title)}</h3><p>${esc(d.description.slice(0,75))}${d.description.length>75?'…':''}</p><div class="small-accent">✦ من حكايات مصر</div></article>`}
function el(id){return document.getElementById(id)}
el('tourism-mosaic').innerHTML=tourism.map((d,i)=>tile(d,i===2?'bg-wine':i===5?'bg-mint':'',i===0?'رحلات عبر التاريخ':'')).join('');
el('featured-rail').innerHTML=featured.map(placeCard).join('');

// Self-contained heritage gallery. Only adds its own items to existing details/search index.



for(const h of heritageRecords){add(h.id,h.title,h.category,`${h.description} الموقع: ${h.city}.`,heritageFallback[h.category]||photo.pyramids,[h.city,h.category,'الحضارة المصرية']);}
const heritageIcons=[assetURL("assets/55af2137a171873bc2e1dbdfd550caf286be4cae150a8124c26d2820a687eaa5.webp"),assetURL("assets/db201432ebb181cc4063cee249050ac69667c70f575179caa9d75b83eebf0068.webp"),assetURL("assets/78d356e3b49ae9e3b3afedf20a38e3b0be45e9ba64911858548651240c6042a1.webp"),assetURL("assets/144e721e89d265d69a4760e292ab7530bdd48a4a381ec56ee0b82aad22a23df2.webp"),assetURL("assets/b3b98c770433f26b000019aab9bd0de9924ee0d814b099ff517b080d0bbcbc06.webp"),assetURL("assets/91a249eea1ffd00a8c47807e984ff6aed67985b0fa210eef32aa83e87118563c.webp"),assetURL("assets/6d0175e2d85683fd11986427109753998bdce848314c345ad31934fd01c6c799.webp"),assetURL("assets/1ccf6b1ffd2fa37dabee3645d78952cedd139650ace3a9a617ade40d709a453d.webp"),assetURL("assets/69fad2171101a1f1ab9f70b51d3b5ebc1b70582efb7df747046141e04ac5a0e3.webp")].map((src,i)=>'<img class="heritage-category-art" loading="lazy" decoding="async" src="'+src+'" alt="">');
let heritageHomeCategory=heritageCategories[1];
const heritageCategoriesEl=el('heritage-categories');
heritageCategoriesEl.innerHTML=heritageCategories.slice(1).map((c,i)=>`<button type="button" class="heritage-category ${c===heritageHomeCategory?'selected':''}" aria-pressed="${c===heritageHomeCategory}" data-heritage-entry="${esc(c)}"><span aria-hidden="true" class="heritage-category-icon">${heritageIcons[i]}</span><span class="heritage-category-name">${esc(c)}</span><span class="heritage-category-count">${heritageRecords.filter(h=>h.category===c).length} عنصرًا</span></button>`).join('');
function heritageRenderHome(){
 const chosen=heritageRecords.filter(h=>h.category===heritageHomeCategory).slice(0,4);
 heritageCategoriesEl.querySelectorAll('[data-heritage-entry]').forEach(b=>{let active=b.dataset.heritageEntry===heritageHomeCategory;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
 el('heritage-preview-title').textContent='من مجموعة «'+heritageHomeCategory+'»';
 el('heritage-preview-caption').textContent='معاينة مختصرة · '+heritageRecords.filter(h=>h.category===heritageHomeCategory).length+' عنصرًا بالمجموعة';
 el('heritage-open-all').textContent='شاهد المجموعة كاملة ←';
 el('heritage-preview').innerHTML=chosen.map(h=>`<button type="button" class="heritage-preview-card" data-open="${esc(h.id)}"><img loading="lazy" alt="${esc(h.title)}" src="${esc(entries[h.id].image)}" data-heritage-wiki="${esc(h.wiki)}"><span class="heritage-preview-label"><strong>${esc(h.title)}</strong><small>${esc(h.city)}</small></span></button>`).join('');
 heritageLoadImages();
}
let heritageActive='الكل';let heritageQuery='';let heritageExpanded=false;
// Move the full gallery into its own fixed-screen view, outside the homepage sections.
const heritageFullScreen=el('heritage-full');
const heritageHeader=heritageFullScreen.querySelector('.heritage-full-heading');
const heritageInner=document.createElement('div');heritageInner.className='heritage-screen-inner';
while(heritageHeader.nextSibling)heritageInner.appendChild(heritageHeader.nextSibling);
heritageFullScreen.appendChild(heritageInner);document.body.appendChild(heritageFullScreen);
let heritageReturnFocus=null;
function heritageHide(fromHistory=false){if(!heritageExpanded)return;heritageExpanded=false;heritageFullScreen.hidden=true;document.body.classList.remove('heritage-screen-open');el('heritage-open-all').setAttribute('aria-expanded','false');if(!fromHistory&&history.state?.heritageScreen)history.back();else if(heritageReturnFocus&&heritageReturnFocus.isConnected)heritageReturnFocus.focus({preventScroll:true});}
window.addEventListener('popstate',()=>{if(heritageExpanded&&!history.state?.heritageScreen)heritageHide(true)});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&heritageExpanded&&!document.querySelector('dialog[open]'))heritageHide()});
function heritageShow(category='الكل'){
 heritageReturnFocus=document.activeElement;heritageActive=category;heritageExpanded=true;heritageFullScreen.hidden=false;document.body.classList.add('heritage-screen-open');el('heritage-open-all').setAttribute('aria-expanded','true');heritageRender();heritageFullScreen.scrollTop=0;heritageFullScreen.querySelector('.heritage-close').focus({preventScroll:true});if(!history.state?.heritageScreen)history.pushState({...history.state,heritageScreen:true},'',location.href);
}
heritageCategoriesEl.addEventListener('click',e=>{const b=e.target.closest('[data-heritage-entry]');if(!b)return;heritageHomeCategory=b.dataset.heritageEntry;heritageRenderHome();});
el('heritage-slide-prev').addEventListener('click',()=>heritageCategoriesEl.scrollBy({left:240,behavior:'smooth'}));
el('heritage-slide-next').addEventListener('click',()=>heritageCategoriesEl.scrollBy({left:-240,behavior:'smooth'}));
el('heritage-open-all').addEventListener('click',()=>heritageShow(heritageHomeCategory));
el('heritage-close').addEventListener('click',()=>heritageHide());
function heritageRender(){
 const filters=el('heritage-filters');filters.innerHTML=heritageCategories.map(c=>`<button type="button" data-heritage-cat="${esc(c)}" class="${c===heritageActive?'active':''}" aria-pressed="${c===heritageActive}">${esc(c)} <small>${c==='الكل'?heritageRecords.length:heritageRecords.filter(h=>h.category===c).length}</small></button>`).join('');
 const terms=heritageQuery.trim().toLocaleLowerCase('ar');
 const matches=heritageRecords.filter(h=>(heritageActive==='الكل'||h.category===heritageActive)&&(!terms||[h.title,h.city,h.description,h.category].join(' ').toLocaleLowerCase('ar').includes(terms)));
 el('heritage-count').textContent=`${matches.length} قطعة وموقع`;
 el('heritage-category-caption').textContent=heritageActive==='الكل'?'استكشف مجموعات المعرض':heritageActive;
 el('ancient-grid').innerHTML=matches.length?matches.map((h,i)=>`<button class="heritage-piece" type="button" data-open="${esc(h.id)}" aria-label="تفاصيل ${esc(h.title)}"><img loading="lazy" alt="${esc(h.title)}" src="${esc(entries[h.id].image)}" data-heritage-wiki="${esc(h.wiki)}"><span class="heritage-piece-number">${String(i+1).padStart(2,'0')} / ${String(matches.length).padStart(2,'0')}</span><span class="heritage-piece-content"><span class="heritage-piece-location">✦ ${esc(h.city)} · ${esc(h.category)}</span><strong class="heritage-piece-title">${esc(h.title)}</strong><span class="heritage-piece-description">${esc(h.description)}</span></span></button>`).join(''):'<div class="heritage-empty">مفيش نتائج مطابقة. جرّب اسم موقع أو محافظة تانية.</div>';
 heritageLoadImages();
}
function heritageLoadImages(){env.heritageImages.observe();}
el('heritage-filters').addEventListener('click',e=>{const b=e.target.closest('[data-heritage-cat]');if(!b)return;heritageActive=b.dataset.heritageCat;heritageRender()});
el('heritage-search').addEventListener('input',e=>{heritageQuery=e.target.value;heritageRender()});
env.heritageImages.prepare();
heritageRenderHome();

el('greco-grid').innerHTML=greek.map(d=>tile(d)).join('');
el('coptic-grid').innerHTML=coptic.map(d=>tile(d)).join('');
el('islam-grid').innerHTML=islam.map((d,i)=>tile(d,`islam-${i+1}`,i===0?'القاهرة التاريخية':'')).join('');
el('dynasties').innerHTML=dynasties.map(([title,years,id])=>`<button class="dynasty" data-dynasty="${id}"><b>${title}</b><small>${years}</small></button>`).join('');
// V11: curated chapter cards with distinct art direction, shared original entry IDs and data.
el('modern-grid').innerHTML=modern.map((d,i)=>`<button type="button" data-open="${esc(d.id)}" class="city-story-card city-story-${i+1}"><span class="city-story-photo"><img src="${esc(d.image)}" alt="" loading="lazy"></span><span class="city-story-index">CITY / 0${i+1}</span><span class="city-story-caption"><small>${esc(d.category)}</small><strong>${esc(d.title)}</strong><span>${esc(d.description.slice(0,88))}</span></span></button>`).join('');
const cultureTypes=['kitchen','crafts','arts','festivals'];
const cultureChapters=['النكهة','الصنعة','الصوت','الفرحة'];
el('culture-grid').innerHTML=culture.map((d,i)=>`<button type="button" data-open="${esc(d.id)}" class="culture-story culture-story-${cultureTypes[i]}"><span class="culture-card-ornament" aria-hidden="true">${['✹','❖','♫','✧'][i]}</span><span class="culture-story-photo"><img src="${esc(d.image)}" alt="" loading="lazy"></span><span class="culture-story-copy"><small>0${i+1} / ${cultureChapters[i]}</small><strong>${esc(d.title)}</strong><span>${esc(d.description.slice(0,90))}${d.description.length>90?'…':''}</span></span></button>`).join('');
el('regions-rail').innerHTML=regions.map(placeCard).join('');
el('experiences-grid').innerHTML=experiences.map(d=>tile(d)).join('');
// Visual vocabulary for each historical era: stylistic interpretations, not historical alphabets.


let currentEra=1;
el('timeline-rail').innerHTML=eras.map((e,i)=>{const v=eraVisuals[i];return `<button type="button" class="era-pill ${i===1?'active':''}" data-style="${v.id}" data-era="${i}" aria-pressed="${i===1}" aria-label="${esc(e.n)}، ${esc(e.y)}"><span class="era-number">${String(i+1).padStart(2,'0')}</span><span class="era-tile-art era-artefact" aria-hidden="true"><img loading="lazy" src="${esc(eraArtifacts[i].src)}" alt="" onerror="this.style.display='none'"><span class="era-artefact-fallback">${v.icon}</span></span><span class="era-artifact-name">${esc(eraArtifacts[i].label)}</span><span class="era-tile-copy"><span class="era-tile-date">${esc(e.y)}</span><strong>${esc(e.n)}</strong></span><span class="era-tile-indicator" aria-hidden="true"></span></button>`}).join('');
function changeEra(i, scrollToCard=false){
 if(!Number.isInteger(i)||i<0||i>=eras.length)return;
 currentEra=i;const e=eras[i],v=eraVisuals[i];
 const spot=el('era-spotlight');spot.dataset.eraStyle=v.id;
 el('era-period').textContent=e.y;el('era-name').textContent=e.n;
 el('era-latin').textContent=v.latin;el('era-display-seal').textContent=String(i+1).padStart(2,'0');
 el('era-description').textContent=e.d;
 const scenePhoto=el('era-image');scenePhoto.style.display='';scenePhoto.onerror=()=>{scenePhoto.onerror=null;scenePhoto.src=e.img};scenePhoto.src=eraArtifacts[i].src;
 const objectPhoto=el('era-object-image');objectPhoto.style.display='';objectPhoto.src=eraArtifacts[i].src;
 el('era-object-label').textContent=eraArtifacts[i].label;
 el('era-image').alt='رمز بصري: '+eraArtifacts[i].label;
 el('era-highlights').innerHTML=e.t.map(s=>`<span>${esc(s)}</span>`).join('');
 el('era-picture-mark').textContent=v.motif;el('era-picture-caption').textContent=v.caption;
 el('era-deep-link').href=v.link;
 el('era-count').textContent=String(i+1).padStart(2,'0');
 el('era-progress').style.width=((i+1)/eras.length*100)+'%';
 document.querySelectorAll('.era-pill').forEach((b,n)=>{b.classList.toggle('active',n===i);b.setAttribute('aria-pressed',String(n===i))});
 if(scrollToCard)document.querySelectorAll('.era-pill')[i]?.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
}
changeEra(1);
el('era-prev').addEventListener('click',()=>changeEra((currentEra+eras.length-1)%eras.length,true));
el('era-next').addEventListener('click',()=>changeEra((currentEra+1)%eras.length,true));

// Interactive transition: Khedival Cairo ↔ contemporary Egyptian cities.
const timeGateway=el('time-gateway');

function changeTimeView(mode){
 if(!timeGateway||!timeScenes[mode])return;
 const d=timeScenes[mode];timeGateway.dataset.scene=mode;
 el('time-date').textContent=d.date;el('time-overline').textContent=d.eyebrow;
 el('time-title').innerHTML=d.title;el('time-description').textContent=d.description;
 timeGateway.querySelector('.time-detail').dataset.open=d.entry;
 document.querySelectorAll('[data-time-choice]').forEach(b=>{const on=b.dataset.timeChoice===mode;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});
}
document.querySelectorAll('[data-time-choice]').forEach(b=>b.addEventListener('click',()=>changeTimeView(b.dataset.timeChoice)));
let favSet;try{favSet=new Set(JSON.parse(localStorage.getItem('ahlan-v2-favorites')||'[]'))}catch{favSet=new Set()}
function refreshFavs(){document.querySelectorAll('[data-fav]').forEach(b=>{let saved=favSet.has(b.dataset.fav);b.classList.toggle('is-saved',saved);b.textContent=saved?'♥':'♡';b.setAttribute('aria-pressed',String(saved))});el('favorite-count').textContent=favSet.size;el('favorite-count').hidden=favSet.size===0}
function toggleFav(id){if(favSet.has(id))favSet.delete(id);else favSet.add(id);try{localStorage.setItem('ahlan-v2-favorites',JSON.stringify([...favSet]))}catch{}refreshFavs()}
refreshFavs();
function openEntry(id){const d=entries[id];if(!d)return;el('dialog-visual').innerHTML=`<img src="${esc(d.image)}" alt="">`;el('dialog-category').textContent=d.category;el('dialog-title').textContent=d.title;el('dialog-text').textContent=d.description;el('dialog-hints').innerHTML=d.tags.map(t=>`<span>${esc(t)}</span>`).join('');el('info-dialog').showModal()}
function openDynasty(id){let found=dynasties.find(x=>x[2]===id);if(!found)return;el('dialog-visual').innerHTML='<div style="height:100%;display:grid;place-items:center;background:linear-gradient(135deg,#4f1e2a,#231717);font-size:85px;color:#efb980">۞</div>';el('dialog-category').textContent=found[1];el('dialog-title').textContent=found[0];el('dialog-text').textContent=dynastiesDetails[id];el('dialog-hints').innerHTML='<span>تاريخ مصر الإسلامية</span><span>ملخص استكشافي</span>';el('info-dialog').showModal()}
function showFavorites(){const items=[...favSet].map(id=>entries[id]).filter(Boolean);el('favorites-list').innerHTML=items.length?items.map(x=>`<button class="result" data-open="${esc(x.id)}"><b>${esc(x.title)}</b><span>${esc(x.category)}</span></button>`).join(''):'<p class="emptyfav">لسه ما حفظتش أماكن. اضغط على القلب الموجود على كروت الأماكن عشان تضيفها هنا.</p>';el('favorites-dialog').showModal()}
function closeDlg(dlg){dlg.close()}
el('close-dialog').addEventListener('click',()=>closeDlg(el('info-dialog')));el('close-favorites').addEventListener('click',()=>closeDlg(el('favorites-dialog')));el('favorites-open').addEventListener('click',showFavorites);el('mobile-favorites').addEventListener('click',showFavorites);el('guide-favorites').addEventListener('click',showFavorites);
document.addEventListener('click',e=>{const fav=e.target.closest('[data-fav]');if(fav){e.stopPropagation();toggleFav(fav.dataset.fav);return}const era=e.target.closest('[data-era]');if(era){changeEra(Number(era.dataset.era));return}const dyn=e.target.closest('[data-dynasty]');if(dyn){openDynasty(dyn.dataset.dynasty);return}const link=e.target.closest('[data-open]');if(link){openEntry(link.dataset.open);return}const jump=e.target.closest('[data-jump]');if(jump){el(jump.dataset.jump)?.scrollIntoView({behavior:'smooth'});return}const scroll=e.target.closest('[data-scroll]');if(scroll){el(scroll.dataset.scroll)?.scrollBy({left:document.dir==='rtl'?-330:330,behavior:'smooth'});return}if(e.target.closest('[data-demo]')){e.preventDefault();alert('هذا النموذج يعرض صفحة «اكتشف مصر» فقط. القسمان الآخران موجودان في التطبيق الأصلي.') }});
document.addEventListener('keydown',e=>{let target=e.target.closest('[data-open][role=button]');if(target&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openEntry(target.dataset.open)}});
const search=el('global-search');function runSearch(q){const val=q.trim().toLocaleLowerCase('ar');const panel=el('search-results');if(!val){panel.classList.remove('visible');return}const matches=Object.values(entries).filter(x=>[x.title,x.category,x.description,...x.tags].join(' ').toLocaleLowerCase('ar').includes(val)).slice(0,16);panel.classList.add('visible');el('search-heading').textContent=`${matches.length} نتيجة ${matches.length===16?'أولى':''} عن «${q}»`;el('results-grid').innerHTML=matches.length?matches.map(d=>`<button class="result" data-open="${esc(d.id)}"><b>${esc(d.title)}</b><span>${esc(d.category)}</span></button>`).join(''):'<p class="search-empty">مفيش نتائج مطابقة في النموذج الحالي. جرّب مثلًا: فرعوني، القاهرة، البحر، مملوكي، نوبة، أو العاصمة.</p>'}
search.addEventListener('input',e=>runSearch(e.target.value));el('clear-search').addEventListener('click',()=>{search.value='';runSearch('');search.focus()});
if('IntersectionObserver'in window&&!matchMedia('(prefers-reduced-motion: reduce)').matches){document.body.classList.add('js-enhanced');const io=new IntersectionObserver(es=>{es.forEach(x=>{if(x.isIntersecting){x.target.classList.add('shown');io.unobserve(x.target)}})},{threshold:.04});document.querySelectorAll('.reveal').forEach(x=>io.observe(x))}
// If a remote placeholder fails, use a local gradient fallback instead of a broken image icon.
document.addEventListener('error',e=>{const img=e.target;if(img?.tagName==='IMG'){img.style.opacity='0';const p=img.parentElement;if(p&&!p.dataset.imgfallback){p.dataset.imgfallback='1';if(getComputedStyle(p).backgroundImage==='none')p.style.background='linear-gradient(135deg,#79513d 0%,#1e3c4a 48%,#33231e 100%)'}}},true);


/* V7 chapter navigation: guided path + flexible entry, without trapping navigation. */
(function(){
const chapters=[{id:'story-history',key:'history',label:'عبر الزمن'},{id:'story-places',key:'places',label:'الأماكن'},{id:'story-culture',key:'culture',label:'الثقافة'},{id:'story-experiences',key:'experiences',label:'التجارب'}];
const markers=[...document.querySelectorAll('.wayfinder-links a')];
const next=document.getElementById('wayfinder-next');
const status=document.getElementById('journey-position');
const progress=document.getElementById('wayfinder-progress');
const fill=document.getElementById('wayfinder-progress-fill');
let current=-1;
function setStage(idx){
 current=idx;
 markers.forEach((a,i)=>{a.classList.toggle('active',i===idx);if(i===idx)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current')});
 status.textContent=idx>=0?('المحطة '+(idx+1)+' من 4'): 'خريطة رحلتك';
 const pct=idx<0?0:(idx+1)*25;
 fill.style.width=pct+'%'; progress.setAttribute('aria-valuenow',String(idx<0?0:idx+1));
 const last=idx===chapters.length-1;
 next.disabled=last;next.textContent=last?'آخر محطة ✓':'التالي: '+chapters[Math.max(0,idx+1)].label+' ←';
}
function go(idx){const c=chapters[Math.max(0,Math.min(idx,chapters.length-1))];document.getElementById(c.id).scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});setStage(Math.max(0,Math.min(idx,chapters.length-1)))}
next.addEventListener('click',()=>{if(current<chapters.length-1)go(current+1)});
document.querySelector('[data-start-guided]')?.addEventListener('click',()=>go(0));
const journeyPortal=document.getElementById('journey-portal');
const advance=()=>{
 const threshold=window.scrollY+Math.min(390,window.innerHeight*.44);
 let active=-1;
 chapters.forEach((c,i)=>{const el=document.getElementById(c.id);if(el&&el.getBoundingClientRect().top+window.scrollY<=threshold)active=i});
 if(journeyPortal&&window.scrollY+130<journeyPortal.offsetTop){active=-1}
 if(active!==current)setStage(active);
};
let scheduled=false;
window.addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(()=>{advance();scheduled=false})}},{passive:true});
window.addEventListener('hashchange',()=>{requestAnimationFrame(advance)});
setStage(-1);requestAnimationFrame(advance);
})();

return {showFavorites,heritageShow,heritageHide,changeEra,getGalleryState:()=>({expanded:heritageExpanded,y:heritageFullScreen.scrollTop,element:heritageFullScreen}),getFavoriteCount:()=>favSet.size};
}
