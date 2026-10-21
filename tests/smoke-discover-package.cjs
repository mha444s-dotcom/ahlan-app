'use strict';
// Real Chrome headless QA, no dependencies, no user's browser profile. All
// screenshots/profile/output remain on D; never publishes or changes app data.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const chromeExe=process.env.AHLAN_TEST_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const out=path.join(__dirname,'browser-artifacts','discover-smoke-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const profile=path.join(out,'profile');fs.mkdirSync(profile);
let chrome,ws,serial=0;const waiting=new Map(),exceptions=[],consoleErrors=[],httpErrors=[],failed=[],requests=new Map(),checks=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const send=(method,params={})=>new Promise((resolve,reject)=>{
  const id=++serial,timer=setTimeout(()=>{waiting.delete(id);reject(Error('CDP timeout: '+method));},20000);
  waiting.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));
});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+(r.exceptionDetails.exception?.description||''));return r.result.value;}
async function until(expression){const end=Date.now()+60000;while(Date.now()<end){if(await evaluate(expression))return;await delay(100);}throw Error('Condition timed out: '+expression);}
async function check(name,fn){await fn();checks.push({name,passed:true});console.log('PASS '+name);}
async function main(){
  assert.ok(fs.existsSync(chromeExe),'Chrome is not installed at the configured path');
  const ping=await fetch('http://127.0.0.1:4173/');assert.equal(ping.status,200,'Start node serve-local.cjs first');
  let stderr='';
  chrome=spawn(chromeExe,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});
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

  await until('!!document.querySelector("#discoverEgyptFrame")?.contentDocument?.querySelector("#heritage-tomb-stage")');
  await evaluate('Promise.race([document.querySelector("#discoverEgyptFrame").contentDocument.fonts.ready,new Promise(r=>setTimeout(r,7000))]).then(()=>true)');
  const state=()=>evaluate(`(()=>{const f=document.querySelector('#discoverEgyptFrame'),w=f.contentWindow,d=f.contentDocument;return {frame:{width:f.clientWidth,height:f.clientHeight,top:f.getBoundingClientRect().top},parentOverflow:document.documentElement.scrollWidth>innerWidth,childOverflow:d.documentElement.scrollWidth>w.innerWidth,records:w.eval('heritageRecords.length'),categories:d.querySelectorAll('[data-heritage-entry]').length,eras:d.querySelectorAll('[data-era]').length,headers:d.querySelectorAll('.site-header').length,navs:d.querySelectorAll('.bottom-nav').length,stage:d.querySelector('#heritage-tomb-stage').className,preview:d.querySelectorAll('.heritage-preview-card').length,details:!!w.openEntry};})()`);
  console.log(JSON.stringify(await state()));
  const shot=async name=>{const s=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(s.data,'base64'));};
  await shot('hero');
  await evaluate('document.querySelector("#discoverEgyptFrame").contentDocument.querySelectorAll("[data-heritage-entry]")[1].click()');
  await delay(1500);console.log('ANIMATION '+JSON.stringify(await state()));
  await delay(1900);console.log('OPEN '+JSON.stringify(await state()));await shot('gate');
  await evaluate('document.querySelector("#discoverEgyptFrame").contentDocument.querySelector("#heritage-open-all").click()');
  await delay(500);await shot('gallery');
  const galleryCount=await evaluate('(()=>{const w=document.querySelector("#discoverEgyptFrame").contentWindow;w.heritageShow("\u0627\u0644\u0643\u0644");return w.document.querySelectorAll("#ancient-grid .heritage-piece").length;})()');
  assert.equal(galleryCount,170);console.log('GALLERY '+galleryCount);
  const report={state:await state(),exceptions,consoleErrors,httpErrors,networkFailures:failed};
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log('Smoke evidence: '+out);console.log(JSON.stringify({exceptions,consoleErrors,httpErrors: httpErrors.slice(0,10),failures:failed.slice(0,10)}));
}
main().catch(e=>{fs.writeFileSync(path.join(out,'failure.json'),JSON.stringify({error:e.stack,checks,exceptions,consoleErrors,httpErrors,networkFailures:failed},null,2));console.error(e.stack);process.exitCode=1;}).finally(async()=>{
  if(ws?.readyState===1){ws.send(JSON.stringify({id:++serial,method:'Browser.close'}));await Promise.race([new Promise(r=>ws.addEventListener('close',r,{once:true})),delay(1500)]);ws.close();}
  // Only the isolated child process created here, never another browser.
  if(chrome&&chrome.exitCode===null)chrome.kill();
});
