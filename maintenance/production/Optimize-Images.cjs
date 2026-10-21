#!/usr/bin/env node
'use strict';
// Development-only, reproducible lossless transcoding. Never removes sources.
// Google cwebp/dwebp 1.6.0: https://developers.google.com/speed/webp/docs/precompiled
const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
const project=path.resolve(__dirname,'../..');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const run=(file,args)=>new Promise((resolve,reject)=>execFile(file,args,{windowsHide:true,maxBuffer:2*1024*1024},(error,stdout,stderr)=>error?reject(Object.assign(error,{stdout,stderr})):resolve({stdout,stderr})));
const options=['-quiet','-lossless','-exact','-q','75','-m','4','-mt','-metadata','all'];

function decodePNG(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length<33||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('Invalid PNG signature');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),depth=bytes[24],type=bytes[25],interlace=bytes[28];
  if(!width||!height||width*height>40_000_000||depth!==8||![2,6].includes(type)||interlace!==0)throw Error(`Unsupported PNG ${width}x${height}, ${depth}/${type}/${interlace}`);
  const channels=type===6?4:3,stride=width*channels,compressed=[];
  for(let p=8;p<bytes.length;){const n=bytes.readUInt32BE(p);if(p+12+n>bytes.length)throw Error('Truncated PNG chunk');const t=bytes.toString('ascii',p+4,p+8);if(t==='IDAT')compressed.push(bytes.subarray(p+8,p+8+n));p+=n+12;}
  const raw=zlib.inflateSync(Buffer.concat(compressed),{maxOutputLength:(stride+1)*height}),decoded=Buffer.alloc(stride*height),rgba=Buffer.alloc(width*height*4);
  if(raw.length!==(stride+1)*height)throw Error('Unexpected decoded PNG length');
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)],row=y*stride;if(filter>4)throw Error('Unknown PNG filter');
    for(let x=0;x<stride;x++){
      const a=x>=channels?decoded[row+x-channels]:0,b=y?decoded[row-stride+x]:0,c=y&&x>=channels?decoded[row-stride+x-channels]:0;
      const predictor=filter===0?0:filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):paeth(a,b,c);
      decoded[row+x]=(raw[y*(stride+1)+1+x]+predictor)&255;
    }
  }
  for(let i=0,j=0;i<decoded.length;i+=channels,j+=4){rgba[j]=decoded[i];rgba[j+1]=decoded[i+1];rgba[j+2]=decoded[i+2];rgba[j+3]=channels===4?decoded[i+3]:255;}
  return {width,height,rgba};
}
function assertIdenticalPixels(source,decoded,name='image'){
  const a=decodePNG(source),b=decodePNG(decoded);
  if(a.width!==b.width||a.height!==b.height||!a.rgba.equals(b.rgba))throw Error('Lossless RGBA verification failed: '+name);
  return {width:a.width,height:a.height,decodedRGBA256:sha(a.rgba),pixelDifferences:0,alphaDifferences:0};
}
async function pngFiles(folder,list=[]){for(const entry of await fs.readdir(folder,{withFileTypes:true})){const target=path.join(folder,entry.name);if(entry.isDirectory())await pngFiles(target,list);else if(entry.name.endsWith('.png'))list.push(target);}return list;}
function inside(base,file){const relative=path.relative(base,file);return relative!==''&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
async function main(args=process.argv.slice(2)){
  const value=(name,fallback)=>{const at=args.indexOf(name);if(at<0)return fallback;if(!args[at+1]||args[at+1].startsWith('--'))throw Error('Missing '+name);return args[at+1];};
  const group=value('--group','discover');if(!['discover','icons'].includes(group))throw Error('Only audited discover/icons groups are supported');
  const sourceRoot=path.resolve(value('--source-root',path.join(project,'dist'))),outputRoot=path.join(project,'dist');
  const sourceFolder=path.join(sourceRoot,group==='discover'?'discover-egypt/assets':'assets/ahlan-ui-icons');
  const sources=(await pngFiles(sourceFolder)).sort(),expected=group==='discover'?60:344;
  if(sources.length!==expected)throw Error(`Audited ${group} group expected ${expected} PNG files, found ${sources.length}`);
  if(!args.includes('--write')){console.log(JSON.stringify({status:'Read-only plan',group,sourceRoot,outputRoot,files:sources.length,sourcesRetained:true,protectedNeedsUnchanged:true}));return;}
  const toolBase=path.resolve(value('--tools',path.join(project,'maintenance/tools/libwebp-1.6.0/libwebp-1.6.0-windows-x64/bin')));
  if((await run(path.join(toolBase,'cwebp.exe'),['-version'])).stdout.split(/\r?\n/)[0]!=='1.6.0')throw Error('Expected official cwebp 1.6.0');
  const scratch=path.join(project,'design/size-experiments'),experiment=JSON.parse(await fs.readFile(path.join(scratch,'lossless-results.json'),'utf8').catch(()=>'{"results":[]}'));
  const staging=path.join(scratch,'production-stage',group);await fs.mkdir(staging,{recursive:true});
  const records=[];let next=0;
  async function worker(){for(;;){const source=sources[next++];if(!source)return;
    const relative=path.relative(sourceRoot,source).replaceAll('\\','/'),target=relative.replace(/\.png$/,'.webp');
    if(relative.startsWith('assets/categories/')||relative.startsWith('assets/pwa/'))throw Error('Protected image entered audited group');
    const bytes=await fs.readFile(source),sourceSHA256=sha(bytes),destination=path.join(staging,target),decoded=destination+'.decoded.png';
    await fs.mkdir(path.dirname(destination),{recursive:true});
    const cached=experiment.results.find(item=>item.source===relative&&item.sourceSHA256===sourceSHA256),cachedFile=cached&&path.resolve(scratch,cached.output);
    let encoderOptions=options;
    const cachedBytes=cached&&inside(scratch,cachedFile)?await fs.readFile(cachedFile).catch(error=>{if(error.code==='ENOENT')return null;throw error;}):null;
    if(cachedBytes&&sha(cachedBytes)===cached.sha256){await fs.copyFile(cachedFile,destination);encoderOptions=cached.encoderOptions.split(' ');}
    else await run(path.join(toolBase,'cwebp.exe'),[...options,source,'-o',destination]);
    await run(path.join(toolBase,'dwebp.exe'),[destination,'-o',decoded]);
    const verification=assertIdenticalPixels(bytes,await fs.readFile(decoded),relative),output=await fs.readFile(destination);await fs.unlink(decoded);
    if(output.length>=bytes.length)throw Error('Encoding does not reduce size: '+relative);
    records.push({source:relative,sourceBytes:bytes.length,sourceSHA256,target,bytes:output.length,sha256:sha(output),...verification,encoderOptions});
  }}
  await Promise.all([worker(),worker(),worker()]);records.sort((a,b)=>a.source.localeCompare(b.source));
  // Publish only after every file has independently passed decoded RGBA equality.
  for(const item of records){const destination=path.join(outputRoot,item.target);if(!inside(outputRoot,destination))throw Error('Invalid target');await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(path.join(staging,item.target),destination);if(sha(await fs.readFile(destination))!==item.sha256)throw Error('Published verification failed: '+item.target);}
  const provenance=JSON.parse(await fs.readFile(path.join(project,'maintenance/tools/libwebp-1.6.0/download-provenance.json'),'utf8'));
  const manifest={schema:1,group,sourceRoot:path.relative(project,sourceRoot).replaceAll('\\','/'),encoder:'Google libwebp 1.6.0',officialDocumentation:provenance.documentation,encoderArchiveSHA256:provenance.sha256,policy:'lossless-exact-no-resize',sourcesRetainedByConverter:true,protectedNeedsUnchanged:true,count:records.length,sourceBytes:records.reduce((sum,x)=>sum+x.sourceBytes,0),bytes:records.reduce((sum,x)=>sum+x.bytes,0),records};
  const manifestPath=path.join(__dirname,group+'-image-manifest.json');await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({status:'Verified lossless WebP copies prepared',manifest:manifestPath,count:manifest.count,sourceBytes:manifest.sourceBytes,bytes:manifest.bytes,savedBytes:manifest.sourceBytes-manifest.bytes}));return manifest;
}
module.exports={decodePNG,assertIdenticalPixels,main};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
