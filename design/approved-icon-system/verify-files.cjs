'use strict';
// Verify the maintained assets directly, without historical preview folders or browser caches.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const hashes=JSON.parse(fs.readFileSync(path.join(__dirname,'asset-hashes.json'),'utf8'));
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const [relative,expected] of Object.entries(hashes)){
 const file=path.resolve(root,relative);assert.ok(file.startsWith(root+path.sep),'Asset path must stay in the project');
 assert.equal(digest(file),expected,'Asset differs from the approved version: '+relative);
}
const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'catalog.json'),'utf8'));
let pngs=0,bytes=0;
for(const asset of catalog.assets){
 assert.ok(/^[a-z]+(?:-[a-z]+)*$/.test(asset.name),'Invalid asset name');
 assert.ok(fs.existsSync(path.join(__dirname,'source',asset.name+'.png')),'Missing editable source: '+asset.name);
 for(const size of [32,64,128,256]){
  const file=path.join(root,'dist/assets/ahlan-ui-icons',String(size),asset.name+'.png'),png=fs.readFileSync(file);
  assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
  assert.ok([4,6].includes(png[25]),'PNG must support transparency: '+file);pngs++;bytes+=png.length;
 }
}
const backup=path.join(root,'_backups/Ahlan-20261016-173730-61e8c96b/Ahlan-complete.zip');
assert.equal(digest(backup),'7b75801d6af2262573a2f242953b8b4902a00a5ec07b9cc21e3cf80ba3108420','Original backup must not change');
console.log(JSON.stringify({success:true,assetsVerified:Object.keys(hashes).length,icons:catalog.assets.length,pngs,totalIconBytes:bytes,approvedSourcesPreserved:true,originalBackupUnchanged:true},null,2));
