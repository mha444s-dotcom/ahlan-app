'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'dist');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.woff2':'font/woff2'};
// Serve only dist on loopback; backups and repository metadata are never exposed.
const server = http.createServer((request,response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname); }
  catch { response.writeHead(400); response.end('Bad request'); return; }
  const target = path.resolve(root,'.' + (pathname === '/' ? '/index.html' : pathname));
  if (!target.startsWith(root + path.sep) || pathname.includes('\\') || !['GET','HEAD'].includes(request.method)) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  fs.stat(target,(error,stat) => {
    if (error || !stat.isFile()) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200,{'Content-Type':types[path.extname(target)] || 'application/octet-stream','Content-Length':stat.size,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});
    if (request.method === 'HEAD') response.end(); else fs.createReadStream(target).pipe(response);
  });
});
if (require.main === module) server.listen(Number(process.env.AHLAN_PORT || 4173),'127.0.0.1',() => console.log('Ahlan local: http://127.0.0.1:' + server.address().port));
module.exports = server;
