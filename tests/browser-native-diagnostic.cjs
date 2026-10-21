'use strict';
// Read-only diagnostic for the current deployment; isolated Chrome profile on D.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const out=path.join(__dirname,'browser-artifacts','native-diagnostic-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});const profile=path.join(out,'profile');fs.mkdirSync(profile);
const delay=ms=>new Promise(r=>setTimeout(r,ms));let chrome,ws,seq=0;
const pending=new Map(),exceptions=[],errors=[],responses=[],states=[];
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method));},60000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject});ws.send(JSON.stringify({id,method,params}));});
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
async function screen(name){const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}
async function state(label){const value=await evaluate(`(()=>{const f=document.querySelector('#discoverEgyptFrame'),r=e=>{if(!e)return null;const b=e.getBoundingClientRect(),s=getComputedStyle(e);return {top:b.top,bottom:b.bottom,width:b.width,height:b.height,display:s.display,visibility:s.visibility,opacity:s.opacity,background:s.backgroundColor,z:s.zIndex};};const d=f?.contentDocument,w=f?.contentWindow;return {url:location.href,view:typeof Ahlan==='undefined'?null:Ahlan.state.view,tab:typeof Ahlan==='undefined'?null:Ahlan.state.tab,ready:document.readyState,bodyHeight:document.body.scrollHeight,outerY:scrollY,header:r(document.querySelector('.site-header')),tabs:r(document.querySelector('.tabs')),root:r(document.querySelector('#explorePrototype')),frame:r(f),child:d?{ready:d.readyState,y:w.scrollY,height:d.body.scrollHeight,body:r(d.body),main:r(d.querySelector('main')),text:d.body.innerText.slice(0,1200),records:w.eval('typeof heritageRecords!=="undefined"?heritageRecords.length:null'),gate:[...d.querySelectorAll('[class*=gate],[id*=gate],canvas')].map(e=>({id:e.id,cls:e.className,rect:r(e)})).slice(0,20),images:[...d.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.getAttribute('src')?.slice(0,100)).slice(0,20)}:null};})()`);states.push({label,value});console.log(label+' '+JSON.stringify(value).slice(0,1300));return value;}
async function main(){
  if((await fetch('http://127.0.0.1:4173/')).status!==200)throw Error('Start localserver4173');
  let stderr='';chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new',...require('./chrome-test-options.cjs').cacheLimits,'--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--remote-debugging-address=127.0.0.1','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe'],windowsHide:true});chrome.stderr.on('data',d=>{stderr=(stderr+d).slice(-4000);});
  let port;for(let i=0;i<160;i++){try{port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0];if(/^\d+$/.test(port))break;}catch{}if(chrome.exitCode!==null)throw Error('Chromeexit '+stderr);await delay(100);}if(!port)throw Error(stderr);
  const page=(await(await fetch('http://127.0.0.1:'+port+'/json/list')).json()).find(p=>p.type==='page');ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((res,rej)=>{ws.addEventListener('open',res,{once:true});ws.addEventListener('error',rej,{once:true});});
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error.message)):p.resolve(m.result);return;}if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')errors.push(m.params.args.map(x=>String(x.value??x.description??x.type).slice(0,300)));if(m.method==='Network.responseReceived'&&m.params.response.status>=400)responses.push({url:m.params.response.url.slice(0,200),status:m.params.response.status});});
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
  for(const width of [1366,375]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<1000});
    await send('Page.navigate',{url:'http://127.0.0.1:4173/#/journey?tab=explore'});
    for(const ms of [1000,2000,5000]){await delay(ms);const snap=await state(width+'-initial-'+ms);if(snap.frame&&snap.child&&!snap.child.main)await screen(width+'-blank-loading-'+ms);}
    await screen(width+'-initial');
    await evaluate('document.querySelector("#discoverEgyptFrame")?.contentWindow.scrollTo(0,700)');await delay(700);await state(width+'-scrolled');await screen(width+'-scrolled');
    await evaluate('homeScreen()');await delay(500);await state(width+'-home');
    await evaluate('navigate({view:"journey",tab:"outside",query:""})');await delay(500);await state(width+'-outside');
    await evaluate('navigate({view:"journey",tab:"explore",query:""})');await delay(1500);await state(width+'-return');await screen(width+'-return');
  }
}
main().catch(e=>{console.error(e.stack);errors.push(e.stack);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'diagnostic.json'),JSON.stringify({states,exceptions,errors,responses},null,2));console.log('Artifacts '+out);if(ws?.readyState===1){ws.send(JSON.stringify({id:++seq,method:'Browser.close'}));await Promise.race([new Promise(r=>ws.addEventListener('close',r,{once:true})),delay(1500)]);ws.close();}if(chrome?.exitCode===null)chrome.kill();});
