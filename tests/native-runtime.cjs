'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),path=require('node:path');

test('native runtime scopes document events and pauses animation, timers and observers outside Explore',async()=>{
  const savedWindow=globalThis.window,savedDocument=globalThis.document;
  const frames=new Map(),timers=new Map();let serial=0;
  const localBody={},localRoot={},shadow=new EventTarget(),host={};
  shadow.getElementById=id=>'local:'+id;shadow.querySelector=selector=>'local:'+selector;shadow.querySelectorAll=()=>[];
  const nativeDocument={createElement:tag=>({tagName:tag}),createTextNode:text=>({textContent:text})};
  const nativeWindow=Object.assign(new EventTarget(),{
    requestAnimationFrame(callback){const id=++serial;frames.set(id,callback);return id;},
    cancelAnimationFrame(id){frames.delete(id);},
    setTimeout(callback){const id=++serial;timers.set(id,callback);return id;},clearTimeout(id){timers.delete(id);},
    matchMedia:()=>({matches:false}),getComputedStyle:()=>({}),fetch:()=>Promise.resolve(),alert(){},queueMicrotask,Event,devicePixelRatio:1,
    history:{},location:{},
    ResizeObserver:class{constructor(callback){this.callback=callback;}observe(){}unobserve(){}disconnect(){}},
    IntersectionObserver:class{constructor(callback){this.callback=callback;}observe(){}unobserve(){}disconnect(){}},
  });
  Object.defineProperty(nativeWindow,'localStorage',{get(){throw Error('storage denied');}});
  globalThis.window=nativeWindow;globalThis.document=nativeDocument;
  let runtime;
  try{
    const {createRuntime}=await import(pathToFileURL(path.join(__dirname,'../dist/discover-egypt/runtime.js')).href);
    runtime=createRuntime({host,shadow,body:localBody,documentElement:localRoot,assetURL:x=>x,viewportHeight:()=>650});
    const env=runtime.env;
    assert.equal(env.document.body,localBody);assert.equal(env.document.documentElement,localRoot);
    assert.equal(env.document.getElementById('hero'),'local:hero');assert.equal(env.window.innerHeight,650);
    let clicks=0,scrolls=0,paints=0,waits=0,resizes=0;
    env.document.addEventListener('click',()=>clicks++);env.window.addEventListener('scroll',()=>scrolls++);
    env.requestAnimationFrame(()=>paints++);env.setTimeout(()=>waits++,1000);
    const observer=new env.ResizeObserver(()=>resizes++);observer.observe({});
    shadow.dispatchEvent(new Event('click'));nativeWindow.dispatchEvent(new Event('scroll'));
    assert.equal(clicks,1);assert.equal(scrolls,1);assert.equal(frames.size,1);assert.equal(timers.size,1);
    runtime.setActive(false);assert.equal(frames.size,0);assert.equal(timers.size,0);
    shadow.dispatchEvent(new Event('click'));nativeWindow.dispatchEvent(new Event('scroll'));observer.native.callback([]);
    assert.equal(clicks,1);assert.equal(scrolls,1);assert.equal(resizes,0);
    runtime.setActive(true);assert.equal(frames.size,1);assert.equal(timers.size,1);assert.equal(resizes,1);
    const frame=[...frames.values()][0],timer=[...timers.values()][0];frames.clear();timers.clear();frame();timer();
    assert.equal(paints,1);assert.equal(waits,1);
    assert.throws(()=>env.localStorage.getItem('x'),/storage denied/,'The original storage try/catch sees denied access');
    assert.equal(env.Event,Event);
    runtime.dispose();shadow.dispatchEvent(new Event('click'));nativeWindow.dispatchEvent(new Event('scroll'));
    assert.equal(clicks,1);assert.equal(scrolls,1);assert.equal(frames.size,0);assert.equal(timers.size,0);
  }finally{runtime?.dispose();globalThis.window=savedWindow;globalThis.document=savedDocument;}
});
