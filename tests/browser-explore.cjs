'use strict';
// Real Chrome headless QA, no dependencies, no user's browser profile. All
// screenshots/profile/output remain on D; never publishes or changes app data.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const chromeExe=process.env.AHLAN_TEST_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const out=path.join(__dirname,'browser-artifacts','explore-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const profile=path.join(out,'profile');fs.mkdirSync(profile);
let chrome,ws,serial=0;const waiting=new Map(),exceptions=[],consoleErrors=[],httpErrors=[],failed=[],requests=new Map(),checks=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial,timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout: '+method));},20000);
  waiting.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));
});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+(r.exceptionDetails.exception?.description||''));return r.result.value;}
async function until(expression){const end=Date.now()+15000;while(Date.now()<end){if(await evaluate(expression))return;await delay(100);}throw Error('Condition timed out: '+expression);}
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS '+name);}
async function main(){
  assert.ok(fs.existsSync(chromeExe),'Chrome is not installed at the configured path');
  const ping=await fetch('http://127.0.0.1:4173/');assert.equal(ping.status,200,'Start node serve-local.cjs first');
  let stderr='';
  chrome=spawn(chromeExe,['--headless=new',...require('./chrome-test-options.cjs').cacheLimits,'--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
  chrome.on('error',e=>{stderr+=e.message;});chrome.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-4000);});
  const activePort=path.join(profile,'DevToolsActivePort');let end=Date.now()+12000,port;
  // Windows may briefly lock this file while Chrome writes its endpoint.
  // Retry only this isolated startup handshake; never bypass app resource errors.
  while(Date.now()<end){
    if(chrome.exitCode!==null)throw Error('Chrome exited: '+stderr);
    try { const candidate=fs.readFileSync(activePort,'utf8').split(/\r?\n/)[0];if(/^\d+$/.test(candidate)){port=candidate;break;} }
    catch(error){if(!['ENOENT','EBUSY'].includes(error.code))throw error;}
    await delay(100);
  }
  if(!port)throw Error('Chrome debug endpoint unavailable: '+stderr);
  const targets=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  const page=targets.find(t=>t.type==='page');assert.ok(page);
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=waiting.get(m.id);waiting.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);return;}
    if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')consoleErrors.push(m.params.args.map(a=>a.value??a.description??a.type).join(' '));
    if(m.method==='Network.requestWillBeSent')requests.set(m.params.requestId,m.params.request.url);
    if(m.method==='Network.responseReceived'&&m.params.response.status>=400)httpErrors.push({url:m.params.response.url,status:m.params.response.status});
    if(m.method==='Network.loadingFailed')failed.push({url:requests.get(m.params.requestId),reason:m.params.errorText});
  });
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/#/journey?tab=explore'});
  await until('!!document.querySelector("#explorePrototype .xp-mosaic")');
  await evaluate('Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,7000))]).then(()=>true)');
  await check('Real page loads the prototype without JavaScript exceptions',async()=>assert.deepEqual(exceptions,[]));
  await check('Favorites update every matching heart and preserve the rail DOM',async()=>{
    const r=await evaluate(`(()=>{const rail=document.querySelector('#xpPlaceRail');document.querySelector('[data-xp-save="105"]').click();return {same:rail===document.querySelector('#xpPlaceRail'),saved:Ahlan.data.saved.includes(105),hearts:[...document.querySelectorAll('[data-xp-save="105"]')].every(b=>b.getAttribute('aria-pressed')==='true')};})()`);
    assert.deepEqual(r,{same:true,saved:true,hearts:true});
  });
  await check('Original details and plan action work in the real browser',async()=>{
    await evaluate('detail(105);document.querySelector(\'#modal [onclick="addPlan(105)"]\').click()');assert.equal(await evaluate('Ahlan.data.plan.includes(105) && !document.querySelector("#overlay").classList.contains("open")'),true);
  });
  await check('Search filters real places and reset restores the 14 service cards',async()=>{
    await evaluate(`(()=>{const input=document.querySelector('#search');input.value='فيلة';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await until('document.querySelectorAll("#xpPlaceRail [data-card]").length===1');
    assert.equal(await evaluate('document.querySelector("#xpPlaceRail [data-card]").dataset.card'),'105');
    await evaluate('resetExploreSelection()');assert.equal(await evaluate('document.querySelectorAll("#services .service").length'),14);
  });
  await check('Category, empty state and city rules are live',async()=>{
    await evaluate('setExploreFilter("على البحر")');assert.equal(await evaluate('document.querySelector("#xpPlaceRail [data-card]").dataset.card'),'103');
    await evaluate('resetExploreSelection();Ahlan.state.query="no-match-zzzz";render()');assert.equal(await evaluate('!!document.querySelector("#explorePrototype .xp-empty")'),true);
    await evaluate('resetExploreSelection();showCityPicker();document.querySelector("#citySelect").value="أسوان";changeCity();toggleExploreCity()');
    assert.equal(await evaluate('document.querySelector("#xpPlaceRail [data-card]").dataset.card'),'105');
    await evaluate('showCityPicker();document.querySelector("#citySelect").value="القاهرة";changeCity();resetExploreSelection()');
  });
  await check('English/LTR shell retains the original Arabic place cards',async()=>{
    await evaluate('changeJourneyLanguage("en")');assert.equal(await evaluate('document.querySelector("#explorePrototype").dir'), 'ltr');
    assert.equal(await evaluate('document.querySelector(".xp-place").dir'),'rtl');await evaluate('changeJourneyLanguage("ar")');
  });
  await check('Other journeys and landing page hide the prototype',async()=>{
    for(const tab of ['outside','inside']){await evaluate(`navigate({view:'journey',tab:'${tab}'})`);assert.equal(await evaluate('getComputedStyle(document.querySelector("#explorePrototype")).display'),'none');assert.equal(await evaluate('document.querySelectorAll("#journeyPage .journey-card").length>0'),true);}
    await evaluate('homeScreen()');assert.equal(await evaluate('getComputedStyle(document.querySelector("#explorePrototype")).display'),'none');assert.notEqual(await evaluate('getComputedStyle(document.querySelector("#home .home-discovery")).display'),'none');
    await evaluate('navigate({view:"journey",tab:"explore",query:"",filter:"الكل",cityOnly:false})');
  });
  await check('Gallery returns to the visible Explore rail',async()=>{await evaluate('openExperienceGallery();closeExperienceGallery()');assert.equal(await evaluate('isExplorePrototype() && !document.querySelector("#explorePrototype").hidden'),true);});
  await check('Horizontal RTL rail responds to a real keyboard arrow without decorative arrow buttons',async()=>{
    await evaluate('document.querySelector("#xpPlaceRail").scrollTo({left:0,behavior:"instant"});document.querySelector("#xpPlaceRail").focus({preventScroll:true})');
    assert.equal(await evaluate('document.activeElement.id'),'xpPlaceRail');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37,nativeVirtualKeyCode:37});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'ArrowLeft',code:'ArrowLeft',windowsVirtualKeyCode:37,nativeVirtualKeyCode:37});
    await until('Math.abs(document.querySelector("#xpPlaceRail").scrollLeft)>20');
    await evaluate('document.querySelector("#xpPlaceRail").scrollTo({left:0,behavior:"instant"});document.querySelector("#xpPlaceRail").blur()');
  });
  await check('Explore contains no decorative arrow glyphs or arrow images',async()=>{
    const arrows=await evaluate(`(()=>{const root=document.querySelector('#explorePrototype');return {glyphs:/[←→↔↗↘↙↖➜➝➞➟➠➔➙➛➢➤]/.test(root.textContent),images:[...root.querySelectorAll('img')].filter(i=>/(?:^|[\\/])arrow(?:\\.|-)/.test(i.src)).map(i=>i.src)};})()`);
    assert.deepEqual(arrows,{glyphs:false,images:[]});
  });
  await check('Distinct dark, beige, violet and mint surfaces are actually rendered',async()=>{
    const colors=await evaluate(`(()=>{const color=selector=>{const e=document.querySelector(selector);return e&&getComputedStyle(e).backgroundColor};return {dark:color('#explorePrototype'),beige:color('.xp-panel--sand'),violet:color('.xp-category-card--violet'),mint:color('.xp-category-card--mint')};})()`);
    const rgb=value=>{assert.equal(typeof value,'string','Expected a rendered surface');return value.match(/[\d.]+/g).slice(0,3).map(Number);};
    assert.ok(rgb(colors.dark).every(channel=>channel<65),'The principal collection should be dark, rather than the previous white surface');
    const beige=rgb(colors.beige);assert.ok(beige[0]>150&&beige[0]>beige[1]&&beige[1]>beige[2],'Editorial panel should have a distinct warm beige surface');
    const violet=rgb(colors.violet),mint=rgb(colors.mint);
    assert.ok(violet[2]>violet[1]&&violet[0]>130,'Violet category surface');
    assert.ok(mint[1]>mint[0]&&mint[1]>130,'Mint category surface');
    assert.equal(new Set(Object.values(colors)).size,4,'Collection surfaces must be visually distinct');
  });
  const sizes=[];
  for(const width of [320,375,390,768,1440]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<1000});
    await evaluate('window.scrollTo(0,0);document.querySelectorAll("#explorePrototype img,.needs-panel img").forEach(i=>i.loading="eager")');
    await until('[...document.querySelectorAll("#explorePrototype img,.needs-panel img")].every(i=>i.complete)');
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const metrics=await evaluate(`(()=>{const rect=s=>{const r=document.querySelector(s)?.getBoundingClientRect();return r?{width:r.width,height:r.height}:null};return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,hero:rect('.xp-hero'),tiles:[...document.querySelectorAll('.xp-tile')].map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),place:rect('.xp-place'),photo:rect('.xp-place-photo'),editorial:rect('.xp-editorial'),brokenImages:[...document.querySelectorAll('#explorePrototype img,.needs-panel img')].filter(i=>i.checkVisibility()&&!i.naturalWidth).map(i=>i.currentSrc||i.src)};})()`);
    assert.ok(metrics.scrollWidth<=width+1,'Horizontal page overflow at '+width+': '+metrics.scrollWidth);
    assert.deepEqual(metrics.brokenImages,[],'Missing visible image at '+width+'px');
    const screenshot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width,height:metrics.height,scale:1}});
    fs.writeFileSync(path.join(out,'explore-'+width+'.png'),Buffer.from(screenshot.data,'base64'));
    const fold=await send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width,height:900,scale:1}});
    fs.writeFileSync(path.join(out,'explore-'+width+'-fold.png'),Buffer.from(fold.data,'base64'));
    // A direct composition view at the same viewport width as the references,
    // in addition to the unmodified full page and first-screen evidence.
    const composition=await evaluate(`(()=>{const tile=document.querySelector('.xp-mosaic'),places=document.querySelector('#xpPlaces');const y=Math.max(0,tile.getBoundingClientRect().top+scrollY-90);return {y,height:Math.min(1200,places.getBoundingClientRect().bottom+scrollY-y)};})()`);
    await evaluate(`window.scrollTo({top:${composition.y},behavior:'instant'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);
    const detailShot=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(out,'explore-'+width+'-composition.png'),Buffer.from(detailShot.data,'base64'));
    await evaluate('window.scrollTo({top:0,behavior:"instant"})');
    sizes.push(metrics);console.log('SCREENSHOT '+width+'px; height '+metrics.height+'; broken '+metrics.brokenImages.length);
  }
  assert.deepEqual(exceptions,[],'Browser JavaScript exceptions');
  assert.deepEqual(consoleErrors,[],'Browser console errors');
  assert.deepEqual(httpErrors.filter(e=>e.url.startsWith('http://127.0.0.1:4173/')),[],'Local resources with failing HTTP status');
  assert.deepEqual(failed.filter(e=>e.url?.startsWith('http://127.0.0.1:4173/')&&e.reason!=='net::ERR_ABORTED'),[],'Local resource loading failures');
  const report={browser:'Chrome headless with isolated D profile',checks,sizes,exceptions,consoleErrors,httpErrors,networkFailures:failed,sourceDataChanged:false};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
  console.log('Browser evidence: '+out);
}
main().catch(e=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.stack,checks,exceptions,consoleErrors,httpErrors,networkFailures:failed},null,2));console.error(e.stack);process.exitCode=1;}).finally(async()=>{
  if(ws?.readyState===1){ws.send(JSON.stringify({id:++serial,method:'Browser.close'}));await Promise.race([new Promise(r=>ws.addEventListener('close',r,{once:true})),delay(1500)]);ws.close();}
  // Only the isolated child process created here, never another browser.
  if(chrome&&chrome.exitCode===null)chrome.kill();
});
