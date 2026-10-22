'use strict';
// GitHub Pages project-path smoke tests. Uses an isolated profile; never touches
// personal browser data, source files, Git, remote repositories, or deployment.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const repo = path.resolve(__dirname, '..');

function options(args) {
  const values = {root:'release/ahlan', basePath:'/ahlan-app/', origin:null};
  for (let i=0; i<args.length; i++) {
    const arg=args[i];
    if (arg==='--local') continue;
    if (arg==='--canonical-html') {values.canonicalHtml=true;continue;}
    if (arg==='--help') return {help:true};
    const key={'--root':'root','--base-path':'basePath','--origin':'origin'}[arg];
    if (!key || !args[i+1] || args[i+1].startsWith('--')) throw Error('Usage: node tests/browser-pages.cjs [--local --root release/ahlan --base-path /ahlan-app/] [--origin https://owner.github.io/ahlan-app/]');
    values[key]=args[++i];
  }
  if (!/^\/(?:[^?#\\]*\/)?$/.test(values.basePath) || values.basePath.includes('..')) throw Error('Base path must be an absolute URL directory, e.g. /ahlan-app/.');
  if (values.origin) {
    const u=new URL(values.origin);
    if (!['http:','https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw Error('Origin must be an HTTP(S) app URL without credentials, query, or fragment.');
    if (!u.pathname.endsWith('/')) u.pathname+='/';
    values.origin=u.href;
  }
  return values;
}

async function run(config) {
  const out=path.join(__dirname,'browser-artifacts','pages-'+new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(out,{recursive:true});
  const profile=path.join(out,'profile'); fs.mkdirSync(profile);
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const pending=new Map(), checks=[], exceptions=[], consoleErrors=[], responses=[], failures=[], requests=new Map(), widths=[];
  let server, chrome, ws, sequence=0, appURL=config.origin, offline=false, phase='startup';
  const started=Date.now();
  function local(url) {try {return new URL(url).origin===new URL(appURL).origin;}catch{return false;}}
  function send(method,params={}) {
    return new Promise((resolve,reject)=>{
      if (ws?.readyState!==1) {reject(Error('Chrome connection unavailable: '+method));return;}
      const id=++sequence, timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},45000);
      pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});
      ws.send(JSON.stringify({id,method,params}));
    });
  }
  async function evaluate(expression) {
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  }
  const scoped=expression=>'(()=>{const document=globalThis.document.querySelector("#explorePrototype").shadowRoot;return eval('+JSON.stringify(expression)+');})()';
  const child=expression=>evaluate(scoped(expression));
  async function until(expression,timeout=30000) {
    const deadline=Date.now()+timeout;
    while(Date.now()<deadline) {if(await evaluate(expression))return; await delay(100);}
    throw Error('Condition timed out: '+expression.slice(0,300));
  }
  const untilChild=(expression,timeout)=>until(scoped(expression),timeout);
  async function check(name,callback) {
    phase=name;
    const time=Date.now(), evidence=await callback();
    checks.push({name,passed:true,ms:Date.now()-time,evidence});
    console.log('PASS '+name);
  }
  async function screenshot(name) {
    const result=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(result.data,'base64'));
  }
  async function resize(width) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
    await send('Emulation.setTouchEmulationEnabled',{enabled:width<768,maxTouchPoints:5});
    await delay(150);
  }
  async function scroll(top) {
    await evaluate('window.scrollTo({top:'+top+',behavior:"instant"})'); await delay(300);
  }
  async function reload() {
    await evaluate('window.__pagesReloadMarker=true');
    await send('Page.reload');
    await until('!window.__pagesReloadMarker&&document.readyState==="complete"&&typeof Ahlan!=="undefined"',60000);
  }
  async function explore() {
    await evaluate('navigate({view:"journey",tab:"explore",query:""})');
    await until('document.querySelector("#explorePrototype")?.dataset.discoverMounted==="true"',60000);
    await untilChild('document.querySelectorAll("[data-heritage-entry]").length===9');
  }
  async function closeDialog(id) {
    await child('document.querySelector('+JSON.stringify('#'+id+' .close-dialog')+').click()');
    await untilChild('!document.querySelector('+JSON.stringify('#'+id)+').open');
    await until('history.state?.discoverDialog!=='+JSON.stringify(id));
  }
  async function geometry() {
    await until('[...document.querySelectorAll(".site-header,.tabs")].every(e=>e.getAnimations().every(a=>a.transitionProperty!=="transform"||a.playState!=="running"))',5000);
    return evaluate('(()=>{const box=e=>{const b=e.getBoundingClientRect();return {top:b.top,bottom:b.bottom,height:b.height};};return {header:box(document.querySelector(".site-header")),tabs:box(document.querySelector(".tabs")),scrollY};})()');
  }
  function visible(g) {assert(g.header.top>=-1 && g.tabs.top>=g.header.bottom-1,'Both headers visible: '+JSON.stringify(g));}
  function hidden(g) {assert(g.header.bottom<=1 && g.tabs.bottom<=1,'Both headers hidden: '+JSON.stringify(g));}
  async function startServer() {
    const publicRoot=path.resolve(repo,config.root);
    assert(fs.statSync(path.join(publicRoot,'index.html')).isFile(),'Build the release first.');
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json','.json':'application/json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
    server=http.createServer((req,res)=>{
      let pathname;
      try {pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
      if (pathname===config.basePath.slice(0,-1)) {res.writeHead(301,{Location:config.basePath}).end();return;}
      if (!['GET','HEAD'].includes(req.method) || !pathname.startsWith(config.basePath) || pathname.includes('\\')) {res.writeHead(404).end();return;}
      let relative=pathname.slice(config.basePath.length)||'index.html';
      if(config.canonicalHtml&&pathname.endsWith('.html')){
        const canonical=pathname.endsWith('/index.html')?pathname.slice(0,-10):pathname.slice(0,-5);
        res.writeHead(308,{Location:canonical}).end();return;
      }
      if(config.canonicalHtml&&!path.extname(relative)&&fs.existsSync(path.join(publicRoot,relative+'.html')))relative+='.html';
      const file=path.resolve(publicRoot,relative);
      if (!file.startsWith(publicRoot+path.sep)) {res.writeHead(403).end();return;}
      fs.stat(file,(error,stat)=>{
        if(error||!stat.isFile()) {res.writeHead(404).end();return;}
        res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
      });
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
    appURL='http://127.0.0.1:'+server.address().port+config.basePath;
  }
  async function startBrowser() {
    let stderr='', spawnError;
    const executable=process.env.CHROME_BIN||process.env.AHLAN_TEST_CHROME||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'/usr/bin/google-chrome');
    chrome=spawn(executable,['--headless=new',...require('./chrome-test-options.cjs').cacheLimits,'--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
    chrome.on('error',error=>{spawnError=error;});
    chrome.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-5000);});
    let port;
    for(let i=0;i<200;i++) {
      if(spawnError)throw spawnError;
      try {port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0];if(/^\d+$/.test(port))break;}catch{}
      if(chrome.exitCode!==null)throw Error('Chrome exited: '+stderr);
      await delay(100);
    }
    assert(port,'Chrome startup timed out: '+stderr);
    const target=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(page=>page.type==='page');
    assert(target,'Chrome page target exists');
    ws=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
    ws.addEventListener('message',event=>{
      const message=JSON.parse(event.data);
      if(message.id) {const p=pending.get(message.id);pending.delete(message.id);if(p)message.error?p.reject(Error(message.error.message)):p.resolve(message.result);return;}
      const data=message.params;
      if(message.method==='Runtime.exceptionThrown')exceptions.push({phase,description:data.exceptionDetails.exception?.description||data.exceptionDetails.text});
      if(message.method==='Runtime.consoleAPICalled'&&data.type==='error')consoleErrors.push({phase,text:data.args.map(arg=>String(arg.value??arg.description??arg.type).slice(0,300)).join(' '),stack:data.stackTrace?.callFrames?.slice(0,3)});
      if(message.method==='Network.requestWillBeSent')requests.set(data.requestId,data.request.url);
      if(message.method==='Network.responseReceived'&&data.response.status>=400)responses.push({phase,url:data.response.url,status:data.response.status,offline});
      if(message.method==='Network.loadingFailed'&&requests.has(data.requestId))failures.push({phase,url:requests.get(data.requestId),reason:data.errorText,canceled:!!data.canceled,offline});
    });
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await resize(375);
    const response=await send('Page.navigate',{url:appURL+'#/home'});
    assert(!response.errorText,'Navigation: '+response.errorText);
    await until('typeof Ahlan!=="undefined"&&typeof navigate==="function"',60000);
    await evaluate('Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,5000))]).then(()=>true)');
  }
  try {
    if(!appURL)await startServer();
    const ping=await fetch(appURL,{signal:AbortSignal.timeout(20000)});
    assert.equal(ping.status,200,'Application URL must serve index.html.');
    await startBrowser();
    await check('Main routes and all 14 content sections open under the project path',async()=>{
      const routes=[['home','homeScreen()','Ahlan.state.view==="home"'],['outside','navigate({view:"journey",tab:"outside",query:""})','Ahlan.state.tab==="outside"&&document.querySelectorAll("#journeyPage .journey-card").length>0'],['inside','navigate({view:"journey",tab:"inside",query:""})','Ahlan.state.tab==="inside"&&document.querySelectorAll("#journeyPage .journey-card").length>0'],['saved','navigate({view:"saved",query:""})','Ahlan.state.view==="saved"'],['plan','navigate({view:"plan",query:""})','Ahlan.state.view==="plan"']];
      routes.push(['profile','profile()','Ahlan.state.view==="section"&&Ahlan.state.section===13&&document.querySelector("#localProfile")!==null']);
      for(const [,action,expected]of routes) {await evaluate(action);assert.equal(await evaluate(expected),true);}
      const count=await evaluate('Ahlan.sections.length'); assert.equal(count,14);
      for(let i=0;i<count;i++) {await evaluate('openContent('+i+',0)');assert.equal(await evaluate('Ahlan.state.section'),i);assert(await evaluate('document.querySelector("#sectionPage").classList.contains("visible")&&document.querySelector("#sectionPage").textContent.trim().length>50'));}
      assert.equal(await evaluate('location.pathname'),new URL(appURL).pathname);
      await evaluate('homeScreen()'); await scroll(0); await screenshot('375-home');
      return {routes:routes.map(x=>x[0]),sections:count,base:appURL};
    });
    await check('Native Discover retains nine categories and eleven eras without an iframe',async()=>{
      await explore();
      const counts=await child('({categories:document.querySelectorAll("[data-heritage-entry]").length,eras:document.querySelectorAll("[data-era]").length,stages:document.querySelectorAll("#heritage-tomb-stage").length})');
      assert.deepEqual(counts,{categories:9,eras:11,stages:1});
      assert.equal(await evaluate('document.querySelectorAll("iframe").length'),0);
      assert.equal(await evaluate('document.querySelectorAll("#explorePrototype").length'),1);
      return counts;
    });
    await check('Search, detail dialog, era selection and browser Back work',async()=>{
      await child('(()=>{const i=document.querySelector("#global-search");i.value="الكرنك";i.dispatchEvent(new Event("input",{bubbles:true}));})()');
      assert(await child('document.querySelectorAll("#results-grid .result").length>0'));
      await child('document.querySelector("#results-grid .result").click()');
      await until('history.state?.discoverDialog==="info-dialog"');
      await evaluate('history.back()'); await untilChild('!document.querySelector("#info-dialog").open');
      assert.equal(await evaluate('isExplorePrototype()'),true);
      await child('document.querySelector("#clear-search").click();document.querySelectorAll("[data-era]")[3].click()');
      assert.equal(await child('document.querySelector("#era-count").textContent'),'04');
    });
    await check('Original gate animates and a changed category resets and reveals four models',async()=>{
      await child('window.__pagesGateStates=[];window.__pagesDustDraws=0;new MutationObserver(()=>{const c=document.querySelector("#heritage-tomb-stage").className;if(window.__pagesGateStates.at(-1)!==c)window.__pagesGateStates.push(c);}).observe(document.querySelector("#heritage-tomb-stage"),{attributes:true,attributeFilter:["class"]});(()=>{const c=document.querySelector("#heritage-tomb-dust").getContext("2d"),draw=c.drawImage;c.drawImage=function(...args){window.__pagesDustDraws++;return draw.apply(this,args);};})();document.querySelectorAll("[data-heritage-entry]")[1].click();');
      await untilChild('document.querySelector("#heritage-tomb-stage").classList.contains("tomb-opening")',30000);
      await screenshot('375-gate-opening');
      await untilChild('document.querySelector("#heritage-tomb-stage").classList.contains("tomb-complete")',30000);
      const gate=await child('({states:window.__pagesGateStates,draws:window.__pagesDustDraws,models:document.querySelectorAll("#heritage-preview .heritage-preview-card").length,canvasWidth:document.querySelector("#heritage-tomb-dust").width})');
      for(const stage of ['tomb-resetting','tomb-opening','tomb-push','tomb-cloud','tomb-complete'])assert(gate.states.some(x=>x.split(" ").includes(stage)),stage);
      assert(gate.draws>0&&gate.canvasWidth>0,'Dust canvas draws'); assert.equal(gate.models,4);
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await child('document.querySelectorAll("[data-heritage-entry]")[2].click()');
      await untilChild('document.querySelector("#heritage-tomb-stage").classList.contains("tomb-complete")');
      assert.equal(await child('document.querySelectorAll("#heritage-preview .heritage-preview-card").length'),4);
      await send('Emulation.setEmulatedMedia',{features:[]}); return gate;
    });
    await check('Subgallery contains 170 records and filters, search and Back preserve the app route',async()=>{
      await child('document.querySelector("#heritage-open-all").click()');
      await untilChild('!document.querySelector("#heritage-full").hidden');
      await child('document.querySelector(\'[data-heritage-cat="الكل"]\').click()');
      assert.equal(await child('document.querySelectorAll("#ancient-grid .heritage-piece").length'),170);
      await screenshot('375-gallery');
      await child('(()=>{const i=document.querySelector("#heritage-search");i.value="الكرنك";i.dispatchEvent(new Event("input",{bubbles:true}));})()');
      assert.deepEqual(await child('[...document.querySelectorAll("#ancient-grid .heritage-piece")].map(x=>x.dataset.open)'),['heritage-item-1','heritage-item-100']);
      await child('document.querySelector("#ancient-grid .heritage-piece").click()');
      assert.equal(await child('document.querySelector("#dialog-title").textContent'),'الكرنك'); await closeDialog('info-dialog');
      await child('(()=>{const i=document.querySelector("#heritage-search");i.value="__no_match__";i.dispatchEvent(new Event("input",{bubbles:true}));})()');
      assert(await child('!!document.querySelector("#ancient-grid .heritage-empty")'));
      await evaluate('history.back()'); await untilChild('document.querySelector("#heritage-full").hidden');
      assert.equal(await evaluate('isExplorePrototype()'),true); return {records:170,searchMatches:2};
    });
    await check('Discover favorites and native DOM persist when leaving and returning',async()=>{
      const original=await evaluate('localStorage.getItem("ahlan-saved")');
      await child('document.querySelector("button.fav[data-fav]").click()');
      await evaluate('document.querySelector(".nav [data-nav=saved]").click()');
      await untilChild('document.querySelector("#favorites-dialog").open');
      assert(await child('document.querySelectorAll("#favorites-list [data-open]").length>0'));
      await closeDialog('favorites-dialog');
      assert.equal(await evaluate('localStorage.getItem("ahlan-saved")'),original);
      await evaluate('window.__pagesStage=document.querySelector("#explorePrototype").shadowRoot.querySelector("#heritage-tomb-stage");navigate({view:"journey",tab:"inside",query:""})');
      assert.equal(await evaluate('document.querySelector("#explorePrototype").hidden'),true);
      await explore();
      assert.equal(await evaluate('document.querySelector("#explorePrototype").shadowRoot.querySelector("#heritage-tomb-stage")===window.__pagesStage'),true);
    });
    await check('375/390/768/1440 layouts preserve local images and synchronized scroll headers',async()=>{
      await evaluate('Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,5000))]).then(()=>true)');
      for(const width of [375,390,768,1440]) {
        await resize(width); await scroll(0); await delay(400); await screenshot(width+'-discover');
        const metrics=await evaluate('(()=>{const r=document.querySelector("#explorePrototype").shadowRoot;return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,badLocalImages:[...r.querySelectorAll("img")].filter(i=>{const b=i.getBoundingClientRect();return b.bottom>0&&b.top<innerHeight&&b.width>0&&b.height>0&&i.complete&&!i.naturalWidth&&(i.src.startsWith(location.origin)||i.src.startsWith("data:"));}).map(i=>i.src)};})()');
        assert(metrics.scrollWidth<=width+1,'No horizontal overflow: '+JSON.stringify(metrics));assert.deepEqual(metrics.badLocalImages,[]);
        visible(await geometry()); await scroll(700); hidden(await geometry()); await scroll(697); hidden(await geometry()); await scroll(600); visible(await geometry());
        await child('document.querySelector("#heritage-gallery").scrollIntoView({block:"start",behavior:"instant"})');await delay(250);await screenshot(width+'-heritage'); widths.push(metrics);
      }
      return widths;
    });
    await check('Mobile touch swipes the era rail without horizontal page overflow',async()=>{
      await resize(390);
      await child('document.querySelector("#timeline-rail").scrollIntoView({block:"center",behavior:"instant"});document.querySelector("#timeline-rail").scrollLeft=0'); await delay(300);
      const box=await child('(()=>{const e=document.querySelector("#timeline-rail"),b=e.getBoundingClientRect();return {x:Math.round(b.left+b.width*.45),y:Math.round(Math.max(180,Math.min(innerHeight-150,b.top+b.height*.5))),before:e.scrollLeft};})()');
      for(const distance of [180,-180]) {
        await send('Input.synthesizeScrollGesture',{x:box.x,y:box.y,xDistance:distance,yDistance:0,gestureSourceType:'touch',speed:350});await delay(250);
        if(await child('document.querySelector("#timeline-rail").scrollLeft')!==box.before)break;
      }
      if(await child('document.querySelector("#timeline-rail").scrollLeft')===box.before) {
        await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x,y:box.y}]});
        for(let i=1;i<=8;i++) {await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+i*18,y:box.y}]});await delay(30);}
        await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(300);
      }
      assert.notEqual(await child('document.querySelector("#timeline-rail").scrollLeft'),box.before);
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
    });
    await check('Manifest, install icons and actual worker are scoped to the project URL',async()=>{
      const manifest=await send('Page.getAppManifest'); assert.deepEqual(manifest.errors,[]);assert(manifest.data);
      const data=JSON.parse(manifest.data), manifestURL=new URL(manifest.url);
      assert.equal(manifestURL.href,new URL('manifest.webmanifest',appURL).href);
      assert.equal(new URL(data.scope,manifestURL).href,appURL);assert.equal(new URL(data.start_url,manifestURL).href,appURL);assert.equal(data.display,'standalone');
      for(const icon of data.icons) {
        const iconURL=new URL(icon.src,manifestURL).href; assert(iconURL.startsWith(appURL));
        const dimensions=await evaluate('new Promise((resolve,reject)=>{const i=new Image(),t=setTimeout(()=>reject(Error("Install icon timeout")),15000);i.onload=()=>{clearTimeout(t);resolve([i.naturalWidth,i.naturalHeight]);};i.onerror=()=>{clearTimeout(t);reject(Error("Install icon failed"));};i.src='+JSON.stringify(iconURL)+';})');
        assert.equal(dimensions.join('x'),icon.sizes);
      }
      await until('navigator.serviceWorker.getRegistration().then(r=>r?.active?.state==="activated")',60000);
      const registration=await evaluate('navigator.serviceWorker.getRegistration().then(r=>({scope:r.scope,script:r.active.scriptURL,state:r.active.state}))');
      assert.equal(registration.scope,appURL);assert.equal(registration.script,new URL('sw.js',appURL).href);
      const installability=await send('Page.getInstallabilityErrors');assert.deepEqual(installability.installabilityErrors,[]);
      return {manifestURL:manifest.url,registration,installability};
    });
    await check('Normal reload is controlled and native Discover reloads offline from the project cache',async()=>{
      const htmlCache=await evaluate('caches.keys().then(async names=>{const cache=await caches.open(names.find(n=>n.endsWith("-shell")));return Promise.all(["index.html","offline.html","discover-egypt/page.html"].map(async file=>{const r=await cache.match(new URL(file,location.href).href);return {file,present:!!r,redirected:r?.redirected};}));})');
      assert(htmlCache.every(item=>item.present&&!item.redirected),'Cached HTML must be safe for controlled navigation: '+JSON.stringify(htmlCache));
      await explore(); await reload(); await until('!!navigator.serviceWorker.controller'); await until('document.querySelector("#explorePrototype")?.dataset.discoverMounted==="true"',60000);
      const caches=await evaluate('caches.keys().then(async names=>Promise.all(names.map(async name=>({name,count:(await(await caches.open(name)).keys()).length}))))');
      assert(caches.some(x=>x.name.endsWith('-shell')&&x.count>=48));
      offline=true;
      await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
      await reload();await until('document.querySelector("#explorePrototype")?.dataset.discoverMounted==="true"',60000);
      const counts=await child('({eras:document.querySelectorAll("[data-era]").length,categories:document.querySelectorAll("[data-heritage-entry]").length})');
      assert.deepEqual(counts,{eras:11,categories:9});assert.equal(await evaluate('location.pathname'),new URL(appURL).pathname);
      await scroll(0);await screenshot('390-offline-discover');
      await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
      await delay(250); offline=false;
      await reload();await until('document.querySelector("#explorePrototype")?.dataset.discoverMounted==="true"',60000);
      return {caches,counts,htmlCache,note:'Cached app code/data works offline. External images/APIs/fonts and unvisited art remain network-dependent.'};
    });
    phase='final-resource-review'; await delay(300);
    const localResponses=responses.filter(x=>local(x.url)&&!x.offline);
    const localFailures=failures.filter(x=>local(x.url)&&!x.offline&&!x.canceled&&x.reason!=='net::ERR_ABORTED');
    const escapedRequests=[...new Set([...requests.values()].filter(url=>local(url)&&!url.startsWith(appURL)))];
    assert.deepEqual(exceptions,[],'Unhandled JavaScript exceptions');
    assert.deepEqual(consoleErrors,[],'Application console errors');
    assert.deepEqual(localResponses,[],'Failed same-origin resources');
    assert.deepEqual(localFailures,[],'Failed same-origin loads outside the intentional offline phase');
    assert.deepEqual(escapedRequests,[],'Same-origin resources escaped the app project prefix');
    const report={status:'Passed',appURL,elapsedMs:Date.now()-started,checks,widths,exceptions,consoleErrors,responses,failures,externalIssues:{responses:responses.filter(x=>!local(x.url)&&!x.offline),failures:failures.filter(x=>!local(x.url)&&!x.offline)},offlineLimitations:'No claim that external services or all unvisited media work offline.',browser:'Actual desktop Chrome with mobile viewport and touch emulation; not physical Android/iOS or Safari.'};
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
    console.log('EVIDENCE '+path.join(out,'results.json'));
    return report;
  } catch(error) {
    try {await screenshot('failure');}catch{}
    fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({status:'Failed',phase,error:error.stack,appURL,checks,widths,exceptions,consoleErrors,responses,failures},null,2)+'\n');
    throw error;
  } finally {
    if(ws?.readyState===1) {
      ws.send(JSON.stringify({id:++sequence,method:'Browser.close'}));
      await Promise.race([new Promise(resolve=>ws.addEventListener('close',resolve,{once:true})),delay(1500)]);ws.close();
    }
    for(const p of pending.values())p.reject(Error('Test finished'));pending.clear();
    if(chrome?.exitCode===null)chrome.kill();
    if(server)await new Promise(resolve=>server.close(resolve));
  }
}

if(require.main===module) {
  let config;
  try {config=options(process.argv.slice(2));}catch(error){console.error(error.message);process.exitCode=1;}
  if(config?.help)console.log('node tests/browser-pages.cjs --local --root release/ahlan --base-path /ahlan-app/\nnode tests/browser-pages.cjs --origin https://owner.github.io/ahlan-app/\nChrome: CHROME_BIN, AHLAN_TEST_CHROME, or the system Chrome default. Evidence stays in tests/browser-artifacts/pages-*.');
  else if(config)run(config).catch(error=>{console.error(error.stack);process.exitCode=1;});
}
module.exports={options};
