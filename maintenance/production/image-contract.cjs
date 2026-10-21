'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const records=[...require('./discover-image-manifest.json').records,...require('./icons-image-manifest.json').records];
function webpDimensions(bytes){
 if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'||bytes.readUInt32LE(4)!==bytes.length-8)throw Error('Invalid WebP container');
 let dimensions,lossless=false;
 for(let at=12;at+8<=bytes.length;){const type=bytes.toString('ascii',at,at+4),size=bytes.readUInt32LE(at+4),start=at+8;if(start+size>bytes.length)throw Error('Truncated WebP chunk');
 if(type==='VP8L'){if(size<5||bytes[start]!==0x2f)throw Error('Invalid lossless WebP');const bits=bytes.readUInt32LE(start+1);dimensions={width:(bits&16383)+1,height:((bits>>>14)&16383)+1};lossless=true;}
 at=start+size+(size&1);
 }
 if(!lossless||!dimensions)throw Error('Expected exact lossless WebP bitstream');return dimensions;
}
function verifyRecord(record,base=path.join(root,'dist')){const file=path.resolve(base,record.target);if(!file.startsWith(path.resolve(base)+path.sep))throw Error('Image escapes production directory');const bytes=fs.readFileSync(file);const hash=crypto.createHash('sha256').update(bytes).digest('hex');if(hash!==record.sha256||bytes.length!==record.bytes||record.pixelDifferences||record.alphaDifferences)throw Error('Unverified image '+record.target);const dims=webpDimensions(bytes);if(dims.width!==record.width||dims.height!==record.height)throw Error('Image dimensions changed');return {bytes:bytes.length,...dims};}
module.exports={records,webpDimensions,verifyRecord};
