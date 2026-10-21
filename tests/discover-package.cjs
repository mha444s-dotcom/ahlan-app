'use strict';
// Native integration preservation. The approved standalone source is archival,
// and its four scripts/twelve styles are reconstructed and checked without writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const {execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const assert=require('node:assert/strict'),{test}=require('node:test');
const {readDiscoverSource}=require('../maintenance/discover-source.cjs');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),checkpoint=path.join(root,'design/native-discover/prechange');
const read=name=>fs.readFileSync(path.join(dist,name),'utf8');
const sha=text=>crypto.createHash('sha256').update(text).digest('hex');
const original=readDiscoverSource().source;
const manifest=JSON.parse(read('discover-egypt/extraction-manifest.json'));
const sourceScripts=[...original.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!/\bsrc\s*=/.test(m[1])).map(m=>m[2]);
const sourceStyles=[...original.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]);

test('all four original scripts and twelve styles reproduce the extracted native files without writes',()=>{
  assert.equal(sourceScripts.length,4);assert.equal(sourceStyles.length,12);
  assert.equal(sha(original),manifest.sourceSHA256);
  assert.deepEqual(sourceScripts.map(sha),manifest.scripts.map(x=>x.sha256));
  assert.deepEqual(sourceStyles.map(sha),manifest.styles.map(x=>x.sha256));
  const output=execFileSync(process.execPath,[path.join(root,'maintenance/extract-discover-native.cjs'),'--check'],{encoding:'utf8'});
  assert.equal(JSON.parse(output).status,'Extracted and verified');
  for(const [file,data]of Object.entries(manifest.files))assert.equal(sha(read('discover-egypt/'+file)),data.sha256,file);
});

test('all 170 records, nine categories, eleven eras and original editorial data remain exact',async()=>{
  const {createDiscoverData}=await import(pathToFileURL(path.join(dist,'discover-egypt/content.js')).href);
  const data=createDiscoverData(name=>'asset:'+name);
  const records=JSON.parse(sourceScripts[0].match(/const heritageRecords=(\[[\s\S]*?\]);/)[1]);
  assert.deepEqual(data.heritageRecords,records);assert.equal(data.heritageRecords.length,170);
  assert.equal(data.heritageCategories.length-1,9);assert.equal(data.eras.length,11);
  assert.equal(sha(JSON.stringify(data.heritageRecords)),manifest.heritageRecordsSHA256);
  const prefix=sourceScripts[0].slice(0,sourceScripts[0].indexOf('function esc(s)'));
  const names=['photo','entries','tourism','featured','eras','ancient','greek','coptic','islam','dynasties','dynastiesDetails','modern','culture','regions','experiences'];
  const expected=vm.runInNewContext(prefix+'\nJSON.stringify({'+names.join(',')+'})');
  assert.equal(JSON.stringify(Object.fromEntries(names.map(name=>[name,data[name]]))),expected);
  assert.equal(new Set(data.heritageRecords.map(x=>x.id)).size,170);
});

test('all 23 original raster identities and six inline vectors survive lossless encoding',()=>{
  assert.equal(manifest.assets.length,23);assert.equal(manifest.inlineVectors.length,6);assert.equal(manifest.embeddedVisuals.length,29);
  const payloads=[...original.matchAll(/data:image\/(?:png|webp);base64,([A-Za-z0-9+/=]+)/g)].map(m=>sha(Buffer.from(m[1],'base64')));
  assert.deepEqual(new Set(manifest.assets.map(x=>x.sourceSHA256 || x.sha256)),new Set(payloads));
  for(const asset of manifest.assets){const bytes=fs.readFileSync(path.join(dist,'discover-egypt',asset.file));assert.equal(bytes.length,asset.bytes);assert.equal(sha(bytes),asset.sha256,asset.file);}
  const vectors=html=>[...html.matchAll(/data:image\/svg\+xml,[^'"\s)<>]+/gi)].map(m=>sha(m[0]));
  assert.deepEqual(vectors(read('discover-egypt/page.css')),vectors(sourceStyles.join('\n')));
  const main=html=>html.match(/<main\b[^>]*>[\s\S]*?<\/main>/i)[0];
  assert.equal(main(read('discover-egypt/page.html')),main(original));
});

test('one native component uses existing routes with original host chrome and no iframe bridge',()=>{
  const adapter=read('explore-prototype.js'),controller=read('ui-layout.js'),template=read('discover-egypt/page.html');
  for(const source of [adapter,controller,read('discover-egypt/page.js')])assert.ok(!/createElement\(['"]iframe|contentWindow|postMessage|discoverEgyptFrame/.test(source));
  assert.ok(adapter.includes("import('./discover-egypt/page.js')"));assert.ok(adapter.includes('xpPlaces'));assert.ok(read('discover-egypt/page.js').includes("attachShadow({mode:'open'})"));
  assert.ok(!/<html\b|<head\b|<body\b|<script\b|<style\b|<header\b[^>]*class="site-header"|<nav\b[^>]*class="bottom-nav"/i.test(template));
  for(const id of ['favorites-open','favorite-count','mobile-favorites'])assert.ok(template.includes('id="'+id+'"'));
  const oldIndex=fs.readFileSync(path.join(root,'design/discover-package-integration/prechange/index.html'),'utf8');
  const normalizeFormats=text=>text.replace(/(assets\/ahlan-ui-icons\/[^\s"'<>]+)\.webp/g,'$1.png');
  const stripPWA=text=>normalizeFormats(text).replace(/^<meta name="(?:theme-color|mobile-web-app-capable|apple-mobile-web-app-capable|apple-mobile-web-app-title|apple-mobile-web-app-status-bar-style)"[^>]+>\n/gm,'')
    .replace(/^<link rel="(?:manifest|apple-touch-icon)"[^>]+>\n/gm,'').replace(/^<script type="module" src="pwa.js"><\/script>\n/gm,'').replace(/^<link rel="stylesheet" href="(?:pwa|app-quality).css">\n/gm,'');
  assert.equal(stripPWA(read('index.html')),oldIndex,'Only the explicit PWA and application quality stylesheet head additions are permitted');
  assert.equal(normalizeFormats(read('index.html').split('<body>')[1]),oldIndex.split('<body>')[1],'Original host body remains byte-identical');
  assert.ok(!fs.existsSync(path.join(dist,'discover-egypt/index.html')),'Standalone page retired after successful native browser verification');
  for(const name of ['host-bridge.js','host-bridge.css'])assert.ok(!fs.existsSync(path.join(dist,'discover-egypt',name)));
});

test('every existing file outside the native hooks and authorized application quality fixes is unchanged',()=>{
  const before=JSON.parse(fs.readFileSync(path.join(checkpoint,'manifest.json'),'utf8'));
  assert.equal(before.length,455);
  const changed=new Set(['dist/explore-prototype.js','dist/explore-prototype.css','dist/ui-layout.js','dist/index.html','dist/app-v3.js','dist/real-experiences.js','dist/brand-icons.js','dist/icon-collection.html']);
  const archived=new Set(['dist/discover-egypt/index.html','dist/discover-egypt/host-bridge.js','dist/discover-egypt/host-bridge.css']);
  const converted=new Map([...require('../maintenance/production/discover-image-manifest.json').records,...require('../maintenance/production/icons-image-manifest.json').records].map(record=>['dist/'+record.source,record]));
  let checked=0;
  for(const entry of before){
    if(changed.has(entry.path))continue;
    const conversion=converted.get(entry.path);
    if(conversion){assert.equal(conversion.sourceSHA256,entry.sha256,entry.path+' original identity');assert.equal(sha(fs.readFileSync(path.join(dist,conversion.target))),conversion.sha256);assert.equal(conversion.pixelDifferences,0);assert.equal(conversion.alphaDifferences,0);checked++;continue;}
    const file=path.join(archived.has(entry.path)?checkpoint:root,entry.path);
    assert.equal(sha(fs.readFileSync(file)),entry.sha256,entry.path);checked++;
  }
  assert.equal(checked,447);assert.equal(before.filter(x=>!changed.has(x.path)&&!archived.has(x.path)).length,444);
});

test('native modules parse, their dependencies exist, and shared icons use original app assets',()=>{
  const modules=['page','runtime','fonts','content','view','tomb','effects','enhancements','resources','images','renditions'];
  for(const name of modules){const file='discover-egypt/'+name+'.js',code=read(file);execFileSync(process.execPath,['--check',path.join(dist,file)]);
    for(const m of code.matchAll(/from ['"](.+?)['"]/g))assert.ok(fs.existsSync(path.resolve(dist,'discover-egypt',m[1])),m[1]);
  }
  assert.ok(read('discover-egypt/page.js').includes('../assets/ahlan-ui-icons/'));
  for(const name of ['search','heart','heart-filled'])for(const size of [32,64,128])assert.ok(fs.existsSync(path.join(dist,'assets/ahlan-ui-icons',String(size),name+'.webp')));
  assert.equal(read('discover-egypt/fonts.js').includes(manifest.fontStylesheet),true);
  assert.ok(read('discover-egypt/page.css').includes('AhlanDiscoverAlexandria'));
});
