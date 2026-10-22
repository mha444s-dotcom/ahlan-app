'use strict';
// Actual Chrome, isolated profile, per-frame DOM evidence and filmstrips.
// --baseline records the old behavior without asserting the regression fix.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..');
async function run(args){
  const value=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
  const baseline=args.includes('--baseline'), origin=value('--origin',null);
  const root=path.resolve(repo,value('--root','release/ahlan'));
  const upgradeFrom=value('--upgrade-from',null);
  let publicRoot=upgradeFrom?path.resolve(repo,upgradeFrom):root,upgradeEvidence=null;
  const out=path.join(__dirname,'browser-artifacts','startup-'+(baseline?'before-':'after-')+new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(out,{recursive:true});
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  let server,chrome,ws,url=origin,seq=0,phase='',film=0;
  const pending=new Map(),errors=[],runs=[],delayed=new Set();
  function send(method,params={}){return new Promise((resolve,reject)=>{
    const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},60000);
    pending.set(id,{resolve:x=>{clearTimeout(t);resolve(x);},reject:x=>{clearTimeout(t);reject(x);}});
    ws.send(JSON.stringify({id,method,params}));
  });}
  async function js(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  async function until(expression){for(let i=0;i<600;i++){if(await js(expression))return;await pause(100);}throw Error('Timed out: '+expression);}
  const probe=`(()=>{
    const frames=window.__startupFrames=[]; let count=0;
    const visible=e=>!!e&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
    function frame(){
      const b=document.body,h=document.querySelector('.site-header'),home=document.querySelector('#home');
      if(b&&h){
        const nav=document.querySelector('.nav'), shadow=document.querySelector('#explorePrototype')?.shadowRoot;
        const raw=nav?[...nav.children].some(e=>/[◉♧♡▤☻]/u.test(e.textContent)):false;
        frames.push({t:performance.now(),styled:getComputedStyle(h).display==='block'&&getComputedStyle(h).backgroundColor!=='rgba(0, 0, 0, 0)',design:b.dataset.designSample??null,route:document.documentElement.dataset.startupView??null,home:visible(home),hero:visible(document.querySelector('.home-discovery')),raw,header:visible(h),ready:!!document.querySelector('#welcome'),discover:!!shadow?.querySelector('[data-discover-body]')});
      }
      if(++count<10000)requestAnimationFrame(frame);
    } requestAnimationFrame(frame);
  })()`;
  try{
    if(!url){
      const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
      server=http.createServer((req,res)=>{let p;try{p=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
        if(p.endsWith('.html')){res.writeHead(308,{Location:p.endsWith('/index.html')?p.slice(0,-10):p.slice(0,-5)}).end();return;}
        let file=path.resolve(publicRoot,'.'+(p==='/'?'/index.html':p));
        if(!file.startsWith(publicRoot+path.sep)){res.writeHead(403).end();return;}
        if(!path.extname(file)&&fs.existsSync(file+'.html'))file+='.html';
        fs.stat(file,(e,s)=>{if(e||!s.isFile()){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);});
      });
      await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port+'/';
    }
    chrome=spawn(process.env.CHROME_BIN||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new',...require('./chrome-test-options.cjs').cacheLimits,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-features=BackForwardCache','--remote-debugging-port=0','--user-data-dir='+path.join(out,'profile'),'about:blank'],{stdio:'ignore',windowsHide:true});
    let port;for(let i=0;i<200;i++){try{port=fs.readFileSync(path.join(out,'profile/DevToolsActivePort'),'utf8').split(/\r?\n/)[0];}catch{}if(port)break;await pause(100);}
    assert(port,'Chrome started');
    const target=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(x=>x.type==='page');
    ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
    ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);return;}
      if(m.method==='Runtime.exceptionThrown')errors.push({phase,error:m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text});
      if(m.method==='Fetch.requestPaused'){
        const p=m.params; const task=(async()=>{if(p.request.url.endsWith('/app-v3.js'))await pause(1200);await send('Fetch.continueRequest',{requestId:p.requestId});})();delayed.add(task);task.finally(()=>delayed.delete(task)).catch(()=>{});
      }
      if(m.method==='Page.screencastFrame'){
        send('Page.screencastFrameAck',{sessionId:m.params.sessionId}).catch(()=>{});
        if(film<50)fs.writeFileSync(path.join(out,phase+'-'+String(film++).padStart(3,'0')+'.jpg'),Buffer.from(m.params.data,'base64'));
      }
    });
    await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:probe});
    if(upgradeFrom){
      assert(!origin,'A cache-upgrade fixture uses only the local server');phase='old-cache-upgrade';
      await send('Page.navigate',{url:url+'#/home'});
      await until('document.readyState==="complete"&&!!document.querySelector("#welcome")');
      await js('navigator.serviceWorker.ready.then(()=>true)');
      await js('window.__oldReload=true');await send('Page.reload');
      await until('!window.__oldReload&&document.readyState==="complete"&&navigator.serviceWorker.controller!==null');
      const oldCaches=await js('caches.keys()');
      await js('localStorage.setItem("ahlan-saved","[1,101]");localStorage.setItem("ahlan-profile",JSON.stringify({city:"cache-upgrade-preserved"}));true');
      publicRoot=root;
      await send('Network.clearBrowserCache');
      await js('navigator.serviceWorker.getRegistration().then(r=>r.update()).then(()=>true)');
      await until('navigator.serviceWorker.getRegistration().then(r=>!!r.waiting)');
      // Native lifecycle: leave the old app; no skipWaiting, claim or forced reload.
      await send('Page.navigate',{url:'about:blank'});await pause(2000);
      await send('Page.navigate',{url:url+'#/journey?tab=explore'});
      await until('document.querySelector("#explorePrototype")?.dataset.discoverMounted==="true"');
      assert.equal(await js('!!document.querySelector("script[data-startup]")'),true);
      const newCaches=await js('caches.keys()');
      assert(oldCaches.some(x=>x.endsWith('-shell')));
      assert(oldCaches.every(x=>!newCaches.includes(x)),'Only the new complete shell activates after the old client closes');
      assert.equal(await js('localStorage.getItem("ahlan-saved")'),'[1,101]');
      assert.equal(await js('JSON.parse(localStorage.getItem("ahlan-profile")).city'),'cache-upgrade-preserved');
      const upgradedFrames=await js('window.__startupFrames.filter(x=>x.styled)');
      assert(upgradedFrames.length>0);assert(upgradedFrames.every(x=>x.design==='home'&&!x.home&&!x.raw));
      upgradeEvidence={oldCaches,newCaches,savedAndProfilePreserved:true,wrongFrames:0};
      console.log('CHECK old-cache-upgrade: new shell active; saved legacy IDs and profile preserved');
    }
    const scenarios=[
      {name:'cold-home-mobile',hash:'#/home',width:390,design:'home',home:true,cold:true,slow:true},
      {name:'cold-discover-desktop',hash:'#/journey?tab=explore',width:1440,design:'home',home:false,cold:true,slow:true},
      {name:'direct-outside',hash:'#/journey?tab=outside',width:375,design:'',home:false,cold:true},
      {name:'direct-government',hash:'#/section?section=0',width:1440,design:'government',home:false,cold:true},
      {name:'direct-saved',hash:'#/saved',width:390,design:'',home:true,cold:true},
      {name:'warm-discover-mobile',hash:'#/journey?tab=explore',width:390,design:'home',home:false},
      {name:'controlled-reload',hash:'#/journey?tab=explore',width:390,design:'home',home:false,reload:true},
      {name:'standalone-reload',hash:'#/home',width:390,design:'home',home:true,standalone:true},
      {name:'offline-discover',hash:'#/journey?tab=explore',width:390,design:'home',home:false,offline:true},
    ];
    for(const s of scenarios){
      phase=s.name;film=0;
      await send('Emulation.setDeviceMetricsOverride',{width:s.width,height:900,deviceScaleFactor:1,mobile:s.width<768});
      await send('Emulation.setTouchEmulationEnabled',{enabled:s.width<768});
      if(s.cold){await send('Storage.clearDataForOrigin',{origin:new URL(url).origin,storageTypes:'all'});await send('Network.clearBrowserCache');}
      await send('Network.setCacheDisabled',{cacheDisabled:!!s.cold});
      await send('Network.emulateNetworkConditions',{offline:!!s.offline,latency:s.slow?100:0,downloadThroughput:s.slow?200000:-1,uploadThroughput:-1});
      await send('Fetch.enable',{patterns:[{urlPattern:'*/app-v3.js',requestStage:'Request'}]});
      if(s.standalone)await send('Page.addScriptToEvaluateOnNewDocument',{source:'Object.defineProperty(navigator,"standalone",{value:true});'});
      await send('Page.startScreencast',{format:'jpeg',quality:75,maxWidth:1440,maxHeight:900,everyNthFrame:1});
      // An intermediate document makes sure a changed hash is a new navigation.
      if(!s.reload)await send('Page.navigate',{url:'about:blank'});
      if(s.reload){await js('window.__reloadMarker=true');await send('Page.reload');await until('!window.__reloadMarker');}
      else await send('Page.navigate',{url:url+s.hash});
      await until('document.readyState==="complete"&&!!document.querySelector("#welcome")&&typeof Ahlan!=="undefined"');
      if(s.hash.includes('explore'))await until('document.querySelector("#explorePrototype")?.dataset.discoverMounted==="true"');
      await pause(300);
      await send('Page.stopScreencast');
      const frames=await js('window.__startupFrames');
      const painted=frames.filter(f=>f.styled);
      const wrong=painted.filter(f=>f.design!==s.design||f.home!==s.home||f.raw);
      const result={...s,frames,painted:painted.length,wrong:wrong.length,firstWrong:wrong[0],first:painted[0],final:painted.at(-1),paint:await js('performance.getEntriesByType("paint").map(x=>({name:x.name,t:x.startTime}))')};
      runs.push(result);console.log((baseline?'RECORDED ':'CHECK ')+s.name+': '+wrong.length+'/'+painted.length+' incorrect startup frames');
      if(!baseline){assert(painted.length>0);assert.equal(wrong.length,0,JSON.stringify({scenario:s.name,firstWrong:wrong[0]}));}
      await send('Fetch.disable');
      await until('navigator.serviceWorker.controller!==null||navigator.serviceWorker.ready.then(()=>true)');
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({status:baseline?'Baseline':'Passed',url,baseline,upgradeEvidence,runs,errors,browser:'Actual Chrome; mobile touch emulation and standalone iOS flag, not a physical installed app'},null,2));
    console.log('EVIDENCE '+out);
  }catch(error){fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({phase,error:error.stack,runs,errors},null,2));throw error;}
  finally{await Promise.allSettled([...delayed]);if(ws?.readyState===1){await send('Browser.close').catch(()=>{});ws.close();}for(const p of pending.values())p.reject(Error('Finished'));if(chrome?.exitCode===null)chrome.kill();if(server)await new Promise(r=>server.close(r));}
}
if(require.main===module)run(process.argv.slice(2)).catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={run};
