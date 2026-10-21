'use strict';
const {request,credential,OWNER,REPO}=require('../github/Credentials.cjs');
const PRODUCTION_URL='https://ahlan-app.pages.dev/';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function projectChecks(checks,sha){
  return checks.filter(check=>check.head_sha===sha&&check.app?.slug==='cloudflare-workers-and-pages'&&
    (/(?:^|[\s/:(])ahlan-app(?:$|[\s/):])/.test(check.name||'')||isProjectDetails(check.details_url)))
    .sort((a,b)=>b.id-a.id);
}
function isProjectDetails(value){
  try{const url=new URL(value);return url.origin==='https://dash.cloudflare.com'&&url.pathname.split('/').includes('ahlan-app');}catch{return false;}
}
async function liveCommit(sha){
  const home=await fetch(PRODUCTION_URL,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!home.ok)return false;
  const response=await fetch(new URL('deployment.json?commit='+sha,PRODUCTION_URL),{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)return false;
  if(!/application\/json/i.test(response.headers.get('content-type')||''))return false;
  const body=await response.json();
  return body.commit===sha&&/^[a-f0-9]{16}$/.test(body.pwaRevision||'');
}
async function waitCloudflare(sha,{timeoutMs=20*60*1000,intervalMs=10000}={}){
  if(!/^[a-f0-9]{40}$/.test(sha))throw Error('A complete tested commit SHA is required.');
  const token=credential(),start=Date.now();let announced=false;
  while(Date.now()-start<timeoutMs){
    const result=await request(`/repos/${OWNER}/${REPO}/commits/${sha}/check-runs?per_page=100`,{token});
    const check=projectChecks(result.check_runs||[],sha)[0];
    if(check&&!announced){console.log('Cloudflare deployment: '+check.details_url);announced=true;}
    if(check?.status==='completed'){
      if(check.conclusion!=='success')throw Error('Cloudflare deployment failed: '+check.conclusion+' — '+check.details_url);
      try{if(await liveCommit(sha)){
        console.log('Published on Cloudflare: '+PRODUCTION_URL);
        return {run:check.details_url,url:PRODUCTION_URL,sha};
      }}catch(error){if(error.name==='SyntaxError')throw Error('Cloudflare returned invalid deployment metadata.');}
    }
    await pause(intervalMs);
  }
  throw Error('Cloudflare deployment confirmation timed out. The expected commit was not confirmed live; do not report success.');
}
if(require.main===module)waitCloudflare(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={waitCloudflare,projectChecks,isProjectDetails,liveCommit,PRODUCTION_URL};
