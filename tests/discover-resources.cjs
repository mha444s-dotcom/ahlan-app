const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

const modulePromise = fs.readFile(path.join(__dirname, '../dist/discover-egypt/resources.js'), 'utf8')
  .then(source => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64')));
const wiki = title => 'https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&titles=' + encodeURIComponent(title);
const json = value => new Response(JSON.stringify(value), {headers:{'Content-Type':'application/json'}});
const tick = () => new Promise(resolve => setImmediate(resolve));

test('concurrent identical Wikipedia requests share work and independent response bodies', async () => {
  const {createDiscoverResourceLoader} = await modulePromise;
  let calls = 0, finish;
  const loader = createDiscoverResourceLoader({fetch:() => { calls++; return new Promise(resolve => { finish = resolve; }); }});
  const first = loader.fetch(wiki('Karnak')), second = loader.fetch(wiki('Karnak'));
  assert.equal(calls, 1);
  finish(json({query:{pages:{one:{thumbnail:{source:'https://example.org/original.jpg'}}}}}));
  const [a,b] = await Promise.all([first,second]);
  assert.notEqual(a,b); assert.deepEqual(await a.json(),await b.json());
  assert.equal((await (await loader.fetch(wiki('Karnak'))).json()).query.pages.one.thumbnail.source,'https://example.org/original.jpg');
  assert.equal(calls,1); loader.dispose();
});

test('queue limits Wikipedia concurrency without changing URLs', async () => {
  const {createDiscoverResourceLoader} = await modulePromise;
  let running = 0, maximum = 0;
  const finishes = [], seen = [];
  const loader = createDiscoverResourceLoader({maxConcurrent:2, fetch:url => {
    seen.push(url); running++; maximum = Math.max(maximum,running);
    return new Promise(resolve => finishes.push(() => { running--; resolve(json({url})); }));
  }});
  const urls = Array.from({length:7},(_,i) => wiki('Original ' + i));
  const jobs = urls.map(url => loader.fetch(url));
  assert.equal(seen.length,2); assert.equal(loader.getStats().queued,5);
  for (let i=0;i<urls.length;i++) { while (!finishes.length) await tick(); finishes.shift()(); await tick(); }
  const values = await Promise.all(jobs.map(async job => (await (await job).json()).url));
  assert.deepEqual(values,urls); assert.equal(maximum,2); loader.dispose();
});

test('429 honors Retry-After, releases queued fallback responses, and retries only after cooldown', async () => {
  const {createDiscoverResourceLoader} = await modulePromise;
  let current = 1000, calls = 0;
  const loader = createDiscoverResourceLoader({maxConcurrent:1,now:()=>current,fetch:async () => {
    calls++; return calls===1 ? new Response('rate limited',{status:429,headers:{'Retry-After':'30'}}) : json({ok:true});
  }});
  const one = loader.fetch(wiki('A')), queued = loader.fetch(wiki('B'));
  assert.equal((await one).status,429); assert.equal((await queued).status,429);
  assert.equal((await loader.fetch(wiki('C'))).status,429);
  assert.equal(calls,1); assert.equal(loader.getStats().cached,0); assert.equal(loader.getStats().queued,0);
  current=30999; assert.equal((await loader.fetch(wiki('A'))).status,429); assert.equal(calls,1);
  current=31001; assert.deepEqual(await (await loader.fetch(wiki('A'))).json(),{ok:true}); assert.equal(calls,2);
  loader.dispose();
});

test('HTTP-date Retry-After and absent Retry-After have bounded temporary cooldowns', async () => {
  const {createDiscoverResourceLoader} = await modulePromise;
  const start=Date.UTC(2026,9,20,12); let current=start;
  const dated=createDiscoverResourceLoader({now:()=>current,fetch:async()=>new Response(null,{status:429,headers:{'Retry-After':new Date(start+20000).toUTCString()}})});
  await dated.fetch(wiki('A')); assert.equal(dated.getStats().blockedUntil,start+20000); dated.dispose();
  const fallback=createDiscoverResourceLoader({now:()=>current,retryAfterMs:45000,fetch:async()=>new Response(null,{status:429})});
  await fallback.fetch(wiki('A')); assert.equal(fallback.getStats().blockedUntil,start+45000); fallback.dispose();
});

test('network failures are not cached or retried automatically', async () => {
  const {createDiscoverResourceLoader} = await modulePromise;
  let calls=0;
  const loader=createDiscoverResourceLoader({fetch:async()=>{calls++; if(calls===1)throw new TypeError('offline'); return json({ok:true});}});
  await assert.rejects(loader.fetch(wiki('A')),/offline/); assert.equal(calls,1); assert.equal(loader.getStats().cached,0);
  assert.deepEqual(await (await loader.fetch(wiki('A'))).json(),{ok:true}); assert.equal(calls,2); loader.dispose();
});

test('paused queues do not start new work; resume preserves callers and disposal aborts only owned requests', async () => {
  const {createDiscoverResourceLoader} = await modulePromise;
  let calls=0, signal;
  const loader=createDiscoverResourceLoader({maxConcurrent:1,fetch:(_url,options)=>{calls++; signal=options.signal; return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))));}});
  loader.setActive(false);
  const waiting=loader.fetch(wiki('A')); assert.equal(calls,0); assert.equal(loader.getStats().queued,1);
  const rejection=assert.rejects(waiting,{name:'AbortError'});
  loader.setActive(true); assert.equal(calls,1);
  const second=loader.fetch(wiki('B')), queuedRejection=assert.rejects(second,{name:'AbortError'});
  loader.dispose(); await Promise.all([rejection,queuedRejection]); assert.equal(signal.aborted,true);
  await assert.rejects(loader.fetch(wiki('C')),{name:'AbortError'});
  assert.equal(loader.getStats().cacheBytes,0);
});

test('LRU cache remains within entry and byte budgets; oversized and no-store responses are not retained', async () => {
  const {createDiscoverResourceLoader} = await modulePromise;
  let calls=0;
  const loader=createDiscoverResourceLoader({maxCacheEntries:2,maxCacheBytes:60,maxResponseBytes:30,fetch:async url=>{calls++;return json({name:new URL(url).searchParams.get('titles')});}});
  await loader.fetch(wiki('A')); await loader.fetch(wiki('B')); await loader.fetch(wiki('A')); await loader.fetch(wiki('C'));
  assert.equal(calls,3); assert.equal(loader.getStats().cached,2); assert.ok(loader.getStats().cacheBytes<=60);
  await loader.fetch(wiki('B')); assert.equal(calls,4);
  await loader.fetch(wiki('A'.repeat(50))); const before=calls; await loader.fetch(wiki('A'.repeat(50))); assert.equal(calls,before+1);
  loader.dispose();
  const noStore=createDiscoverResourceLoader({fetch:async()=>new Response('{}',{headers:{'Cache-Control':'no-store'}})});
  await noStore.fetch(wiki('X')); assert.equal(noStore.getStats().cached,0); noStore.dispose();
});

test('non-thumbnail requests and explicit options pass through unchanged', async () => {
  const {createDiscoverResourceLoader} = await modulePromise;
  const seen=[];
  const loader=createDiscoverResourceLoader({fetch:async (...args)=>{seen.push(args);return json({ok:true});}});
  const opts={headers:{Accept:'text/plain'}};
  await loader.fetch('/local.json'); await loader.fetch('https://example.org/image.jpg'); await loader.fetch(wiki('A'),opts);
  await loader.fetch('https://en.wikipedia.org/w/api.php?action=query&prop=extracts&titles=A');
  assert.deepEqual(seen[0],['/local.json',undefined]); assert.equal(seen[2][1],opts); assert.equal(seen.length,4);
  assert.equal(loader.getStats().cached,0); loader.dispose();
});

test('pending unique queries are bounded without bypassing concurrency or affecting duplicate callers', async () => {
  const {createDiscoverResourceLoader} = await modulePromise;
  let calls=0;
  const loader=createDiscoverResourceLoader({maxPendingEntries:2,fetch:async()=>{calls++;return json({ok:true});}});
  loader.setActive(false);
  const first=loader.fetch(wiki('A')), second=loader.fetch(wiki('B')), duplicate=loader.fetch(wiki('A'));
  assert.equal((await loader.fetch(wiki('C'))).status,503);
  assert.equal(loader.getStats().pending,2); assert.equal(calls,0);
  loader.setActive(true); await Promise.all([first,second,duplicate]); assert.equal(calls,2); loader.dispose();
});
