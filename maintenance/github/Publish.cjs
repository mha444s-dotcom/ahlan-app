'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path');
const {gitFiles,checkFiles}=require('./Check-Publish.cjs');
const {waitDeployment}=require('./Wait-Deployment.cjs');
const ROOT=path.resolve(__dirname,'../..');
function run(command,args,{capture=false}={}){
  const r=spawnSync(command,args,{cwd:ROOT,encoding:'utf8',stdio:capture?'pipe':'inherit',windowsHide:true,maxBuffer:32*1024*1024});
  if(r.error||r.status!==0)throw Error(`Stopped: ${command} ${args.join(' ')} failed${r.status!==null?' ('+r.status+')':''}.`);
  return capture?r.stdout.trim():'';
}
function assertTarget(){
  if(run('git',['branch','--show-current'],{capture:true})!=='main')throw Error('Publish is allowed from main only.');
  const urls=run('git',['remote','get-url','--all','origin'],{capture:true}).split(/\r?\n/);
  const pushUrls=run('git',['remote','get-url','--push','--all','origin'],{capture:true}).split(/\r?\n/);
  if([...urls,...pushUrls].some(url=>!['https://github.com/mha444s-dotcom/ahlan-app.git','git@github.com:mha444s-dotcom/ahlan-app.git'].includes(url)))throw Error('Origin is not the reviewed ahlan-app repository.');
  if(run('git',['diff','--name-only','--diff-filter=U'],{capture:true}))throw Error('Resolve merge conflicts before publishing.');
}
async function publish(args=process.argv.slice(2)){
  if(args.length!==2||args[0]!=='--message'||!args[1].trim())throw Error('Usage: npm run ship -- --message "Describe the completed change"');
  assertTarget();
  const report=checkFiles(gitFiles());
  if(report.findings.length){console.error(JSON.stringify(report.findings,null,2));throw Error('Source security check failed.');}
  // No shell interpolation: commit messages are passed as one literal argument.
  run(process.execPath,['--run','test:ci']);
  run(process.execPath,['maintenance/github/Prepare-Release.cjs']);
  run(process.execPath,['tests/browser-pages.cjs','--local','--root','release/ahlan','--base-path','/ahlan-app/']);
  // Detect edits made during validation, rather than committing an untested edit.
  const before=checkFiles(gitFiles());
  if(before.findings.length||before.fingerprint!==report.fingerprint)throw Error('Source changed during validation. Nothing was committed or pushed; rerun after finishing edits.');
  run('git',['add','--all']);
  const staged=run('git',['diff','--cached','--name-only'],{capture:true});
  if(staged)run('git',['commit','-m',args[1]]);
  const sha=run('git',['rev-parse','HEAD'],{capture:true});
  run(process.execPath,['maintenance/github/Stamp-Deployment.cjs']);
  run('git',['push','origin','HEAD:main']);
  await waitDeployment(sha);
}
if(require.main===module)publish().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={assertTarget,publish};
