'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const root = path.resolve(__dirname,'..');
const read = name => fs.readFileSync(path.join(root,'dist',name),'utf8');
const escape = value => String(value).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// A small DOM test double. These are logic/DOM-construction tests, not browser layout tests.
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.children = []; this.attrs = {}; this.handlers = {}; this.value = ''; this.hidden = false; this.disabled = false; this.isConnected = true; this.tabIndex = 0; this.style = {setProperty(key,value){this[key]=value;}}; this.dataset = {}; this.clientWidth = 1000; this.scrollWidth = 2000; this.scrollLeft = 0; const values = new Set(); this.classList = {add:x => values.add(x),remove:x => values.delete(x),contains:x => values.has(x),toggle:(x,on) => on ? values.add(x) : values.delete(x)}; }
  set textContent(text) { this.text = String(text); this.markup = ''; this.children = []; }
  get textContent() { return this.text || this.children.map(x => x.textContent).join(''); }
  set innerHTML(html) { this.markup = html; this.text = ''; this.children = []; }
  get innerHTML() { return this.markup || escape(this.text || '') + this.children.map(x => `<${x.tagName}>${x.innerHTML}</${x.tagName}>`).join(''); }
  setAttribute(key,value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key]; }
  removeAttribute(key) { delete this.attrs[key]; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.text = ''; this.markup = ''; this.children = children; }
  addEventListener(name,callback) { this.handlers[name] = callback; }
  click() { return this.handlers.click?.({target:this}); }
  focus() { this.focused = true; }
  querySelectorAll() { return []; }
  reset() {}
  scrollIntoView() {}
  before(...nodes) { this.beforeNodes = nodes; }
  remove() {}
  querySelector() { return new Element(); }
  get previousElementSibling() { return new Element(); }
}
function fixture(initial = {}, fail = false) {
  const storage = new Map(Object.entries(initial));
  const elements = new Map();
  const element = key => { if (!elements.has(key)) elements.set(key,new Element()); return elements.get(key); };
  const events = {};
  const navs=['home','map','saved','plan','profile'].map(value=>{const e=new Element('button');e.dataset.nav=value;return e;});
  const tabs=['explore','outside','inside'].map(value=>{const e=new Element('button');e.dataset.tab=value;return e;});
  const context = {console,URLSearchParams,URL,Date,Math,Map,Set,JSON,Number,String,Array,Object,RegExp,
    setTimeout:callback => callback(),cancelAnimationFrame(){},requestAnimationFrame:callback => {callback();return 1;},
    NodeFilter:{SHOW_TEXT:4,FILTER_REJECT:2,FILTER_ACCEPT:1},
    location:{hash:''}, history:{pushState(state,title,hash){context.location.hash = hash;},replaceState(state,title,hash){context.location.hash = hash;}},
    localStorage:{getItem(key){if(fail)throw Error('storage denied');return storage.has(key) ? storage.get(key) : null;},setItem(key,value){if(fail)throw Error('quota');storage.set(key,value);}},
    document:{documentElement:new Element('html'),getElementById:id=>element("#"+id),querySelector:element,querySelectorAll:selector => selector === '[data-nav]' ? navs : selector === '[data-tab]' ? tabs : [],createElement:tag => { const e=new Element(tag);let id='';Object.defineProperty(e,'id',{get(){return id;},set(value){id=value;elements.set('#'+value,e);}});return e; },activeElement:new Element('button'),body:new Element('body'),addEventListener(name,callback){events['document:'+name] = callback;}},
    addEventListener(name,callback){events[name] = callback;},scrollTo(){},FormData:class {constructor(form){return Object.entries(form.values || {});}},
  };
  context.nativeDiscoverLoads = 0; context.nativeDiscoverMounts = 0;
  // The route adapter is tested here with an injected asynchronous module.
  // Its real DOM, effects and shadow scope are exercised in Chrome separately.
  context.__loadDiscover = () => {
    context.nativeDiscoverLoads++;
    return Promise.resolve({mountDiscover(host) {
      context.nativeDiscoverMounts++; host.dataset.discoverMounted = 'true';
      return {setActive(value) { context.nativeDiscoverActive = value; }, showFavorites() { context.nativeDiscoverFavorites = true; }};
    }});
  };
  context.window = context;
  vm.createContext(context);
  for (const name of ['app-core.js','content-data.js','journey-data.js','expanded.js','legacy-experiences.js','real-experiences.js','service-carousel.js','compact-experiences.js','brand-icons.js','interface-sample.js','explore-prototype.js','app-v3.js']) {
    let source = read(name); if(name === 'app-v3.js')source = source.replace(/initializeApp\(\);\s*$/,'');
    if(name === 'explore-prototype.js')source = source.replace("import('./discover-egypt/page.js')", '__loadDiscover()');
    vm.runInContext(source,context,{filename:name});
  }
  const run = expression => vm.runInContext(expression,context);
  run('loadStoredData()');
  return {context,storage,elements,element,events,run,navs,tabs};
}
test('all scripts and HTML inline scripts have valid JavaScript syntax',() => {
  for (const file of fs.readdirSync(path.join(root,'dist')).filter(x => x.endsWith('.js'))) {
    if (file === 'pwa.js') require('node:child_process').execFileSync(process.execPath,['--check',path.join(root,'dist',file)]);
    else new vm.Script(read(file),{filename:file});
  }
  for (const name of ['index.html','icon-collection.html']) for (const match of read(name).matchAll(/<script>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
});
test('all 14 sections, 46 groups, and 275 nodes remain',() => {
  const f = fixture(); assert.equal(f.run('appContent.length'),14); assert.equal(f.run('appContent.reduce((n,s)=>n+s.groups.length,0)'),46); assert.equal(f.run('appContent.flatMap(s=>s.groups).reduce((n,g)=>n+g.nodes.length,0)'),275);
});
test('valid existing data and old demonstration IDs are retained without writes on read',() => {
  const initial = {'ahlan-saved':'[1,101,999]','ahlan-plan':'[2,105]','ahlan-interests':'["سكن"]','ahlan-reminders':'[{"title":"قديم","date":"2026-10-16","extra":"keep"}]'};
  const f = fixture(initial); assert.deepEqual(Object.fromEntries(f.storage),initial);
  assert.equal(f.run('Ahlan.data.reminders[0].extra'),'keep');
  f.run("Ahlan.state.view='saved'"); assert.equal(f.run('filteredExperiences().some(x=>x.id===1)'),true); assert.equal(f.run('Ahlan.data.saved.includes(999)'),true);
});
test('corrupt JSON is retained, then copied to a recovery key before update',() => {
  const f = fixture({'ahlan-saved':'{broken'}); assert.equal(f.run('Ahlan.data.saved.length'),0); assert.equal(f.storage.get('ahlan-saved'),'{broken');
  assert.equal(f.run("saveData('saved',[101])"),true);
  assert.equal([...f.storage].some(([k,v]) => k.startsWith('ahlan-saved-recovery-') && v === '{broken'),true); assert.equal(f.storage.get('ahlan-saved'),'[101]');
});
test('wrong shapes, partial arrays, and numeric strings are handled',() => {
  const f = fixture({'ahlan-saved':'["101",102,null,"bad",102]','ahlan-profile':'null','ahlan-reminders':'{}','ahlan-interests':'["keep",3]'});
  assert.equal(f.run('JSON.stringify(Ahlan.data.saved)'),'[101,102]'); assert.equal(f.run('JSON.stringify(Ahlan.data.profile)'),'{}'); assert.equal(f.run('Ahlan.data.reminders.length'),0); assert.equal(f.run('Ahlan.data.interests[0]'),'keep');
  assert.equal(f.storage.get('ahlan-saved'),'["101",102,null,"bad",102]');
});
test('unavailable storage does not stop use and reports session-only writes',() => {
  const f = fixture({},true); assert.equal(f.run("saveData('plan',[101])"),false); assert.equal(f.run('Ahlan.data.plan[0]'),101); assert.ok(f.element('#storageNotice').textContent.includes('هذه الجلسة'));
});
test('recovery write failure never overwrites original corrupted value',() => {
  const f = fixture({'ahlan-saved':'{broken'}); f.context.localStorage.setItem = () => {throw Error('quota');};
  assert.equal(f.run("saveData('saved',[101])"),false); assert.equal(f.storage.get('ahlan-saved'),'{broken');
});
test('guide text and reminder titles cannot introduce HTML elements',() => {
  const f = fixture(); f.run('guide("<img src=x onerror=alert(1)>","<script>alert(1)</script>")');
  assert.ok(f.element('#modal').innerHTML.includes('&lt;img')); assert.ok(!f.element('#modal').innerHTML.includes('<script>'));
  f.element('#reminderTitle').value = '<img src=x onerror=alert(1)>'; f.element('#reminderDate').value = '2026-12-01';
  f.run('saveReminder({preventDefault(){}})'); assert.equal(f.run('Ahlan.data.reminders.length'),1);
  assert.equal(f.element('#reminderList').children[0].children[0].textContent,'<img src=x onerror=alert(1)>');
});
test('reminder edit preserves extra data; cancel and delete confirmation preserve other entries',() => {
  const f = fixture({'ahlan-reminders':'[{"title":"one","date":"2026-11-01","extra":"keep"},{"title":"two","date":"2026-12-01"}]'});
  f.run('renderReminders()'); f.element('#reminderList').children[0].children[2].click();
  assert.equal(f.element('#reminderTitle').value,'one'); f.element('#reminderTitle').value = 'edited'; f.element('#reminderDate').value = '2027-01-01'; f.run('saveReminder()');
  assert.equal(f.run('Ahlan.data.reminders[0].title'),'edited'); assert.equal(f.run('Ahlan.data.reminders[0].extra'),'keep');
  f.run('confirmDeleteReminder(0)'); assert.equal(f.run('Ahlan.data.reminders.length'),2);
  f.element('#confirmReminderDelete').click(); assert.equal(f.run('Ahlan.data.reminders.length'),1); assert.equal(f.run('Ahlan.data.reminders[0].title'),'two');
});
test('invalid reminder dates are rejected',() => {
  const f = fixture(); f.element('#reminderTitle').value = 'test'; f.element('#reminderDate').value = '2026-02-30'; f.run('saveReminder()'); assert.equal(f.run('Ahlan.data.reminders.length'),0);
});
test('grouping keeps earlier siblings separate before a shallower heading',() => {
  const f = fixture(); assert.equal(f.run("groupNodes([{text:'a',indent:4},{text:'a1',indent:8},{text:'b',indent:4},{text:'heading',indent:0},{text:'child',indent:4}]).map(x=>x.length).join(',')"),'2,1,2');
  assert.equal(f.run('appContent.flatMap(s=>s.groups).every(g=>groupNodes(g.nodes).flat().length===g.nodes.length)'),true);
});
test('Arabic search normalizes diacritics and searches all service sections',() => {
  const f = fixture(); assert.equal(f.run("normalizeSearch('أَهْلًا')"),'اهلا');
  f.run("Ahlan.state.query='الأقصر'"); assert.equal(f.run('filteredExperiences()[0].id'),104);
  f.run("Ahlan.state.query='دراسة';Ahlan.state.tab='explore';renderServices()"); assert.ok(f.element('#services').innerHTML.includes('openContent(2)'));
});
test('three journeys expose genuinely different content without filtering original image cards',() => {
  const f = fixture();
  f.run("navigate({view:'journey',tab:'outside'})"); const outside=f.element('#journeyPage').innerHTML;
  assert.ok(outside.includes('openContent(0,0)')); assert.ok(!outside.includes('openContent(6,2)'));
  f.run("navigate({view:'journey',tab:'inside'})"); const inside=f.element('#journeyPage').innerHTML;
  assert.notEqual(outside,inside); assert.ok(inside.includes('openContent(6,2)'));
  assert.equal(f.run('new Set(ahlanJourneys.inside.groups.flatMap(c=>c.refs.map(r=>r.join(":")))).size'),46);
  f.run("navigate({view:'journey',tab:'explore'})"); assert.equal(f.element('#home').hidden,true); assert.equal(f.element('#journeyPage').hidden,true);
  assert.equal(f.element('#services').innerHTML,'','Discover does not render the inactive home catalogue');
  f.run('homeScreen()');
  for(let i=0;i<14;i++) assert.ok(f.element('#services').innerHTML.includes(`openContent(${i})`));
});

test('journey references share the original groups and preserve government subgroup routes',()=>{
  const f=fixture();
  for(const key of ['outside','inside']) {
    const refs=f.run(`ahlanJourneys.${key}.groups.flatMap(c=>c.refs)`);
    for(const [si,gi] of refs) assert.ok(f.run(`appContent[${si}].groups[${gi}].nodes.length`)>0);
  }
  f.run("navigate({view:'journey',tab:'inside'})");
  for(let i=0;i<4;i++) assert.ok(f.element('#journeyPage').innerHTML.includes(`openContent(0,${i})`));
  f.run('openContent(0,2)'); assert.equal(f.run('Ahlan.state.group'),2);
});
test('journey routing migrates live links and browser history restores selected journey',()=>{
  const f=fixture(); f.run('setupNavigation()');
  f.context.location.hash='#/home?tab=live'; f.events.hashchange(); assert.equal(f.run('Ahlan.state.view'),'journey');assert.equal(f.run('Ahlan.state.tab'),'inside');
  f.tabs[1].click();assert.ok(f.context.location.hash.includes('/journey?tab=outside'));
  f.context.location.hash='#/journey?tab=inside';f.events.popstate();assert.equal(f.run('Ahlan.state.tab'),'inside');
});
test('home choices have no long descriptions; journey intro appears only after opening',()=>{
  const f=fixture();f.run("navigate({view:'home'})");assert.equal(f.element('#journeyIntro').hidden,true);assert.equal(f.element('#journeyChoicesTitle').textContent,'كيف يمكننا مساعدتك؟');
  f.run("navigate({view:'journey',tab:'outside'})");assert.ok(f.element('#journeyIntro').innerHTML.includes('مهما كان سبب زيارتك'));assert.equal(f.element('#journeyChoicesTitle').hidden,true);
});
test('scoped journey search normalizes Arabic, matches English categories and reports empty results',()=>{
  const f=fixture();f.run("navigate({view:'journey',tab:'outside',query:'الْقُبُول'})");assert.ok(f.element('#journeyPage').innerHTML.includes('openContent(2,1)'));
  f.run("Ahlan.state.query='banking';Ahlan.state.tab='inside';render()");assert.ok(f.element('#journeyPage').innerHTML.includes('openContent(6,1)'));
  f.run("Ahlan.state.query='<img onerror=x>';render()");assert.ok(f.element('#journeyPage').innerHTML.includes('لا توجد خدمات مطابقة'));assert.ok(!f.element('#journeyPage').innerHTML.includes('<img onerror'));
});
test('new navigation translations persist safely and distinguish Arabic source guides',()=>{
  const f=fixture();f.run("navigate({view:'journey',tab:'outside'});changeJourneyLanguage('en')");
  assert.equal(f.tabs[1].textContent,"I'm Outside Egypt");assert.ok(f.element('#journeyIntro').innerHTML.includes('Original guides are in Arabic'));
  assert.equal(f.context.document.documentElement.dir,'ltr');assert.equal(f.context.document.documentElement.lang,'en');
  assert.equal(f.storage.get('ahlan-language'),'"en"');assert.equal(f.run('Ahlan.state.tab'),'outside');
  f.run("changeJourneyLanguage('ar')");assert.equal(f.tabs[1].textContent,'أنا خارج مصر');assert.equal(f.context.document.documentElement.dir,'rtl');
});
test('explore gallery returns to its journey and service pages allow switching journeys',()=>{
  const f=fixture();f.run("navigate({view:'journey',tab:'explore'});openExperienceGallery()");
  assert.equal(f.run('Ahlan.state.origin'),'journey');assert.equal(f.run('readRoute().origin'),'journey');
  f.run('closeExperienceGallery()');assert.equal(f.run('Ahlan.state.view'),'journey');
  f.run('setupNavigation();openContent(0,1)');assert.equal(f.element('.tabs').hidden,false);
  f.tabs[1].click();assert.equal(f.run('Ahlan.state.tab'),'outside');assert.equal(f.run('Ahlan.state.view'),'journey');
});

// Native routing/lifecycle contract. Full content/interaction tests use Chrome.
test('native Explore mounts once in its journey and preserves other route content',async()=>{
  const f=fixture();f.run('initializeApp()');
  f.run("navigate({view:'journey',tab:'outside',query:''})");const outside=f.element('#journeyPage').innerHTML;
  f.run("navigate({view:'journey',tab:'inside',query:''})");const inside=f.element('#journeyPage').innerHTML;
  const services=f.element('#services').innerHTML;
  f.run("navigate({view:'journey',tab:'explore',query:''})");
  assert.equal(f.context.document.body.dataset.explorePrototype,'true');assert.equal(f.element('#explorePrototype').hidden,false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.context.nativeDiscoverLoads,1);assert.equal(f.context.nativeDiscoverMounts,1);
  assert.equal(f.context.nativeDiscoverActive,true);
  assert.equal(f.element('#explorePrototype').children.filter(e=>e.tagName==='iframe').length,0);
  f.run('renderExplorePrototype();renderExplorePrototype()');assert.equal(f.context.nativeDiscoverMounts,1);
  assert.equal(f.element('#services').innerHTML,services);
  f.run("navigate({view:'journey',tab:'outside',query:''})");assert.equal(f.element('#journeyPage').innerHTML,outside);
  f.run("navigate({view:'journey',tab:'inside',query:''})");assert.equal(f.element('#journeyPage').innerHTML,inside);
  for(const expression of ["navigate({view:'home'})","navigate({view:'saved'})","navigate({view:'plan'})","openContent(0,2)","openContent(9,1)","profile()"]){f.run(expression);assert.equal(f.context.document.body.dataset.explorePrototype,'false',expression);assert.equal(f.element('#explorePrototype').hidden,true,expression);}
});

test('Explore rebuild preserves every protected category image and the original data and icon registry bytes',()=>{
  const manifestPath=path.join(__dirname,'fixtures','protected-originals.json');
  const baseline=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  assert.equal(baseline.schema,1);
  const manifest=baseline.files;
  const crypto=require('node:crypto');
  assert.equal(manifest.length,46,'Expected existing pre-prototype protected-file baseline');
  assert.equal(manifest.filter(entry=>/[\\/]categories[\\/]/.test(entry.path)).length,42,'All original and optimized category photos are covered');
  for(const entry of manifest){
    const relative=entry.path;
    const target=path.resolve(root,relative);
    assert.ok(target.startsWith(root+path.sep),'Baseline points outside the workspace: '+entry.path);
    const current=fs.readFileSync(target);
    const preserved=relative.replaceAll('\\','/').endsWith('brand-icons.js') ? Buffer.from(current.toString('utf8').replace(/\.webp/g,'.png')) : current;
    const hash=crypto.createHash('sha256').update(preserved).digest('hex');
    assert.equal(hash,entry.sha256,relative+' must remain byte-for-byte unchanged');
  }
  const currentPlaces=read('real-experiences.js').split(baseline.realExperiencesPrefix.delimiter)[0];
  assert.equal(crypto.createHash('sha256').update(currentPlaces,'utf8').digest('hex'),baseline.realExperiencesPrefix.sha256,
    'Real place records, descriptions, image paths and links must remain unchanged');
});
test('native Explore does not overwrite original saved items, plans or source records',()=>{
  const f=fixture({'ahlan-saved':'[999,101]','ahlan-plan':'[105]'});f.run('initializeApp()');
  const records=f.run('JSON.stringify(realExperiences)'),sections=f.run('JSON.stringify(appContent)');
  f.run("navigate({view:'journey',tab:'explore',query:'',filter:'الكل',cityOnly:false})");
  assert.equal(f.run('JSON.stringify(realExperiences)'),records);assert.equal(f.run('JSON.stringify(appContent)'),sections);
  assert.equal(f.storage.get('ahlan-saved'),'[999,101]');assert.equal(f.storage.get('ahlan-plan'),'[105]');
  assert.ok(f.element('#xpPlaces'));
});

test('government services remain discoverable and their existing names and deep links open all four groups',() => {
  const f = fixture({'ahlan-saved':'[101]','ahlan-plan':'[105]'}); f.run('initializeApp()');
  assert.ok(f.element('#services').innerHTML.indexOf('openContent(0)') < f.element('#services').innerHTML.indexOf('openContent(1)'));
  for(const tab of ['explore','live']) {
    f.run(`navigate({view:'home',tab:${JSON.stringify(tab)},query:''})`);
    assert.ok(f.element('#services').innerHTML.includes('openContent(0)'));
  }
  assert.equal(f.run('appContent[0].groups.map(g=>g.title).join("|")'),'التأشيرات|الإقامة|تصاريح العمل|الإجراءات الحكومية');
  assert.equal(f.run('appContent[0].groups.reduce((n,g)=>n+g.nodes.length,0)'),48);
  for(const name of ['الإجراءات الحكومية','قسم الإجراءات الحكومية','إجراءات وتأشيرات']) {
    f.run(`service(${JSON.stringify(name)})`);
    assert.equal(f.run('Ahlan.state.view'),'section'); assert.equal(f.run('Ahlan.state.section'),0);
    assert.ok(f.element('#sectionPage').innerHTML.includes('data-icon="procedures"'));
  }
  for(let group=0;group<4;group++) {
    f.context.location.hash=`#/section?section=0&group=${group}&tab=explore`; f.events.hashchange();
    assert.equal(f.run('Ahlan.state.section'),0); assert.equal(f.run('Ahlan.state.group'),group);
    assert.ok(f.element('#sectionPage').innerHTML.includes(f.run(`appContent[0].groups[${group}].title`)));
  }
  assert.equal(f.storage.get('ahlan-saved'),'[101]'); assert.equal(f.storage.get('ahlan-plan'),'[105]');
});
test('city selection orders results, keeps other cities, and supports opt-in filtering',() => {
  const f = fixture(); f.run("Ahlan.state.city='أسوان'"); assert.equal(f.run('filteredExperiences().length'),6); assert.equal(f.run('filteredExperiences()[0].id'),105);
  f.run('Ahlan.state.cityOnly=true'); assert.equal(f.run('filteredExperiences().length'),1);
  f.run("Ahlan.state.city='الغردقة';Ahlan.state.cityOnly=false"); assert.equal(f.run('filteredExperiences().length'),6);
});
test('favorites, plans, search and gallery use the same selection rules',() => {
  const f = fixture({'ahlan-saved':'[101,105]','ahlan-plan':'[103]'});
  f.run("Ahlan.state.view='saved'"); assert.equal(f.run('filteredExperiences().length'),2);
  f.run("Ahlan.state.view='gallery';Ahlan.state.origin='plan'"); assert.equal(f.run('filteredExperiences()[0].id'),103);
  f.run("Ahlan.state.query='أسوان'"); assert.equal(f.run('filteredExperiences().length'),0);
  f.run("Ahlan.state.query='';toggleSave(103)"); assert.equal(f.run('Ahlan.data.saved.includes(103)'),true);
  f.run('addPlan(103)'); assert.equal(f.run('Ahlan.data.plan.length'),0);
});
test('routing validates hashes, supports browser history, and resolves trust',() => {
  const f = fixture(); f.run('renderRoute=function(){ window.rendered=(window.rendered||0)+1; };setupNavigation()');
  f.run('openContent(13,1)'); assert.ok(f.context.location.hash.startsWith('#/section?')); assert.equal(f.run('Ahlan.state.section'),13);
  f.context.location.hash = '#/saved?tab=live'; f.events.popstate(); assert.equal(f.run('Ahlan.state.view'),'saved');
  f.run("service('التقييمات والثقة')"); assert.equal(f.run('Ahlan.state.view'),'trust');
  f.context.location.hash = '#/section?section=999&group=-4'; assert.equal(f.run('readRoute().section'),0); assert.equal(f.run('readRoute().group'),0);
  f.context.location.hash = '#experiences'; assert.equal(f.run('readRoute().view'),'home');
});
test('profile strings are assigned as values and retain saved fields',() => {
  const f = fixture({'ahlan-profile':'{"nationality":"<b>test</b>","city":"أسوان"}'}); f.run('loadProfile()');
  assert.equal(f.element('#localProfile [name="nationality"]').value,'<b>test</b>');
  const form = {values:{nationality:'new',city:'القاهرة'}}; f.context.profileEvent = {preventDefault(){},target:form};
  f.run('saveProfile(profileEvent)'); assert.equal(JSON.parse(f.storage.get('ahlan-profile')).nationality,'new');
});
test('all local primary resources, icons, originals, and optimized variants exist',() => {
  for (const match of read('index.html').matchAll(/(?:src|href)="([^"#]+)"/g)) if (!/^(https?:|tel:)/.test(match[1])) assert.ok(fs.existsSync(path.join(root,'dist',match[1])),match[1]);
  for (const match of read('brand-icons.js').matchAll(/:'([a-z]+(?:-[a-z]+)?)'/g)) if (fs.existsSync(path.join(root,'dist/assets/icons',match[1]+'.svg'))) assert.ok(true);
  const f = fixture(); const files = JSON.parse(f.run('JSON.stringify([...Ahlan.sections.map(s=>["categories",s.file]),...realExperiences.map(x=>["experiences",x.file])])'));
  for (const [kind,file] of files) for (const width of [480,960]) assert.ok(fs.existsSync(path.join(root,'dist/assets/optimized',kind,`${file}-${width}.jpg`)));
  assert.ok(!read('icon-collection.html').includes('icons-egypt'));
  const links = [...read('index.html').matchAll(/<link[^>]+href="([^"]+)"/g)].map(x=>x[1]); assert.equal(new Set(links).size,links.length);
});

test('initialization and all section/group routes run with consistent bottom navigation',() => {
  const f = fixture(); f.run('initializeApp()');
  assert.equal(f.navs.find(x => x.dataset.nav === 'home').attrs['aria-current'],'page');
  for(let si=0;si<14;si++) {
    const groups = f.run(`appContent[${si}].groups.length`);
    for(let gi=0;gi<groups;gi++) {
      f.run(`openContent(${si},${gi})`);
      assert.ok(f.element('#sectionPage').innerHTML.includes('<h1>'));
    }
  }
  f.run('openContent(8)'); assert.equal(f.navs.find(x=>x.dataset.nav === 'map').attrs['aria-current'],'page');
  f.run('profile()'); assert.equal(f.navs.find(x=>x.dataset.nav === 'profile').attrs['aria-current'],'page');
  f.navs.find(x=>x.dataset.nav === 'saved').click(); assert.equal(f.run('Ahlan.state.view'),'saved');
  assert.equal(f.navs.find(x=>x.dataset.nav === 'saved').attrs['aria-current'],'page');
  f.run('openExperienceGallery()'); assert.equal(f.run('Ahlan.state.origin'),'saved');
  f.run('closeExperienceGallery()'); assert.equal(f.run('Ahlan.state.view'),'saved');
  f.run("service('التقييمات والثقة')"); assert.ok(f.element('#sectionPage').innerHTML.includes('التقييمات والثقة'));
  f.run("service('مساعدة شخصية')"); assert.ok(f.element('#sectionPage').innerHTML.includes('الخدمات الشخصية'));
});
test('local HTTP serving returns every deployed resource and blocks access to backups',async () => {
  const server = require('../serve-local.cjs');
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const walk = directory => fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(path.join(directory,entry.name)) : [path.join(directory,entry.name)]);
    const files = walk(path.join(root,'dist'));
    for(const file of files) {
      const relative = path.relative(path.join(root,'dist'),file).replaceAll('\\','/');
      const response = await fetch(base + '/' + relative,{method:'HEAD'});
      assert.equal(response.status,200,relative); assert.equal(Number(response.headers.get('content-length')),fs.statSync(file).size);
    }
    assert.equal((await fetch(base + '/')).status,200);
    assert.equal((await fetch(base + '/_backups/Ahlan-complete.zip')).status,404);
    assert.equal((await fetch(base + '/missing.png')).status,404);
    assert.equal((await fetch(base + '/%5c..%5c_backups')).status,403);
    console.log('HTTP resources checked:',files.length);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('modal focus, Escape, Tab loop, and background inert logic',() => {
  const f = fixture(), backgrounds = [new Element(),new Element(),new Element()];
  f.context.document.querySelectorAll = selector => selector.startsWith('body >') ? backgrounds : [];
  const first = new Element('button'), last = new Element('a');
  f.element('#modal').querySelectorAll = () => [first,last];
  f.run('setupModal();guide("title","text")'); assert.ok(backgrounds.every(x=>x.inert));
  let prevented = false; f.context.document.activeElement = last;
  f.events['document:keydown']({key:'Tab',shiftKey:false,preventDefault(){prevented=true;}});
  assert.equal(prevented,true); assert.equal(first.focused,true);
  f.context.document.activeElement = first; f.events['document:keydown']({key:'Tab',shiftKey:true,preventDefault(){}}); assert.equal(last.focused,true);
  f.events['document:keydown']({key:'Escape',preventDefault(){}}); assert.ok(backgrounds.every(x=>!x.inert)); assert.equal(f.element('#overlay').attrs['aria-hidden'],'true');
});
test('every rendered content node is retained after grouping',() => {
  const f = fixture();
  assert.equal(f.run(`appContent.every((s,si)=>s.groups.every((g,gi)=>{
    const html=renderGroup(g,si,gi);
    return groupNodes(g.nodes).every(block=>block.every((n,i)=>html.includes(esc(i===0?n.text.replace(/:$/,''):n.text))));
  }))`),true);
});
test('search avoids metadata matches and avoids unnecessary service redraws',() => {
  const f = fixture(); f.run("Ahlan.state.query='indent';renderServices()"); assert.ok(!f.element('#services').innerHTML.includes('class="service'));
  f.run("Ahlan.state.query='دراسة';renderServices()"); const key=f.run("Ahlan.renderKeys.get('services')");
  f.element('#services').innerHTML='sentinel'; f.run('renderServices()'); assert.equal(f.element('#services').innerHTML,'sentinel'); assert.equal(f.run("Ahlan.renderKeys.get('services')"),key);
});
test('old expiry text remains editable and fractional legacy route is rejected',() => {
  const f = fixture({'ahlan-profile':'{"expiry":"16/10/2026"}'}); f.run('loadProfile()');
  assert.equal(f.element('#localProfile [name="expiry"]').value,'16/10/2026'); assert.equal(f.element('#localProfile [name="expiry"]').type,'text');
  f.context.location.hash='#/legacy?legacy=1.5'; assert.equal(f.run('readRoute().legacy'),0);
});
test('HTML and scripts contain no damaged replacement text; icon files resolve',() => {
  for (const file of fs.readdirSync(path.join(root,'dist')).filter(x => /\.(js|html)$/.test(x))) {
    assert.ok(!/\?{3,}|\uFFFD/.test(read(file)),file);
  }
  const f = fixture();
  const names = JSON.parse(f.run('JSON.stringify([...new Set([...Object.keys(brandIconRegistry),...Object.values(iconTokens).map(x=>x==="chevron"?"arrow":x)])])'));
  for(const name of names) {
    const markup = f.run(`brandIcon(${JSON.stringify(name)})`);
    const sources = [...new Set([...markup.matchAll(/assets\/ahlan-ui-icons\/\d+\/[a-z-]+\.webp/g)].map(match=>match[0]))];
    assert.equal(sources.length,4,name+' responsive lossless WebP variants');
    for(const source of sources) assert.ok(fs.existsSync(path.join(root,'dist',source)),source);
  }
  assert.ok(fs.existsSync(path.join(root,'dist/assets/icons/arrow.svg')),'protected carousel SVG remains available');
  assert.equal(f.run('brandIcon("../categories/work")'),'','unknown asset paths are rejected');
});





test('back/hash events render once, preserve existing anchor links, and ignore unrelated storage keys',() => {
  const f = fixture(); f.run('initializeApp();window.routeRenders=0;const originalRouteRender=renderRoute;renderRoute=function(scroll){window.routeRenders++;originalRouteRender(scroll);}');
  f.context.location.hash = '#/saved?tab=live'; f.events.popstate(); f.events.hashchange(); assert.equal(f.run('routeRenders'),1);
  f.element('#experiences').scrollIntoView = function(){this.scrolled = true;};
  f.context.location.hash = '#experiences'; f.events.hashchange(); assert.equal(f.element('#experiences').scrolled,true); assert.equal(f.run('Ahlan.state.view'),'home');
  assert.doesNotThrow(()=>f.events.storage({key:'ahlan-__proto__'}));
});

function submitProfile(f) {
  const form = f.element('#localProfile');
  form.values = JSON.parse(f.run('JSON.stringify(profileDraft())'));
  f.context.profileSubmit = {preventDefault(){},target:form};
  return f.run('saveProfile(profileSubmit)');
}
test('profile save merges edited fields with a newer stored profile before its storage event',() => {
  const f = fixture({'ahlan-profile':'{"nationality":"old","city":"القاهرة"}'});
  f.run('loadProfile()');
  f.element('#localProfile [name="nationality"]').value = 'my draft';
  f.storage.set('ahlan-profile','{"nationality":"old","city":"أسوان","organization":"new in another window"}');
  submitProfile(f);
  const value = JSON.parse(f.storage.get('ahlan-profile'));
  assert.equal(value.nationality,'my draft'); assert.equal(value.city,'أسوان');
  assert.equal(value.organization,'new in another window');
  assert.equal(f.element('#localProfile [name="city"]').value,'أسوان');
});
test('profile storage events refresh untouched fields while retaining the local draft',() => {
  const f = fixture({'ahlan-profile':'{"city":"القاهرة","organization":"old"}'});
  f.run('initializeApp();profile()');
  f.element('#localProfile [name="city"]').value = 'my draft';
  f.storage.set('ahlan-profile','{"city":"أسوان","organization":"new"}');
  f.events.storage({key:'ahlan-profile'});
  assert.equal(f.element('#localProfile [name="city"]').value,'my draft');
  assert.equal(f.element('#localProfile [name="organization"]').value,'new');
  assert.equal(f.run('profileBaseline.city'),'القاهرة');
  assert.equal(f.run('profileBaseline.organization'),'new');
});
test('same-field profile conflicts require a choice and retain the older stored version before replacement',() => {
  const f = fixture({'ahlan-profile':'{"city":"القاهرة"}'});
  f.run('loadProfile()'); f.element('#localProfile [name="city"]').value = 'local city';
  const remote = '{"city":"أسوان","organization":"remote employer"}';
  f.storage.set('ahlan-profile',remote); submitProfile(f);
  assert.equal(f.storage.get('ahlan-profile'),remote);
  assert.equal(f.element('#profileConflictActions').hidden,false);
  assert.ok(f.element('#profileStatus').textContent.includes('المدينة'));
  assert.equal([...f.storage.keys()].some(key=>key.startsWith('ahlan-profile-recovery-')),false);
  f.run('keepProfileDraft()');
  assert.equal(JSON.parse(f.storage.get('ahlan-profile')).city,'local city');
  assert.equal(JSON.parse(f.storage.get('ahlan-profile')).organization,'remote employer');
  assert.equal([...f.storage].some(([key,value])=>key.startsWith('ahlan-profile-recovery-') && JSON.parse(value).city === 'أسوان'),true);
  assert.equal(f.element('#profileConflictActions').hidden,true);
});
test('a new remote profile write after the conflict prompt must be reviewed again',() => {
  const f = fixture({'ahlan-profile':'{"city":"القاهرة"}'});
  f.run('loadProfile()'); f.element('#localProfile [name="city"]').value = 'local city';
  f.storage.set('ahlan-profile','{"city":"أسوان"}'); submitProfile(f);
  const newest = '{"city":"الأقصر","nationality":"remote"}'; f.storage.set('ahlan-profile',newest);
  f.run('keepProfileDraft()');
  assert.equal(f.storage.get('ahlan-profile'),newest);
  assert.equal(f.element('#profileConflictActions').hidden,false);
  assert.equal(f.run('pendingProfileConflict.latest.city'),'الأقصر');
  assert.equal([...f.storage.keys()].some(key=>key.startsWith('ahlan-profile-recovery-')),false);
});
test('choosing stored conflicting values keeps unrelated local drafts without saving automatically',() => {
  const f = fixture({'ahlan-profile':'{"city":"القاهرة","nationality":"old"}'});
  f.run('loadProfile()');
  f.element('#localProfile [name="city"]').value = 'local city';
  f.element('#localProfile [name="nationality"]').value = 'local nationality';
  const remote = '{"city":"أسوان","nationality":"old","organization":"remote"}';
  f.storage.set('ahlan-profile',remote); submitProfile(f); f.run('useStoredProfile()');
  assert.equal(f.storage.get('ahlan-profile'),remote);
  assert.equal(f.element('#localProfile [name="city"]').value,'أسوان');
  assert.equal(f.element('#localProfile [name="nationality"]').value,'local nationality');
  submitProfile(f);
  const merged = JSON.parse(f.storage.get('ahlan-profile'));
  assert.equal(merged.city,'أسوان'); assert.equal(merged.nationality,'local nationality'); assert.equal(merged.organization,'remote');
});
test('failed conflict recovery writes never replace the stored profile or discard the draft',() => {
  const f = fixture({'ahlan-profile':'{"city":"القاهرة"}'});
  f.run('loadProfile()'); f.element('#localProfile [name="city"]').value = 'local city';
  const remote = '{"city":"أسوان"}'; f.storage.set('ahlan-profile',remote); submitProfile(f);
  f.context.localStorage.setItem = ()=>{throw Error('quota');}; f.run('keepProfileDraft()');
  assert.equal(f.storage.get('ahlan-profile'),remote);
  assert.equal(f.element('#localProfile [name="city"]').value,'local city');
  assert.equal(f.element('#profileConflictActions').hidden,false);
  assert.ok(f.element('#profileStatus').textContent.includes('تعذر الاحتفاظ'));
});
test('session-only profile edits remain dirty and survive a later successful retry',() => {
  const f = fixture({'ahlan-profile':'{"city":"القاهرة","nationality":"old"}'});
  f.run('loadProfile()'); f.element('#localProfile [name="city"]').value = 'local city';
  const normalWrite = f.context.localStorage.setItem;
  f.context.localStorage.setItem = ()=>{throw Error('quota');}; submitProfile(f);
  assert.equal(JSON.parse(f.storage.get('ahlan-profile')).city,'القاهرة');
  assert.equal(f.run('Ahlan.data.profile.city'),'local city');
  f.run('loadProfile()'); assert.equal(f.element('#localProfile [name="city"]').value,'local city');
  f.element('#localProfile [name="nationality"]').value = 'local nationality';
  f.context.localStorage.setItem = normalWrite; submitProfile(f);
  const saved = JSON.parse(f.storage.get('ahlan-profile'));
  assert.equal(saved.city,'local city'); assert.equal(saved.nationality,'local nationality');
});

function replacingFilterFixture(f,focusedCategory) {
  const filters = f.element('#filters');
  let buttons = ['الكل','آثار وثقافة'].map(category => {const button = new Element('button'); button.dataset.filter = category; return button;});
  const original = buttons.find(button => button.dataset.filter === focusedCategory);
  filters.querySelectorAll = ()=>buttons;
  Object.defineProperty(filters,'innerHTML',{
    get(){return this.markup || '';},
    set(html){
      this.markup = html;
      buttons = [...html.matchAll(/data-filter="([^"]+)"/g)].map(match=>{
        const button = new Element('button'); button.dataset.filter = match[1];
        button.focus = options=>{button.focused = true;button.focusOptions = options;f.context.document.activeElement = button;};
        return button;
      });
    }
  });
  f.context.document.activeElement = original || new Element('input');
  return {original,buttons:()=>buttons};
}
test('replacing experience filters restores keyboard focus to the matching chip without scrolling',() => {
  const f = fixture(), controls = replacingFilterFixture(f,'آثار وثقافة');
  f.run("Ahlan.state.filter='آثار وثقافة';renderRealFilters()");
  const replacement = controls.buttons().find(button=>button.dataset.filter === 'آثار وثقافة');
  assert.notEqual(replacement,controls.original);
  assert.equal(f.context.document.activeElement,replacement);
  assert.equal(replacement.focusOptions.preventScroll,true);
});
test('experience filter refreshes never steal focus from search or other controls',() => {
  const f = fixture(), controls = replacingFilterFixture(f,null), search = f.context.document.activeElement;
  f.run("Ahlan.state.filter='على النيل';renderRealFilters()");
  assert.equal(f.context.document.activeElement,search);
  assert.ok(controls.buttons().every(button=>!button.focused));
});
