'use strict';
const {spawnSync}=require('node:child_process');
const OWNER='mha444s-dotcom', REPO='ahlan-app';
function credential(){
  const result=spawnSync('git',['credential','fill'],{input:`protocol=https\nhost=github.com\nusername=${OWNER}\n\n`,encoding:'utf8',windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never'}});
  if(result.status!==0)throw new Error('GitHub sign-in unavailable. Sign into GitHub through VS Code / Git Credential Manager, then retry.');
  const fields=Object.fromEntries(result.stdout.trim().split(/\r?\n/).map(line=>{const n=line.indexOf('=');return [line.slice(0,n),line.slice(n+1)];}));
  if(!fields.password)throw new Error('GitHub credential is missing.');
  return fields.password;
}
async function request(route,{method='GET',body,token}={}){
  // This reusable updater can operate only on this app. No account-wide mutations.
  if(typeof route!=='string'||route.includes('\\')||/(?:^|\/)\.{1,2}(?:\/|$)|%2[eEfF]|%5[cC]/.test(route.split('?')[0]))throw new Error('Unsafe GitHub API path.');
  const url=new URL(route,'https://api.github.com');
  if(url.origin!=='https://api.github.com'||url.pathname!==route.split('?')[0]||!url.pathname.startsWith(`/repos/${OWNER}/${REPO}/`)&&url.pathname!==`/repos/${OWNER}/${REPO}`)throw new Error('GitHub operation outside ahlan-app is prohibited.');
  token=token||credential();
  const response=await fetch('https://api.github.com'+route,{method,headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'Ahlan-Release',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`GitHub API ${method} failed (${response.status}). No credential was logged.`);
  return response.status===204?null:response.json();
}
module.exports={OWNER,REPO,credential,request};
