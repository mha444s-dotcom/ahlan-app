'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/ui-layout.js'),'utf8');
function fixture(embedded=false){
  const handlers=new Map(),variables=new Map(),raf=[],observers=[],resize=[];let context;
  const on=(target,name,callback)=>{const key=target+':'+name;if(!handlers.has(key))handlers.set(key,[]);handlers.get(key).push(callback);};
  const emit=(target,name,event={})=>{for(const callback of handlers.get(target+':'+name)||[])callback(event);};
  class Element{
    constructor(name){this.name=name;this.dataset={};this.attrs={};this.hidden=false;this.className='';this.values=new Set();this.classList={add:x=>this.values.add(x),remove:x=>this.values.delete(x),contains:x=>this.values.has(x),toggle:(x,on)=>on?this.values.add(x):this.values.delete(x)};this.style={getPropertyValue:k=>variables.get(k)||'',setProperty:(k,v)=>variables.set(k,v)};}
    getBoundingClientRect(){const y=context?.scrollY||0;if(this.name==='header')return {top:-y,bottom:100-y,left:0,width:1185,height:100};if(this.name==='nav')return {top:0,bottom:64,left:0,width:1100,height:64};if(this.className==='ahlan-tabs-space'||this.name==='tabs')return {top:130-y,bottom:210-y,left:20,width:1145,height:this.name==='tabs'?64:80};return {top:0,bottom:100,left:0,width:1185,height:100};}
    after(node){node.relative=this;}before(node){node.relative=this;}setAttribute(k,v){this.attrs[k]=String(v);}contains(node){return node===this||node?.owner===this;}
  }
  const header=new Element('header'),tabs=new Element('tabs'),main=new Element('main'),html=new Element('html'),body=new Element('body'),nav=new Element('nav');body.dataset.explorePrototype=String(embedded);
  const discover=new Element('discover'),gallery=new Element('gallery');discover.hidden=!embedded;gallery.hidden=true;
  discover.shadowRoot={querySelector:s=>s==='#heritage-full:not([hidden])'&&!gallery.hidden?gallery:null};
  discover.dispatched=[];discover.dispatchEvent=event=>{discover.dispatched.push(event.type);return true;};
  const document={documentElement:html,body,querySelector:s=>({'.nav':nav,'body > .site-header':header,'main > .tabs':tabs,main}[s]||null),querySelectorAll:()=>[],createElement:()=>new Element('created'),getElementById:id=>id==='explorePrototype'?discover:null,addEventListener:(n,fn)=>on('document',n,fn)};
  context={document,HTMLImageElement:class{},Event:class{constructor(type){this.type=type;}},CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},location:{origin:'http://127.0.0.1:4173'},scrollY:0,innerHeight:900,innerWidth:1200,
    getComputedStyle:e=>e===tabs?{marginTop:'0px',marginBottom:'16px'}:e===main?{paddingTop:'20px'}:{},
    requestAnimationFrame:fn=>{raf.push(fn);return raf.length;},addEventListener:(n,fn,options)=>{if(n==='scroll')assert.equal(options.passive,true);on('window',n,fn);},dispatchEvent:e=>emit('window',e.type,e),
    ResizeObserver:class{constructor(fn){resize.push(fn);}observe(){}},MutationObserver:class{constructor(fn){this.callback=fn;observers.push(this);}observe(){}},
  };context.window=context;vm.runInNewContext(source,context,{filename:'ui-layout.js'});
  const flush=()=>{let count=0;while(raf.length){if(++count>50)throw Error('Unbounded animation queue');raf.shift()();}};
  const scroll=y=>{context.scrollY=y;emit('window','scroll');flush();};
  const discoverScroll=(data,options={})=>{emit('document','ahlan:discover-scroll',{target:options.target||discover,detail:{source:'page',y:0,max:5000,viewport:700,...data}});flush();};
  return {context,document,html,header,tabs,body,variables,discover,gallery,scroll,discoverScroll,flush,emit,resize,route:(isEmbedded=embedded)=>{body.dataset.explorePrototype=String(isEmbedded);discover.hidden=!isEmbedded;for(const observer of observers)observer.callback([]);flush();},hidden:()=>html.dataset.chromeHidden==='true'};
}

test('both shared headers are visible initially and use one measured travel distance',()=>{
  const f=fixture();assert.equal(f.hidden(),false);assert.equal(f.html.classList.contains('ahlan-chrome-ready'),true);assert.equal(f.variables.get('--ahlan-chrome-shift'),'0px');assert.equal(f.variables.get('--ahlan-header-height'),'100px');assert.equal(f.variables.get('--ahlan-tabs-space'),'80px');
  f.scroll(300);assert.equal(f.hidden(),true);assert.equal(f.variables.get('--ahlan-chrome-shift'),'-200px');assert.equal(f.variables.get('--ahlan-chrome-reclaim'),'0px');
});
test('direction thresholds prevent tiny alternating movements from flickering and upward scrolling works in midpage',()=>{
  const f=fixture();f.scroll(300);assert.equal(f.hidden(),true);for(const y of [297,300,297,300])f.scroll(y);assert.equal(f.hidden(),true);
  f.scroll(288);assert.equal(f.hidden(),false);for(const y of [291,288,291,288])f.scroll(y);assert.equal(f.hidden(),false);f.scroll(304);assert.equal(f.hidden(),true);
});
test('the page top, route changes and keyboard focus restore both headers',()=>{
  const f=fixture();f.scroll(400);assert.equal(f.hidden(),true);f.scroll(4);assert.equal(f.hidden(),false);f.scroll(400);assert.equal(f.hidden(),true);
  f.emit('document','focusin',{target:{owner:f.tabs}});assert.equal(f.hidden(),false);f.scroll(440);assert.equal(f.hidden(),true);f.route();assert.equal(f.hidden(),false);
});
test('native Explore page and its separate gallery share header motion without resizing document flow',()=>{
  const f=fixture(true);f.scroll(300);assert.equal(f.hidden(),true);assert.equal(f.variables.get('--ahlan-chrome-reclaim'),'0px');f.scroll(297);assert.equal(f.hidden(),true);f.scroll(285);assert.equal(f.hidden(),false);
  f.gallery.hidden=false;f.discoverScroll({source:'gallery',y:0,reset:true});f.discoverScroll({source:'gallery',y:100});assert.equal(f.hidden(),true);
  f.scroll(0);assert.equal(f.hidden(),true,'Window scroll must not override the active gallery');
  f.discoverScroll({source:'gallery',y:80});assert.equal(f.hidden(),false);f.discoverScroll({source:'gallery',y:120});assert.equal(f.hidden(),true);f.discoverScroll({source:'gallery',y:0});assert.equal(f.hidden(),false);
});
test('foreign, hidden, inactive and malformed native events cannot hide shared application controls',()=>{
  const f=fixture(true);f.discoverScroll({y:0,reset:true});
  for(const data of [{y:300,source:'dialog'},{y:NaN},{max:-1,y:300},{viewport:0,y:300},{source:'gallery',y:Infinity}])f.discoverScroll(data);
  f.discoverScroll({y:300},{target:{}});assert.equal(f.hidden(),false);
  f.discover.hidden=true;f.discoverScroll({y:300});assert.equal(f.hidden(),false);f.discover.hidden=false;
  f.route(false);f.discoverScroll({y:0,reset:true});f.discoverScroll({y:300});assert.equal(f.hidden(),false);
});
test('synthetic native viewport resets do not turn a hidden header into an upward-scroll flicker',()=>{
  const f=fixture(true);f.discoverScroll({y:0,reset:true});f.discoverScroll({y:300});assert.equal(f.hidden(),true);f.discoverScroll({y:280,reset:true});assert.equal(f.hidden(),true);f.discoverScroll({y:268});assert.equal(f.hidden(),false);
  for(const fn of f.resize)fn();f.flush();assert.equal(f.variables.get('--ahlan-chrome-shift'),'0px');
});
test('the first downward scroll after leaving Explore is handled when the host was already at the page top',()=>{
  const f=fixture(true);f.route(false);assert.equal(f.context.scrollY,0);assert.equal(f.hidden(),false);f.scroll(700);assert.equal(f.hidden(),true);f.scroll(680);assert.equal(f.hidden(),false);
});
test('native route changes request a local baseline and handle the first Explore scroll',()=>{
  const f=fixture(false);f.route(true);assert.deepEqual(f.discover.dispatched,['ahlan:request-scroll']);f.scroll(300);assert.equal(f.hidden(),true);f.scroll(280);assert.equal(f.hidden(),false);
});
