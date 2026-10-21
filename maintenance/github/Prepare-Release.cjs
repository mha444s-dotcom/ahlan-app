'use strict';
// Never removes an earlier build: validated candidates are promoted atomically.
const fs=require('node:fs'),path=require('node:path');
const {buildRelease}=require('../production/Build-Release.cjs');
const root=path.resolve(__dirname,'../..');
async function prepare(){
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const target=path.join(root,'release/ahlan');
  const candidate=path.join(root,'release/candidate-'+stamp);
  const built=await buildRelease({outputRoot:candidate});
  let previous=null;
  if(fs.existsSync(target)){
    if(fs.lstatSync(target).isSymbolicLink())throw Error('Release must not be a symbolic link.');
    previous=path.join(root,'release/previous-'+stamp);fs.renameSync(target,previous);
  }
  try{fs.renameSync(candidate,target);}catch(error){if(previous)fs.renameSync(previous,target);throw error;}
  console.log(JSON.stringify({output:'release/ahlan',previous:previous&&path.relative(root,previous),files:built.manifest.files,bytes:built.manifest.bytes}));
}
if(require.main===module)prepare().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={prepare};
