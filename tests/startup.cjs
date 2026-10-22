'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'../dist',file),'utf8');
const html=read('index.html');
function boot(hash){
  const context={location:{hash},URLSearchParams,document:{body:{dataset:{}},documentElement:{dataset:{}},createElement:()=>({}),head:{append(){}}}};
  vm.runInNewContext(html.match(/<script data-startup>([\s\S]*?)<\/script>/)[1],context);
  return {view:context.document.documentElement.dataset.startupView,...context.document.body.dataset};
}
test('initial presentation is selected before the header and any deferred app scripts',()=>{
  assert(html.indexOf('<script data-startup>')<html.indexOf('<header'));
  const cases=[['','home','home',false],['#/home','home','home',false],['#/journey?tab=explore','journey','home',true],['#/journey?tab=outside','journey','',false],['#/journey?tab=inside','journey','',false],['#/journey?tab=live','journey','',false],['#/home?tab=live','journey','',false],['#/saved','saved','',false],['#/plan','plan','',false],['#/section?section=0','section','government',false],['#/section?section=9','section','tourism',false],['#/section?section=13','section','',false],['#/section?section=-1','section','government',false],['#/section?section=900','section','government',false],['#/section?section=NaN','section','government',false],['#/gallery','gallery','',false],['#/trust','trust','',false],['#/legacy?legacy=0','legacy','',false],['#/unknown','home','home',false]];
  for(const [hash,view,design,explore]of cases)assert.deepEqual(boot(hash),{view,designSample:design,explorePrototype:String(explore)},hash);
});
test('shared navigation uses approved icons in initial HTML, never legacy glyph placeholders',()=>{
  const nav=html.match(/<nav class="nav"[\s\S]*?<\/nav>/)[0];
  assert.doesNotMatch(nav,/[◉♧♡▤☻]/u);
  for(const name of ['home','nearby','heart','plan','profile'])assert(nav.includes('data-icon="'+name+'"'));
  assert(html.includes('<div id="welcome" class="welcome-strip">'));
  assert.doesNotMatch(read('app-v3.js'),/welcome\.innerHTML/);
});
test('boot rules hide only the wrong route, without a page-wide curtain or timer',()=>{
  const css=read('app-quality.css').split('/* Only the initial route')[1];
  assert(css);assert(css.includes('#home'));assert(css.includes('.tabs'));assert(!/opacity|visibility|setTimeout|animation/.test(css));
  assert(read('app-v3.js').includes('delete document.documentElement.dataset.startupView'));
});
test('Discover fetches markup and styles concurrently and never waits for optional fonts',()=>{
  const source=read('discover-egypt/page.js');
  assert.match(source,/void installDiscoverFonts\(\)/);
  assert.match(source,/const \[markup\] = await Promise\.all\(\[textResource\('page.html'\),/);
  assert.doesNotMatch(source,/fontTimer|optionalFonts/);
  assert.doesNotMatch(read('app-v3.js'),/isExplorePrototype\(\)\) \{ renderServices\(\)/);
});
test('retired Explore host rules are absent; legacy saved content remains functional',()=>{
  assert(!read('interface-sample.css').includes('body[data-explore-prototype="true"] #home >'));
  assert(read('legacy-experiences.js').includes('const legacyExperiences'));
  assert(read('real-experiences.js').includes('legacyExperiences.map'));
  assert(read('app-v3.js').includes('renderLegacySection'));
});
