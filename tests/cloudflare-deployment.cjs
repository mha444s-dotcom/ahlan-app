'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),sha='a'.repeat(40),other='b'.repeat(40);
const source=fs.readFileSync(path.join(root,'maintenance/cloudflare/Wait-Cloudflare.cjs'),'utf8');
function load({checks=[],stamp=sha,conclusion='success'}={}){
 const module={exports:{}},messages=[],calls=[];let tick=0,credentials=0;
 const check={id:1,head_sha:sha,name:'Cloudflare Pages: ahlan-app',details_url:'https://dash.cloudflare.com/account/pages/view/ahlan-app/deployment',app:{slug:'cloudflare-workers-and-pages'},status:'completed',conclusion};
 const context={module,require:id=>{assert.equal(id,'../github/Credentials.cjs');return {OWNER:'mha444s-dotcom',REPO:'ahlan-app',credential:()=>{credentials++;return 'private-in-memory';},request:async route=>{calls.push(route);return {check_runs:checks.length?checks:[check]};}};},process:{argv:[]},URL,AbortSignal,Date:{now:()=>tick},setTimeout:callback=>{tick+=10000;callback();},console:{log:x=>messages.push(x)},fetch:async url=>{calls.push(String(url));return {ok:true,headers:{get:()=>String(url).includes('deployment.json')?'application/json':'text/html'},json:async()=>({commit:stamp,pwaRevision:'1'.repeat(16)})};}};
 context.require.main=null;vm.runInNewContext(source,context,{filename:'Wait-Cloudflare.cjs'});return {api:module.exports,messages,calls,get credentials(){return credentials;},check};
}
test('Cloudflare checks belong to the exact commit, official GitHub app and Ahlan project',()=>{
 const run=load();const good=run.check;
 assert.equal(run.api.projectChecks([good],sha).length,1);
 for(const change of [{head_sha:other},{app:{slug:'unrelated-app'}},{name:'Another project',details_url:'https://dash.cloudflare.com/account/pages/view/another/deploy'},{name:'ahlan-app-other',details_url:'https://attacker.test/ahlan-app'}])assert.equal(run.api.projectChecks([{...good,...change}],sha).length,0);
 assert.equal(run.api.isProjectDetails('https://dash.cloudflare.com.evil.test/pages/view/ahlan-app/123'),false);
});
test('Invalid commit stops before credentials or network; a successful exact deployment is verified live',async()=>{
 const bad=load();await assert.rejects(bad.api.waitCloudflare('short'));assert.equal(bad.credentials,0);assert.equal(bad.calls.length,0);
 const run=load(),result=await run.api.waitCloudflare(sha);assert.equal(result.url,'https://ahlan-app.pages.dev/');assert.equal(result.sha,sha);
 assert.ok(run.calls.some(x=>x.includes('/commits/'+sha+'/check-runs')));assert.ok(run.calls.includes('https://ahlan-app.pages.dev/'));assert.ok(run.calls.some(x=>x.includes('deployment.json?commit='+sha)));
 assert.ok(run.messages.some(x=>x.startsWith('Published on Cloudflare:')));
});
test('Failed or canceled Cloudflare checks cannot announce success',async()=>{
 for(const conclusion of ['failure','cancelled','timed_out','skipped']){const run=load({conclusion});await assert.rejects(run.api.waitCloudflare(sha),/deployment failed/);assert.ok(!run.messages.some(x=>x.startsWith('Published')));assert.ok(!run.calls.some(x=>x.includes('pages.dev')));}
});
test('An older live commit cannot satisfy a successful check and times out honestly',async()=>{
 const run=load({stamp:other});await assert.rejects(run.api.waitCloudflare(sha,{timeoutMs:15000}),/timed out/);assert.ok(!run.messages.some(x=>x.startsWith('Published')));
});
test('Cloudflare build stamps CF_PAGES_COMMIT_SHA without changing runtime content',()=>{
 function stamp(env){let written,git=0;const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'maintenance/github/Stamp-Deployment.cjs'),'utf8'),{require:id=>id==='node:fs'?{readFileSync:()=>"const VERSION='0123456789abcdef';",writeFileSync:(file,body)=>{written={file,body:JSON.parse(body)};}}:id==='node:path'?path:{spawnSync:()=>{git++;return {stdout:sha};}},__dirname:path.join(root,'maintenance/github'),process:{env},console:{log:()=>{}},module});return {written,git};}
 const cf=stamp({CF_PAGES_COMMIT_SHA:other,GITHUB_SHA:sha});assert.equal(cf.written.body.commit,other);assert.equal(cf.git,0);assert.equal(path.basename(cf.written.file),'deployment.json');
 assert.equal(stamp({GITHUB_SHA:sha}).written.body.commit,sha);assert.equal(stamp({}).git,1);assert.throws(()=>stamp({CF_PAGES_COMMIT_SHA:'invalid'}),/unknown source commit/);
});
test('Cloudflare build checks source and tests before packaging; no token or direct upload is required',()=>{
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(pkg.scripts['build:cloudflare'],'node maintenance/github/Check-Publish.cjs && npm run test:ci && npm run build && node maintenance/github/Stamp-Deployment.cjs');
 const scanner=require('../maintenance/github/Check-Publish.cjs');for(const p of ['.wrangler/config/default.enc','.dev.vars','.dev.vars.production'])assert.ok(scanner.forbidden.test(p),p);
});
