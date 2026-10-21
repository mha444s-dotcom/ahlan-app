'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {buildRelease,publicPolicy,validateReferences,minify,outputWorker,verifyCategoryDisplaySources,PROTECTED_CATEGORY_NAMES} = require('../maintenance/production/Build-Release.cjs');
const repository = path.resolve(__dirname, '..');
const hash = content=>crypto.createHash('sha256').update(content).digest('hex');
const createdFixtures = [];
test.after(()=>{
  for (const root of createdFixtures) {
    // Delete only the exact, unique fixture directories created in this run.
    const releaseRoot = path.join(repository,'release');
    assert.equal(path.dirname(root),releaseRoot);
    assert.match(path.basename(root),/^build-test-[a-f\d-]+$/);
    fs.rmSync(root,{recursive:true,force:true});
    const reports = path.join(releaseRoot,'build-reports');
    if (fs.existsSync(reports)) for (const entry of fs.readdirSync(reports)) {
      if (entry.startsWith(path.basename(root)+'__')) fs.rmSync(path.join(reports,entry),{recursive:true,force:true});
    }
  }
});

function fixture() {
  const root = path.join(repository,'release','build-test-'+crypto.randomUUID());
  createdFixtures.push(root);
  const sourceRoot = path.join(root,'source');
  fs.mkdirSync(path.join(sourceRoot,'assets'),{recursive:true});
  const values = {
    'index.html':'<!doctype html><html lang="ar" dir="rtl"><head><link rel="stylesheet" href="style.css"><link rel="manifest" href="manifest.webmanifest"></head><body><button onclick="greet()">أهلاً</button><img src="assets/art.png" alt="أصل"><script src="main.js"></script><script type="module" src="module.js"></script></body></html>',
    'style.css':'/*! Original design license. */\n:root { --brand: #123456; } .sample { color: var(--brand); padding: 0px 10px; } @keyframes gate { from { opacity: 0; } to { opacity: 1; } } .active { animation: gate 1s; }',
    'main.js':'/*! Existing third-party license. */\nconst Ahlan = { visits: 0 }; function greet() { const count = ++Ahlan.visits; return "أهلاً " + count; }',
    'module.js':'export function sourceIdentity() { const value = "الصورة الأصلية"; return value; }',
    'manifest.webmanifest':JSON.stringify({name:'أهلاً',start_url:'./#/home',icons:[{src:'assets/art.png',sizes:'192x192',type:'image/png'}]}),
    'sw.js':"'use strict';\nconst VERSION = '1234567890abcdef';\nconst SHELL = ['index.html','style.css','main.js','module.js','manifest.webmanifest'];\nself.addEventListener('install', event => event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL))));\n",
    'icon-collection.html':'developer only',
    'discover-egypt/extraction-manifest.json':'{"original":"retained"}',
    'assets/art.png':Buffer.from([137,80,78,71,13,10,26,10,1,2,3]),
    'assets/private-export.zip':'not public',
    'README.md':'developer notes',
  };
  for (const [relative,value] of Object.entries(values)) {
    fs.mkdirSync(path.dirname(path.join(sourceRoot,relative)),{recursive:true});
    fs.writeFileSync(path.join(sourceRoot,relative),value);
  }
  return {root,sourceRoot,outputRoot:path.join(root,'public'),values};
}

test('public allowlist includes runtime resources and excludes only development/nonruntime material',()=>{
  for (const relative of ['index.html','sw.js','pwa.js','app-quality.css','manifest.webmanifest','discover-egypt/page.html','discover-egypt/images.js','discover-egypt/assets/renditions/one.webp','assets/pwa/icon-512.png']) assert.equal(publicPolicy(relative).include,true,relative);
  for (const relative of ['icon-collection.html','discover-egypt/extraction-manifest.json','secrets.json','assets/archive.zip','backup/index.html','README.md']) assert.equal(publicPolicy(relative).include,false,relative);
});

test('protected category PNG originals remain in dist and all currently displayed JPEGs are retained',()=>{
  const sourceRoot = path.join(repository,'dist');
  const emitted = new Map();
  for (const name of PROTECTED_CATEGORY_NAMES) {
    const original = path.join(sourceRoot,'assets/categories',name+'.png');
    assert.ok(fs.existsSync(original),original);
    assert.equal(publicPolicy('assets/categories/'+name+'.png').include,false);
    for (const width of [480,960]) {
      const relative = `assets/optimized/categories/${name}-${width}.jpg`;
      assert.equal(publicPolicy(relative).include,true);
      emitted.set(relative,fs.readFileSync(path.join(sourceRoot,relative)));
    }
  }
  assert.equal(verifyCategoryDisplaySources(sourceRoot,emitted).displayFilesVerified,28);
  emitted.delete('assets/optimized/categories/housing-480.jpg');
  assert.throws(()=>verifyCategoryDisplaySources(sourceRoot,emitted),/Missing protected category display image/);
});

test('minification preserves cross-script globals, inline handler names and legal notices',async()=>{
  const first = await minify('one.js','/*! Ahlan license */\nconst Ahlan = {count:0}; function greet() { let nextValue = ++Ahlan.count; return nextValue; }');
  const second = await minify('two.js','function secondAction() { return greet() + Ahlan.count; }');
  const context = vm.createContext({});
  vm.runInContext(first.content.toString(),context);
  vm.runInContext(second.content.toString(),context);
  assert.equal(vm.runInContext('secondAction()',context),2);
  assert.equal(vm.runInContext('greet.name',context),'greet');
  assert.ok(first.content.toString().includes('Ahlan license'));
  assert.equal(first.licenses.length,1);
});

test('module exports, CSS custom properties, keyframes and embedded SVG remain intact',async()=>{
  const module = await minify('module.js','export function originalArtifact(){const preserved="أهلاً";return preserved;}');
  const parsed = await import('data:text/javascript;base64,'+module.content.toString('base64'));
  assert.equal(parsed.originalArtifact(),'أهلاً');
  const svg = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3C/svg%3E';
  const css = await minify('page.css',`/*! Artwork credit */ :root{--brandName:#112233}.tomb-resetting{background-image:url("${svg}");color:var(--brandName);animation:gate 2s}@keyframes gate{from{opacity:0}to{opacity:1}}`);
  for (const required of ['--brandName','.tomb-resetting','@keyframes gate',svg,'Artwork credit']) assert.ok(css.content.toString().includes(required),required);
});

test('release is deterministic, keeps media byte-for-byte and does not modify source',async()=>{
  const input = fixture();
  const before = Object.fromEntries(Object.keys(input.values).map(file=>[file,hash(fs.readFileSync(path.join(input.sourceRoot,file)))]));
  const result = await buildRelease(input);
  assert.equal(result.manifest.files,7);
  assert.equal(result.manifest.excluded.length,4);
  assert.deepEqual(fs.readFileSync(path.join(input.outputRoot,'assets/art.png')),input.values['assets/art.png']);
  assert.ok(!fs.existsSync(path.join(input.outputRoot,'icon-collection.html')));
  assert.ok(!fs.existsSync(path.join(input.outputRoot,'manifest.json')));
  assert.ok(!fs.existsSync(path.join(input.outputRoot,'main.js.gz')));
  assert.equal(result.manifest.transport.sidecarsWritten,false);
  assert.equal(result.manifest.references.missing.length,0);
  assert.notEqual(result.manifest.pwa.revision,'1234567890abcdef');
  const again = await buildRelease({...input,outputRoot:path.join(input.root,'public-again')});
  assert.equal(result.manifest.fingerprint,again.manifest.fingerprint);
  assert.deepEqual(result.manifest.entries,again.manifest.entries);
  for (const [file,checksum] of Object.entries(before)) assert.equal(hash(fs.readFileSync(path.join(input.sourceRoot,file))),checksum,file);
  const reused = await buildRelease(input);
  assert.equal(reused.reused,true);
});

test('different existing output is retained and cannot be overwritten automatically',async()=>{
  const input = fixture();
  await buildRelease(input);
  const old = fs.readFileSync(path.join(input.outputRoot,'main.js'));
  fs.appendFileSync(path.join(input.sourceRoot,'main.js'),'\nfunction newAction(){return "new";}');
  await assert.rejects(buildRelease(input),/different release.*left untouched/);
  assert.deepEqual(fs.readFileSync(path.join(input.outputRoot,'main.js')),old);
});

test('missing dependency and missing PWA shell member abort before writing output',async()=>{
  const input = fixture();
  fs.appendFileSync(path.join(input.sourceRoot,'index.html'),'<img src="assets/missing.webp">');
  await assert.rejects(buildRelease(input),/Missing local release dependencies/);
  assert.equal(fs.existsSync(input.outputRoot),false);
  assert.throws(()=>outputWorker(input.values['sw.js'],new Map([['index.html',Buffer.from('only one file')]])),/PWA shell references an excluded or missing file/);
});

test('validator checks module imports, CSS media, srcset and directory bases',()=>{
  const content = new Map([
    ['index.html',Buffer.from('<img srcset="assets/a.webp 1x, assets/b.webp 2x"><link href="page.css" rel="stylesheet">')],
    ['page.css',Buffer.from('.art{background:url(assets/a.webp)}.data{background:url("data:image/svg+xml,hello")}')],
    ['main.js',Buffer.from('import {a} from "./module.js";const base=new URL("./assets/",import.meta.url);const image="assets/a.webp";')],
    ['module.js',Buffer.from('export const a=1;')],
    ['assets/a.webp',Buffer.from('A')],['assets/b.webp',Buffer.from('B')],
  ]);
  assert.ok(validateReferences(content).checked>=7);
  content.delete('module.js');
  assert.throws(()=>validateReferences(content),/main.js -> module.js/);
});

test('unsafe output path and files beyond GitHub limit are rejected',async()=>{
  const input = fixture();
  await assert.rejects(buildRelease({...input,outputRoot:path.join(repository,'dist')}),/named child/);
  const huge = path.join(input.sourceRoot,'assets/oversized.png');
  const descriptor = fs.openSync(huge,'w');
  fs.ftruncateSync(descriptor,100*1024*1024+1); fs.closeSync(descriptor);
  await assert.rejects(buildRelease(input),/exceeds GitHub 100 MiB/);
  assert.equal(fs.existsSync(input.outputRoot),false);
});

test('independent classic scripts introduce no shared helper globals that can overwrite another script',async()=>{const context=vm.createContext({});const source='function startCarousel(){const endDrag=()=>42;return endDrag();}';const result=await minify('service-carousel.js',source);vm.runInContext(result.content.toString(),context);assert.deepEqual(Object.keys(context),['startCarousel']);for(const variable of ['a','d','e','r','s','n','t','o'])vm.runInContext('var '+variable+' = Object.defineProperty;',context);assert.equal(vm.runInContext('startCarousel()',context),42);});
