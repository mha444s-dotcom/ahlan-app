'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const {approvedSourcePath, readDiscoverSource} = require('../maintenance/discover-source.cjs');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function fixture(t) {
  const base=path.join(__dirname,'browser-artifacts');
  fs.mkdirSync(base,{recursive:true});
  const dir=fs.mkdtempSync(path.join(base,'source-archive-test-'));
  t.after(()=>{
    assert.equal(path.dirname(dir),base);
    assert(path.basename(dir).startsWith('source-archive-test-'));
    fs.rmSync(dir,{recursive:true,force:true});
  });
  const file=path.join(dir,'approved.html.gz');
  const original=Buffer.from('<!doctype html><title>أهلًا — مصر</title>\n');
  const archive=zlib.gzipSync(original,{level:9});
  const metadata={format:'gzip',sourceBytes:original.length,sourceSHA256:sha(original),
    archiveBytes:archive.length,archiveSHA256:sha(archive)};
  fs.writeFileSync(file,archive);
  const saveMetadata=()=>fs.writeFileSync(file+'.json',JSON.stringify(metadata));
  saveMetadata();
  return {file,original,archive,metadata,saveMetadata};
}

test('the compact approved source restores every original byte below GitHub warning size',()=>{
  const restored=readDiscoverSource();
  assert.equal(sha(restored.source),'71e72dfe0d2abd1ecc04847a65c5a66c47c9a28dd83d45bdad73a02cafeaae70');
  assert.equal(Buffer.byteLength(restored.source),66985843);
  assert.equal(restored.sourcePath,approvedSourcePath);
  assert.equal(restored.archive.bytes,49721329);
  assert(restored.archive.bytes<50*1024*1024);
  assert.equal(restored.archive.sourceBytes,Buffer.byteLength(restored.source));
});

test('verified gzip input and explicit raw source both preserve Unicode bytes',t=>{
  const f=fixture(t);
  assert.equal(readDiscoverSource(f.file).source,f.original.toString('utf8'));
  const raw=f.file.slice(0,-3);
  fs.writeFileSync(raw,f.original);
  assert.deepEqual(readDiscoverSource(raw),{source:f.original.toString('utf8'),sourcePath:raw,archive:null});
});

test('corrupt archive and mismatched original hash stop rather than falling back silently',t=>{
  const f=fixture(t);
  const corrupt=Buffer.from(f.archive);corrupt[20]^=1;
  fs.writeFileSync(f.file,corrupt);
  assert.throws(()=>readDiscoverSource(f.file),/archive integrity/);
  fs.writeFileSync(f.file,f.archive);
  f.metadata.sourceSHA256='0'.repeat(64);f.saveMetadata();
  assert.throws(()=>readDiscoverSource(f.file),/content integrity/);
});

test('missing, invalid and unbounded archive metadata are rejected',t=>{
  const f=fixture(t);
  f.metadata.sourceBytes=129*1024*1024;f.saveMetadata();
  assert.throws(()=>readDiscoverSource(f.file),/Invalid.*metadata/);
  fs.unlinkSync(f.file+'.json');
  assert.throws(()=>readDiscoverSource(f.file),{code:'ENOENT'});
});
