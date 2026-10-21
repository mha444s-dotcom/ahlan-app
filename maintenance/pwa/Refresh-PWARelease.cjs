'use strict';
// Run once after changing deployed code, before publishing dist. No dependency,
// network request, user storage, or cache deletion is involved in this step.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const workerPath = path.join(root, 'dist/sw.js');
const worker = fs.readFileSync(workerPath, 'utf8');
const shell = worker.match(/const SHELL = (\[[\s\S]*?\]);/);
if (!shell) throw new Error('PWA shell registry is missing.');
const files = [...shell[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
const hash = crypto.createHash('sha256');
hash.update(worker.replace(/const VERSION = '[^']+';/, "const VERSION = '';"));
let bytes = 0;
for (const file of files) {
  const content = fs.readFileSync(path.join(root, 'dist', file));
  hash.update(file); hash.update(content); bytes += content.length;
}
const revision = hash.digest('hex').slice(0, 16);
fs.writeFileSync(workerPath, worker.replace(/const VERSION = '[^']+';/, `const VERSION = '${revision}';`), 'utf8');
console.log(JSON.stringify({revision, files: files.length, shellBytes: bytes}));
