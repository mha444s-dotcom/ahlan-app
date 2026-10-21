'use strict';
// The approved, unmodified HTML is kept as a verified gzip source archive.
// It is developer input only and must never enter the deployed web root.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const approvedSourcePath = path.join(__dirname, 'sources/discover-approved.html.gz');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function readDiscoverSource(inputPath = approvedSourcePath) {
  const sourcePath = path.resolve(inputPath);
  const input = fs.readFileSync(sourcePath);
  if (!sourcePath.endsWith('.gz')) {
    return {source:input.toString('utf8'), sourcePath, archive:null};
  }
  const metadataPath = sourcePath + '.json';
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (metadata.format !== 'gzip' || !Number.isSafeInteger(metadata.sourceBytes) ||
      metadata.sourceBytes <= 0 || metadata.sourceBytes > 128*1024*1024 ||
      !/^[a-f0-9]{64}$/.test(metadata.sourceSHA256 || '') ||
      !/^[a-f0-9]{64}$/.test(metadata.archiveSHA256 || '')) {
    throw new Error('Invalid approved Discover source metadata.');
  }
  if (input.length !== metadata.archiveBytes || sha(input) !== metadata.archiveSHA256) {
    throw new Error('Approved Discover source archive integrity check failed.');
  }
  const bytes = zlib.gunzipSync(input, {maxOutputLength:metadata.sourceBytes});
  if (bytes.length !== metadata.sourceBytes || sha(bytes) !== metadata.sourceSHA256) {
    throw new Error('Approved Discover source content integrity check failed.');
  }
  return {
    source:bytes.toString('utf8'), sourcePath,
    archive:{format:'gzip', bytes:input.length, sha256:metadata.archiveSHA256,
      sourceBytes:bytes.length}
  };
}

module.exports = {approvedSourcePath, readDiscoverSource};
