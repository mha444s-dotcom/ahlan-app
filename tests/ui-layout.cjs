'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../dist/ui-layout.js'),'utf8');
function fixture(withObserver = true) {
  const events = {}, variables = new Map(), images = [];
  let resize;
  const nav = {height:74.4,getBoundingClientRect(){return {height:this.height};}};
  class Image {
    constructor(complete,naturalWidth){this.complete=complete;this.naturalWidth=naturalWidth;this.values=new Set(['is-loading']);this.attrs={};this.classList={add:x=>this.values.add(x),remove:x=>this.values.delete(x),toggle:(x,on)=>on?this.values.add(x):this.values.delete(x)};}
    setAttribute(k,v){this.attrs[k]=v;}
    matches(){return true;}
  }
  images.push(new Image(true,480),new Image(false,0),new Image(true,0));
  const context = {HTMLImageElement:Image,document:{querySelector:()=>nav,querySelectorAll:()=>images,
    documentElement:{style:{setProperty:(key,value)=>variables.set(key,value)}},
    addEventListener:(name,fn,capture)=>{assert.equal(capture,true);events[name]=fn;}},
    ResizeObserver:withObserver?class {constructor(fn){resize=fn;}observe(target){assert.equal(target,nav);resize();}}:undefined};
  vm.runInNewContext(source,context,{filename:'ui-layout.js'});
  return {events,variables,images,nav,resize,Image};
}
test('mobile bottom clearance tracks the actual nav border-box after font/viewport changes',()=>{
  const f=fixture();assert.equal(f.variables.get('--nav-space'),'75px');
  f.nav.height=111.1;f.resize();assert.equal(f.variables.get('--nav-space'),'112px');
  f.nav.height=0;f.resize();assert.equal(f.variables.get('--nav-space'),'112px');
});
test('image load and error states settle existing and newly rendered media',()=>{
  const f=fixture();assert.ok(f.images[0].values.has('is-loaded'));assert.equal(f.images[0].attrs['aria-busy'],'false');
  assert.ok(f.images[1].values.has('is-loading'));assert.equal(f.images[1].attrs['aria-busy'],'true');
  assert.ok(f.images[2].values.has('is-error'));
  const image=new f.Image(false,0);f.events.error({target:image});assert.ok(image.values.has('is-error'));assert.equal(image.attrs['aria-busy'],'false');
  image.naturalWidth=960;f.events.load({target:image});assert.ok(image.values.has('is-loaded'));assert.ok(!image.values.has('is-error'));
});
test('presentation enhancements do not require ResizeObserver and ignore non-image errors',()=>{
  const f=fixture(false);assert.equal(f.variables.size,0);assert.doesNotThrow(()=>f.events.error({target:{}}));
});
