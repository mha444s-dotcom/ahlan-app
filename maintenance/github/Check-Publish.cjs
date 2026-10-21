'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'../..');
const forbidden=/(^|\/)(?:\.git|\.openai|\.wrangler|node_modules|_backups|_migration-tests|browser-artifacts|storage-migration|prechange|profile|Cache|Code Cache|GPUCache|deployment-reports)(?:\/|$)|(?:^|\/)\.(?:env|dev\.vars)(?:\.|$)|\.(?:vscdb|sqlite|db|pem|pfx|p12|key|log|tap|exe|dll)$/i;
const patterns=[
  ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['openai-token',/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b/],
  ['aws-access-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['google-api-key',/\bAIza[A-Za-z0-9_-]{35}\b/],
  ['credential-url',/https?:\/\/[^\s/'"<>:]+:[^\s/'"<>@]+@/],
  ['literal-secret',/\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'][A-Za-z0-9_+\/-]{16,}["']/i],
  ['windows-user-sid',/\bS-1-5-21-\d+-\d+-\d+-\d+\b/]
];
function gitFiles(){const r=spawnSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:ROOT,encoding:'utf8',maxBuffer:16*1024*1024});if(r.status!==0)throw Error('Cannot enumerate repository input.');return [...new Set(r.stdout.split('\0').filter(Boolean))].sort();}
function checkFiles(files,root=ROOT){
  const findings=[],rows=[];
  for(const name of files){
    if(name.includes('..')||name.includes('\\')||path.isAbsolute(name)||forbidden.test(name)){findings.push({file:name,rule:'forbidden-path'});continue;}
    const absolute=path.resolve(root,name);if(!absolute.startsWith(root+path.sep)){findings.push({file:name,rule:'outside-root'});continue;}
    let stat;try{stat=fs.lstatSync(absolute);}catch{findings.push({file:name,rule:'missing-file'});continue;}
    if(!stat.isFile()||stat.isSymbolicLink()){findings.push({file:name,rule:'non-regular-file'});continue;}
    let linked=false;for(let parent=path.dirname(absolute);parent!==root&&parent!==path.dirname(parent);parent=path.dirname(parent)){if(fs.lstatSync(parent).isSymbolicLink()){linked=true;break;}}
    if(linked){findings.push({file:name,rule:'linked-ancestor'});continue;}
    const content=fs.readFileSync(absolute);
    rows.push({file:name,bytes:stat.size,sha256:crypto.createHash('sha256').update(content).digest('hex')});
    if(stat.size>=50*1024*1024)findings.push({file:name,rule:'github-50MiB-threshold'});
    const textFile=/\.(?:[cm]?js|json|css|html|md|ya?ml|txt|ps1|psm1|webmanifest)$/i.test(name)||/\/(?:AGENTS|README)\.md$/i.test(name)||/^\.[a-z]+$/i.test(name);
    if(textFile||name==='maintenance/sources/discover-approved.html.gz'){
      let bytes=content;
      if(name.endsWith('.gz'))bytes=zlib.gunzipSync(bytes,{maxOutputLength:70*1024*1024});
      const text=bytes.toString('utf8');for(const [rule,pattern]of patterns)if(pattern.test(text))findings.push({file:name,rule});
    }
  }
  const fingerprint=crypto.createHash('sha256').update(rows.slice().sort((a,b)=>a.file.localeCompare(b.file,'en')).map(r=>r.file+'\0'+r.sha256).join('\n')).digest('hex');
  return {files:rows.length,bytes:rows.reduce((n,r)=>n+r.bytes,0),fingerprint,largest:rows.sort((a,b)=>b.bytes-a.bytes).slice(0,5),findings};
}
function main(){const report=checkFiles(gitFiles());console.log(JSON.stringify(report,null,2));if(report.findings.length)process.exitCode=1;}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={gitFiles,checkFiles,forbidden,patterns};
