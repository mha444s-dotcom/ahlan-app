'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
test('responsive artwork derives from all twenty unchanged originals and preserves encoded color and alpha',async()=>{
  const fs=require('node:fs'),crypto=require('node:crypto');
  const folder=path.resolve(__dirname,'../dist/discover-egypt');
  const {artRenditions}=await import(pathToFileURL(path.join(folder,'renditions.js')).href);
  const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
  assert.equal(Object.keys(artRenditions).length,20);
  let original=0,small=0;
  for(const [name,record]of Object.entries(artRenditions)){
    assert.equal(sha(fs.readFileSync(path.join(folder,'assets',name))),record.originalSHA256);
    for(const rendition of [record.small,record]){
      const bytes=fs.readFileSync(path.join(folder,rendition.file));assert.equal(sha(bytes),rendition.sha256);assert.equal(bytes.length,rendition.bytes);
      const dimensions=require('../maintenance/production/image-contract.cjs').webpDimensions(bytes);assert.equal(dimensions.width,rendition.width);assert.equal(dimensions.height,rendition.height);
      assert.equal(rendition.meanColorDelta,0);assert.equal(rendition.meanAlphaDelta,0);
      assert.ok(Math.abs(rendition.width/rendition.height-record.originalWidth/record.originalHeight)<.005);
    }
    assert.equal(record.small.width,320);assert.equal(record.width,640);original+=record.sourceBytes;small+=record.small.bytes;
  }
  assert.ok(small<original*.15,'Mobile display renditions reduce transfer by more than85%');
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(fetcher) {
  const {createHeritageImages}=await import(pathToFileURL(path.resolve(__dirname,'../dist/discover-egypt/enhancements.js')).href);
  const prior={document:global.document,IntersectionObserver:global.IntersectionObserver,MutationObserver:global.MutationObserver};
  const observers=[],mutations=[],listeners=new Map(),classes=()=>{const values=new Set();return {add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x)};};
  global.IntersectionObserver=class {constructor(cb){this.cb=cb;this.targets=new Set();observers.push(this);}observe(x){this.targets.add(x);}unobserve(x){this.targets.delete(x);}disconnect(){this.targets.clear();}};
  global.MutationObserver=class {constructor(cb){this.cb=cb;mutations.push(this);}observe(target,options){this.target=target;this.options=options;}disconnect(){this.stopped=true;}};
  global.document={createElement:tag=>({nodeType:1,tagName:tag.toUpperCase(),className:'',textContent:'',querySelector:()=>null})};
  const data={heritageRecords:[{id:'one',wiki:'Karnak',category:'المعابد',title:'الكرنك'},{id:'two',wiki:'Karnak',category:'المعابد',title:'الكرنك الثاني'}],entries:{one:{image:'https://stock.invalid/other-place'},two:{image:'https://stock.invalid/other-place'}}};
  function image(id){const parent={classList:classes(),status:null,querySelector(){return this.status;},append(node){this.status=node;node.remove=()=>{this.status=null;};}};return {nodeType:1,tagName:'IMG',querySelector:()=>null,isConnected:true,src:data.entries[id].image,style:{},dataset:{heritageWiki:'Karnak'},parentElement:parent,closest(selector){return selector==='[data-open]'?{dataset:{open:id}}:null;}};}
  const imgs=[image('one'),image('two')],icon='http://localhost/discover/assets/original-temple.png';
  const queries=new Map();
  const shadow={querySelectorAll(selector){queries.set(selector,(queries.get(selector)||0)+1);return selector==='[data-heritage-entry]'?[{dataset:{heritageEntry:'المعابد'},querySelector:()=>({src:icon})}]:imgs.filter(img=>img.isConnected);},addEventListener(type,cb){listeners.set(type,cb);},removeEventListener(type){listeners.delete(type);}};
  let calls=0;const resources={fetch(...args){calls++;return fetcher(...args);},getStats:()=>({blockedUntil:0})};
  const api=createHeritageImages({shadow,data,resources});
  return {api,data,imgs,icon,observers,mutations,listeners,queries,image,calls:()=>calls,restore(){api.dispose();for(const [key,value]of Object.entries(prior)){if(value===undefined)delete global[key];else global[key]=value;}}};
}
test('heritage photos load only near the viewport, deduplicate, and replace labelled category art with the verified thumbnail',async()=>{
  const src='https://upload.wikimedia.org/wikipedia/commons/test/Karnak.jpg';
  const f=await fixture(async()=>new Response(JSON.stringify({query:{pages:{1:{thumbnail:{source:src}}}}})));
  try {
    f.api.prepare();assert.equal(f.data.entries.one.image,f.icon);f.api.observe();assert.equal(f.calls(),0);
    assert.ok(f.imgs.every(img=>img.src===f.icon&&img.alt.includes('رسم توضيحي')));
    f.observers[0].cb(f.imgs.map(target=>({target,isIntersecting:true})));await tick();await tick();
    assert.equal(f.calls(),1);assert.ok(f.imgs.every(img=>img.src===src&&!img.dataset.heritagePlaceholder));
    assert.equal(f.data.entries.two.image,src);assert.equal(f.imgs[0].parentElement.status,null);
  }finally{f.restore();}
});
test('429, absent thumbnails and non-Wikimedia replies keep honest art without automatic retry or wrong-place photos',async()=>{
  for(const reply of [()=>new Response(null,{status:429}),()=>new Response('{}'),()=>new Response(JSON.stringify({query:{pages:{1:{thumbnail:{source:'https://stock.invalid/wrong-site.jpg'}}}}}))]){
    const f=await fixture(async()=>reply());
    try{f.api.prepare();f.api.observe();f.observers[0].cb([{target:f.imgs[0],isIntersecting:true}]);await tick();await tick();f.api.observe();f.observers[0].cb([{target:f.imgs[0],isIntersecting:true}]);await tick();assert.equal(f.calls(),1);assert.equal(f.imgs[0].src,f.icon);assert.equal(f.data.entries.one.image,f.icon);}finally{f.restore();}
  }
});
test('photo errors restore the visible labelled fallback after generic error handling; inactive and disposed views start no work',async()=>{
  const f=await fixture(async()=>new Response(JSON.stringify({query:{pages:{1:{thumbnail:{source:'https://upload.wikimedia.org/test.jpg'}}}}})));
  try{
    f.api.prepare();f.api.observe();f.api.setActive(false);f.observers[0].cb([{target:f.imgs[0],isIntersecting:true}]);await tick();assert.equal(f.calls(),0);
    f.api.setActive(true);f.observers[0].cb([{target:f.imgs[0],isIntersecting:true}]);await tick();await tick();
    const img=f.imgs[0];img.tagName='IMG';f.listeners.get('error')({target:img});img.style.opacity='0';await tick();
    assert.equal(img.src,f.icon);assert.equal(img.style.opacity,'1');assert.ok(img.parentElement.status);
    f.imgs[1].isConnected=false;f.api.observe();assert.equal(f.observers[0].targets.has(f.imgs[1]),false);
    f.api.dispose();assert.equal(f.observers[0].targets.size,0);assert.equal(f.listeners.size,0);
  }finally{f.restore();}
});

test('heritage observation ignores text and status labels, but discovers actual added images and releases removed cards',async()=>{
  const f=await fixture(async()=>new Response(null,{status:429}));
  try{
    f.api.prepare();f.api.observe();
    const selector='img[data-heritage-wiki],#dialog-visual img',before=f.queries.get(selector),mutation=f.mutations[0];
    assert.deepEqual(mutation.options,{subtree:true,childList:true},'src/alt changes must not feed back into image discovery');
    const text={nodeType:3},status={nodeType:1,tagName:'SPAN',querySelector:()=>null};
    mutation.cb([{type:'childList',addedNodes:[text,status],removedNodes:[]}]);
    mutation.cb([{type:'childList',addedNodes:[],removedNodes:[text,status]}]);
    assert.equal(f.queries.get(selector),before,'unrelated labels must not rescan catalogue images');
    const added=f.image('one');f.imgs.push(added);
    mutation.cb([{type:'childList',addedNodes:[added],removedNodes:[]}]);
    assert.equal(f.queries.get(selector),before+1);assert.equal(f.observers[0].targets.has(added),true);
    assert.equal(added.src,f.icon);assert.ok(added.alt.includes('رسم توضيحي'));
    const nested=f.image('two');f.imgs.push(nested);
    const container={nodeType:1,tagName:'DIV',querySelector:selector=>selector==='img'?nested:null};
    mutation.cb([{type:'childList',addedNodes:[container],removedNodes:[]}]);
    assert.equal(f.queries.get(selector),before+2);assert.equal(f.observers[0].targets.has(nested),true);
    added.isConnected=false;
    mutation.cb([{type:'childList',addedNodes:[],removedNodes:[added]}]);
    assert.equal(f.observers[0].targets.has(added),false);
    const after=f.queries.get(selector);f.api.dispose();
    assert.equal(mutation.stopped,true);
    mutation.cb([{type:'childList',addedNodes:[nested],removedNodes:[]}]);
    assert.equal(f.queries.get(selector),after,'a queued mutation cannot restart a disposed image scope');
    assert.equal(f.calls(),0,'discovering offscreen cards never starts a thumbnail request');
  }finally{f.restore();}
});

async function artFixture(){
  const folder=path.resolve(__dirname,'../dist/discover-egypt');
  const {installResponsiveArt}=await import(pathToFileURL(path.join(folder,'images.js')).href);
  const {artRenditions}=await import(pathToFileURL(path.join(folder,'renditions.js')).href);
  const prior={location:global.location,ResizeObserver:global.ResizeObserver,MutationObserver:global.MutationObserver};
  const observers=[],mutations=[],listeners=new Map();
  global.location={origin:'http://localhost'};
  global.ResizeObserver=class{constructor(cb){this.cb=cb;this.targets=new Set();this.observations=0;this.removals=0;observers.push(this);}observe(img){this.observations++;this.targets.add(img);}unobserve(img){this.removals++;this.targets.delete(img);}disconnect(){this.stopped=true;this.targets.clear();}};
  global.MutationObserver=class{constructor(cb){this.cb=cb;mutations.push(this);}observe(target,options){this.target=target;this.options=options;}disconnect(){this.stopped=true;}};
  const names=Object.keys(artRenditions),original=name=>'http://localhost/discover-egypt/assets/'+name;
  function image(name=names[0],width=96){
    let src=original(name),srcset='';
    return {nodeType:1,tagName:'IMG',isConnected:true,clientWidth:width,dataset:{},style:{},sizes:'',srcWrites:0,srcsetWrites:0,
      get src(){return src;},set src(value){this.srcWrites++;src=value;},
      get srcset(){return srcset;},set srcset(value){this.srcsetWrites++;srcset=value;},
      querySelectorAll:()=>[],removeAttribute(attribute){this[attribute]='';}};
  }
  const imgs=[image()],shadow={scans:0,querySelectorAll(selector){assert.equal(selector,'img');this.scans++;return imgs.filter(img=>img.isConnected);},addEventListener(type,cb){listeners.set(type,cb);},removeEventListener(type){listeners.delete(type);}};
  const api=installResponsiveArt(shadow);
  return {api,shadow,imgs,image,names,original,artRenditions,observers,mutations,listeners,restore(){api.dispose();for(const [key,value]of Object.entries(prior)){if(value===undefined)delete global[key];else global[key]=value;}}};
}
test('responsive artwork preserves canonical src, configures new images once and never rescans the shadow tree for text/status mutations',async()=>{
  const f=await artFixture();
  try{
    const img=f.imgs[0],record=f.artRenditions[f.names[0]],mutation=f.mutations[0],resize=f.observers[0];
    assert.equal(img.src,f.original(f.names[0]));assert.equal(img.srcWrites,0);
    assert.equal(img.sizes,'96px');assert.equal(img.decoding,'async');assert.equal(img.dataset.discoverRendition,f.names[0]);
    assert.ok(img.srcset.includes(`${img.src} ${record.originalWidth}w`));
    assert.ok(img.srcset.includes(`${record.small.file} ${record.small.width}w`));
    assert.ok(img.srcset.includes(`${record.file} ${record.width}w`));
    assert.equal(f.shadow.scans,1);assert.equal(resize.observations,1);
    assert.deepEqual(mutation.options,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
    let statusScans=0;
    const text={nodeType:3},status={nodeType:1,tagName:'SPAN',querySelectorAll(){statusScans++;return[];}};
    for(let i=0;i<30;i++)mutation.cb([{type:'childList',addedNodes:[text,status],removedNodes:[text]}]);
    assert.equal(f.shadow.scans,1,'status/text updates must not run another all-component image query');
    assert.equal(img.srcsetWrites,1);assert.equal(resize.observations,1);assert.equal(statusScans,30);
    const added=f.image(f.names[1],110);f.imgs.push(added);
    mutation.cb([{type:'childList',addedNodes:[added],removedNodes:[]},{type:'attributes',attributeName:'src',target:added}]);
    assert.equal(added.srcsetWrites,1,'one mutation batch configures each added image once');
    assert.equal(added.sizes,'110px');assert.equal(resize.targets.has(added),true);assert.equal(f.shadow.scans,1);
    const nested=f.image(f.names[2],180);f.imgs.push(nested);
    mutation.cb([{type:'childList',addedNodes:[{nodeType:1,tagName:'DIV',querySelectorAll:()=>[nested]}],removedNodes:[]}]);
    assert.equal(nested.sizes,'180px');assert.equal(resize.targets.has(nested),true);assert.equal(f.shadow.scans,1);
    nested.clientWidth=203.4;resize.cb([{target:nested}]);assert.equal(nested.sizes,'204px');
  }finally{f.restore();}
});
test('responsive artwork handles canonical source changes, removals and derivative failures without loops or stranded observers',async()=>{
  const f=await artFixture();
  try{
    const img=f.imgs[0],mutation=f.mutations[0],resize=f.observers[0];
    img.src='https://images.example.org/place.jpg';
    mutation.cb([{type:'attributes',attributeName:'src',target:img}]);
    assert.equal(img.src,'https://images.example.org/place.jpg');assert.equal(img.srcset,'');assert.equal(img.sizes,'');
    assert.equal(img.dataset.discoverRendition,undefined);assert.equal(resize.targets.has(img),false);
    img.src=f.original(f.names[1]);
    mutation.cb([{type:'attributes',attributeName:'src',target:img}]);
    assert.equal(img.dataset.discoverRendition,f.names[1]);assert.equal(resize.targets.has(img),true);
    const before=img.srcWrites;f.listeners.get('error')({target:img});
    assert.equal(img.src,f.original(f.names[1]));assert.equal(img.srcWrites,before+1,'the original is retried once');
    assert.equal(img.srcset,'');assert.equal(img.sizes,'');assert.equal(img.style.opacity,'1');assert.equal(img.dataset.renditionFailed,f.names[1]);
    mutation.cb([{type:'attributes',attributeName:'src',target:img}]);
    assert.equal(resize.targets.has(img),false);assert.equal(img.srcset,'');
    f.listeners.get('error')({target:img});assert.equal(img.srcWrites,before+1,'failed original must not enter a derivative retry loop');
    img.src=f.original(f.names[2]);mutation.cb([{type:'attributes',attributeName:'src',target:img}]);
    assert.equal(img.dataset.discoverRendition,f.names[2],'a different valid source remains eligible for responsive art');
    img.isConnected=false;mutation.cb([{type:'childList',addedNodes:[],removedNodes:[img]}]);
    assert.equal(resize.targets.has(img),false);assert.ok(resize.removals>=3);assert.equal(f.shadow.scans,1);
    const live=f.image();mutation.cb([{type:'childList',addedNodes:[live],removedNodes:[]}]);
    f.api.dispose();assert.equal(resize.targets.size,0);assert.equal(resize.stopped,true);assert.equal(mutation.stopped,true);assert.equal(f.listeners.size,0);
    const untouched=f.image();mutation.cb([{type:'childList',addedNodes:[untouched],removedNodes:[]}]);
    assert.equal(untouched.srcset,'');assert.equal(untouched.srcWrites,0);assert.equal(f.shadow.scans,1);
  }finally{f.restore();}
});
