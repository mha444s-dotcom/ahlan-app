'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'dist/sw.js'), 'utf8');
const base = 'https://example.test/ahlan/';
const key = request => typeof request === 'string' ? request : request.url;

function fixture(network = async request => new Response(key(request), {headers:{'Content-Type':'text/plain'}})) {
  const listeners = new Map();
  const stores = new Map();
  const failures = {put:false, install:false, redirectHtml:false};
  function redirected(response) {
    const clone=response.clone.bind(response);
    Object.defineProperty(response,'redirected',{value:true});
    response.clone=()=>redirected(clone());
    return response;
  }
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const values = stores.get(name);
      return {
        async match(request) { return values.get(key(request))?.clone(); },
        async put(request, response) {
          if (failures.put) throw new Error('QuotaExceededError');
          values.set(key(request), response.clone());
        },
        async delete(request) { return values.delete(key(request)); },
        async keys() { return [...values.keys()].map(url => new Request(url)); },
        async addAll(requests) {
          if (failures.install) throw new Error('404 shell dependency');
          for (const request of requests) {
            const url=key(request), html=failures.redirectHtml&&url.endsWith('.html');
            const response=new Response('release:'+url, html?{headers:{'Content-Type':'text/html; charset=utf-8','Content-Encoding':'gzip','Content-Length':'1'}}:undefined);
            values.set(url,html?redirected(response):response);
          }
        }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); }
  };
  const context = vm.createContext({URL, Request, Response, Headers, console, caches, fetch:network,
    self:{location:{href:base+'sw.js'},addEventListener:(name, callback)=>listeners.set(name, callback)}});
  vm.runInContext(source, context);
  async function lifecycle(name) {
    let work;
    listeners.get(name)({waitUntil(value) {work=value;}});
    await work;
  }
  async function fetchEvent(url, options = {}) {
    let responsePromise;
    const background = [];
    const request = {url,method:'GET',mode:'cors',destination:'',headers:new Headers(),...options};
    const event = {request,respondWith(value) {responsePromise=value;},waitUntil(value) {background.push(value);}};
    listeners.get('fetch')(event);
    const response = await responsePromise;
    await Promise.all(background);
    return response;
  }
  return {listeners, stores, caches, failures, lifecycle, fetchEvent};
}

test('manifest uses current app identity and valid 192/512/Apple PNG derivatives', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.dir, 'rtl');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.prefer_related_applications, false);
  for (const dimension of [192,512]) assert(manifest.icons.some(icon => icon.sizes === `${dimension}x${dimension}`));
  for (const [name, expected] of [['icon-192.png',192],['icon-512.png',512],['icon-maskable-512.png',512],['apple-touch-icon.png',180]]) {
    const data = fs.readFileSync(path.join(root, 'dist/assets/pwa', name));
    assert.equal(data.readUInt32BE(16), expected);
    assert.equal(data.readUInt32BE(20), expected);
  }
  assert(manifest.icons.some(icon => icon.purpose === 'maskable'));
});

test('shell contains every local script, stylesheet and Discover dependency without large art', () => {
  const list = [...source.match(/const SHELL = (\[[\s\S]*?\]);/)[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  const index = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
  for (const match of index.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"#]+)"/g)) {
    if (/^https?:/.test(match[1]) || match[1].startsWith('assets/')) continue;
    assert(list.includes(match[1]), `${match[1]} is missing from shell`);
  }
  let bytes = 0;
  for (const file of list) {
    assert(fs.existsSync(path.join(root,'dist',file)), `shell resource missing: ${file}`);
    bytes += fs.statSync(path.join(root,'dist',file)).size;
  }
  assert(bytes < 2 * 1024 * 1024, `shell is ${bytes} bytes`);
  assert(!list.some(file => /discover-egypt\/assets\//.test(file)));
  assert(!list.some(file => /^https?:/.test(file)));
});

test('versioned shell serves one release offline and does not silently mix network code', async () => {
  let networkCalls = 0;
  const f = fixture(async () => {networkCalls++; throw new Error('offline');});
  await f.lifecycle('install');
  const page = await f.fetchEvent(base, {mode:'navigate'});
  assert.match(await page.text(), /release:.*index\.html/);
  const module = await f.fetchEvent(base+'discover-egypt/page.js');
  assert.match(await module.text(), /release:/);
  assert.equal(networkCalls, 0);
});

test('uncached same-origin document gets honest offline page; unrelated requests stay untouched', async () => {
  const f = fixture(async () => {throw new Error('offline');});
  await f.lifecycle('install');
  const offline = await f.fetchEvent(base+'unavailable.html', {mode:'navigate'});
  assert.match(await offline.text(), /offline\.html/);
  assert.equal(await f.fetchEvent('https://en.wikipedia.org/api/rest_v1/page/summary/Egypt'), undefined);
  assert.equal(await f.fetchEvent(base+'api/account'), undefined);
  assert.equal(await f.fetchEvent(base+'assets/home.png', {method:'POST',destination:'image'}), undefined);
  assert.equal(await f.fetchEvent('https://example.test/another-app/app.js'), undefined);
});

test('canonical HTML redirects are cached as exact non-redirected bytes for controlled navigation',async()=>{
  const f=fixture(async()=>{throw Error('offline');});f.failures.redirectHtml=true;
  await f.lifecycle('install');
  for(const [url,options,file]of [[base,{mode:'navigate'},'index.html'],[base+'discover-egypt/page.html',{},'discover-egypt/page.html'],[base+'missing',{mode:'navigate'},'offline.html']]){
    const response=await f.fetchEvent(url,options);assert.equal(response.redirected,false);
    assert.equal(response.headers.get('Content-Type'),'text/html; charset=utf-8');
    assert.equal(response.headers.get('Content-Encoding'),null);assert.equal(response.headers.get('Content-Length'),null);
    assert.equal(await response.text(),'release:'+base+file);
  }
});

test('failure to normalize redirected HTML rejects installation rather than activating a broken shell',async()=>{
  const f=fixture();f.failures.redirectHtml=true;f.failures.put=true;
  await assert.rejects(()=>f.lifecycle('install'),/QuotaExceededError/);
});

test('image cache stores only successful, sized local images and never 429 responses', async () => {
  let calls=0;
  const f = fixture(async request => {
    calls++;
    if (key(request).endsWith('/limited.png')) return new Response('rate limited', {status:429,headers:{'Content-Type':'text/plain','Content-Length':'12'}});
    if (key(request).endsWith('/unknown.png')) return new Response('image', {headers:{'Content-Type':'image/png'}});
    return new Response('image', {headers:{'Content-Type':'image/png','Content-Length':'5'}});
  });
  const url = base+'assets/original.png';
  assert.equal((await f.fetchEvent(url,{destination:'image'})).status,200);
  await f.fetchEvent(url,{destination:'image'});
  assert.equal(calls,1);
  for (const file of ['limited.png','unknown.png']) {
    await f.fetchEvent(base+'assets/'+file,{destination:'image'});
    await f.fetchEvent(base+'assets/'+file,{destination:'image'});
  }
  assert.equal(calls,5);
  const images = [...f.stores].find(([name])=>name.endsWith('-images'))[1];
  assert.equal(images.size,1);
});

test('image eviction enforces byte budget and quota errors cannot break a successful image response', async () => {
  const f = fixture(async () => new Response('image',{headers:{'Content-Type':'image/png','Content-Length':String(4*1024*1024)}}));
  for(let i=0;i<12;i++) await f.fetchEvent(base+`assets/${i}.png`,{destination:'image'});
  const images = [...f.stores].find(([name])=>name.endsWith('-images'))[1];
  assert.equal(images.size,10);
  assert(!images.has(base+'assets/0.png'));
  f.failures.put=true;
  const response=await f.fetchEvent(base+'assets/new.png',{destination:'image'});
  assert.equal(response.status,200);
});

test('small image cache also enforces its entry limit', async () => {
  const f=fixture(async () => new Response('x',{headers:{'Content-Type':'image/png','Content-Length':'1'}}));
  for(let i=0;i<66;i++) await f.fetchEvent(base+`assets/icon-${i}.png`,{destination:'image'});
  const images=[...f.stores].find(([name])=>name.endsWith('-images'))[1];
  assert.equal(images.size,64);
  assert(!images.has(base+'assets/icon-0.png'));
});

test('activation cleans this scope old releases only and never forces live pages to reload', async () => {
  const f = fixture();
  await f.caches.open('other-app-shell');
  await f.caches.open('ahlan-pwa-%2Fother%2F-old-shell');
  await f.caches.open('ahlan-pwa-%2Fahlan%2F-old-shell');
  await f.lifecycle('install');
  await f.lifecycle('activate');
  assert(f.stores.has('other-app-shell'));
  assert(f.stores.has('ahlan-pwa-%2Fother%2F-old-shell'));
  assert(!f.stores.has('ahlan-pwa-%2Fahlan%2F-old-shell'));
  assert(!/self\.skipWaiting\s*\(/.test(source));
  assert(!/self\.clients\.claim\s*\(/.test(source));
  assert(!/\b(localStorage|indexedDB)\b/.test(source));
});

test('an incomplete shell fails installation rather than activating partial application code', async () => {
  const f=fixture();
  f.failures.install=true;
  await assert.rejects(()=>f.lifecycle('install'), /404 shell dependency/);
});

test('local server provides correct PWA and WebP content types', async t => {
  const server=require('../serve-local.cjs');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  for(const [file,type] of [['manifest.webmanifest','application/manifest+json'],['sw.js','text/javascript'],['discover-egypt/assets/6db1234688dff988211f94715b33a602145d2c128ac4f0283d6d5cf31f182cc2.webp','image/webp']]) {
    const response=await fetch(origin+'/'+file,{method:'HEAD'});
    assert.equal(response.status,200);
    assert(response.headers.get('Content-Type').startsWith(type));
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
});
