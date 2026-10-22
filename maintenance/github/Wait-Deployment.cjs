'use strict';
// Optional verifier for the preserved GitHub Pages backup. The ship command
// waits for Cloudflare via maintenance/cloudflare/Wait-Cloudflare.cjs.
const {request,credential,OWNER,REPO}=require('./Credentials.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitDeployment(sha,{timeoutMs=15*60*1000,intervalMs=10000}={}){
  if(!/^[a-f0-9]{40}$/.test(sha))throw Error('A complete tested commit SHA is required.');
  const token=credential(),start=Date.now();let announced=false;
  while(Date.now()-start<timeoutMs){
    const result=await request(`/repos/${OWNER}/${REPO}/actions/workflows/pages.yml/runs?head_sha=${sha}&per_page=10`,{token});
    const runs=result.workflow_runs.filter(run=>run.head_sha===sha&&run.event==='push');
    const run=runs.sort((a,b)=>b.id-a.id)[0];
    if(run&&!announced){console.log('Deployment: '+run.html_url);announced=true;}
    if(run?.status==='completed'){
      if(run.conclusion!=='success')throw Error('Deployment failed: '+run.conclusion+' — '+run.html_url);
      const site=await request(`/repos/${OWNER}/${REPO}/pages`,{token});
      const response=await fetch(site.html_url,{cache:'no-store',signal:AbortSignal.timeout(30000)});
      if(!response.ok)throw Error('Actions passed but the deployed site returned HTTP '+response.status);
      const stamp=await fetch(new URL('deployment.json?commit='+sha,site.html_url),{cache:'no-store',signal:AbortSignal.timeout(30000)});
      if(!stamp.ok||(await stamp.json()).commit!==sha)throw Error('Live site does not yet match the requested source commit. Retry deployment verification.');
      console.log('Published: '+site.html_url);return {run:run.html_url,url:site.html_url,sha};
    }
    await pause(intervalMs);
  }
  throw Error('Deployment confirmation timed out. Do not treat the release as published. Check the Actions run.');
}
if(require.main===module)waitDeployment(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={waitDeployment};
