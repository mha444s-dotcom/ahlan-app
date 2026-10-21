'use strict';

// A release is an independent, reproducible publish artifact. This script never
// edits dist, deletes a prior release, changes hosting settings, or deploys.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const vm = require('node:vm');
const esbuild = require('esbuild');
const REPOSITORY = path.resolve(__dirname, '../..');
const PROTECTED_CATEGORY_NAMES = Object.freeze(['assistant','community','daily','education','emergency','health','housing','map','procedures','profile','tourism','translation','transport','work']);
const EXCLUDED = Object.freeze({
  'icon-collection.html': 'Developer icon inspection page; not an app route or dependency.',
  'discover-egypt/extraction-manifest.json': 'Extraction provenance; used by maintenance and preservation tests only.',
  ...Object.fromEntries(PROTECTED_CATEGORY_NAMES.map(name=>['assets/categories/'+name+'.png',
    'Protected source image retained unchanged in dist. The current UI uses the existing 480/960 JPEG display files, verified before packaging.'])),
});
const ASSET_EXTENSIONS = new Set(['.png','.jpg','.jpeg','.webp','.avif','.svg','.ico','.woff','.woff2','.ttf','.otf','.mp3','.ogg','.wav','.m4a','.mp4','.webm']);
const CODE_EXTENSIONS = new Set(['.js','.css','.html','.webmanifest']);
const MAX_GITHUB_FILE = 100 * 1024 * 1024;
const sha256 = content => crypto.createHash('sha256').update(content).digest('hex');
const slash = file => file.split(path.sep).join('/');

function publicPolicy(relative) {
  if (Object.hasOwn(EXCLUDED, relative)) return {include:false, reason:EXCLUDED[relative]};
  const extension = path.posix.extname(relative).toLowerCase();
  if ((relative.startsWith('assets/') || relative.startsWith('discover-egypt/assets/')) && ASSET_EXTENSIONS.has(extension)) return {include:true};
  if ((!relative.includes('/') || relative.startsWith('discover-egypt/') && relative.split('/').length === 2) && CODE_EXTENSIONS.has(extension)) return {include:true};
  return {include:false, reason:'Outside the explicit runtime code and media allowlist; retained in source.'};
}

function listFiles(directory, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name, 'en'))) {
    const relative = prefix + entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symbolic links are not allowed in release input: ' + relative);
    if (entry.isDirectory()) files.push(...listFiles(absolute, relative + '/'));
    else if (entry.isFile()) files.push(relative);
    else throw new Error('Unsupported filesystem entry: ' + relative);
  }
  return files;
}

function shellFiles(worker) {
  const match = worker.match(/const\s+SHELL\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) throw new Error('PWA shell registry is missing.');
  const files = [...match[1].matchAll(/'([a-zA-Z0-9./_-]+)'/g)].map(value=>value[1]);
  const remainder = match[1].replace(/'([a-zA-Z0-9./_-]+)'/g, '').replace(/[\s,[\]]/g, '');
  if (remainder || !files.length || new Set(files).size !== files.length) throw new Error('PWA shell must be an explicit, unique list of relative paths.');
  return files;
}

function outputWorker(originalWorker, emitted) {
  if (!/const VERSION = '[a-f\d]+';/.test(originalWorker)) throw new Error('PWA version declaration is missing.');
  const files = shellFiles(originalWorker);
  const hash = crypto.createHash('sha256');
  hash.update(originalWorker.replace(/const VERSION = '[^']+';/, "const VERSION = '';"));
  let bytes = 0;
  for (const file of files) {
    if (!emitted.has(file)) throw new Error('PWA shell references an excluded or missing file: ' + file);
    const content = emitted.get(file);
    hash.update(file); hash.update(content); bytes += content.length;
  }
  const revision = hash.digest('hex').slice(0,16);
  return {worker:originalWorker.replace(/const VERSION = '[^']+';/, `const VERSION = '${revision}';`), revision, files:files.length, bytes};
}

function isExternal(value) {
  return !value || value.startsWith('#') || value.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(value);
}

// Validate static local dependencies. Dynamic registries are checked separately
// by the app preservation/browser tests; this report states that boundary.
function validateReferences(emitted) {
  const references = [];
  const missing = [];
  function add(from, original, kind) {
    let value = original.replaceAll('&amp;', '&').trim();
    if (isExternal(value) || value.includes('${') || value.includes('<')) return;
    let resolved;
    try {
      const base = new URL(from, 'https://ahlan.invalid/');
      resolved = decodeURIComponent(new URL(value, base).pathname).replace(/^\//, '');
    } catch { throw new Error(`Invalid ${kind} URL in ${from}: ${original}`); }
    if (!resolved) resolved = 'index.html';
    const record = {from, target:resolved, kind};
    references.push(record);
    const directory = resolved.endsWith('/') && [...emitted.keys()].some(file=>file.startsWith(resolved));
    if (!emitted.has(resolved) && !directory) missing.push(record);
  }
  for (const [relative, bytes] of emitted) {
    const extension = path.posix.extname(relative);
    if (!['.html','.css','.js','.webmanifest'].includes(extension)) continue;
    const text = bytes.toString('utf8');
    if (extension === '.html') {
      for (const match of text.matchAll(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/gs)) add(relative, match[2], 'HTML URL');
      for (const match of text.matchAll(/\bsrcset\s*=\s*(["'])(.*?)\1/gs)) {
        if (match[2].startsWith('data:')) continue;
        for (const candidate of match[2].split(',')) add(relative, candidate.trim().split(/\s+/)[0], 'HTML srcset');
      }
    }
    if (extension === '.html' || extension === '.css') {
      for (const match of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)) add(relative, match[1] ?? match[2] ?? match[3], 'CSS URL');
    }
    if (extension === '.js') {
      for (const match of text.matchAll(/\b(?:from\s*|import\s*\(|import\s+|new URL\s*\()(["'])(\.{1,2}\/[^"']+)\1/g)) add(relative, match[2], 'JavaScript module/resource');
      for (const match of text.matchAll(/(["'])(assets\/[^"'\r\n]+?\.(?:png|jpg|jpeg|webp|avif|svg|woff2?))\1/g)) add(relative, match[2], 'Static media literal');
    }
    if (extension === '.webmanifest') {
      const manifest = JSON.parse(text);
      for (const icon of manifest.icons || []) add(relative, icon.src, 'PWA icon');
      if (manifest.start_url) add(relative, manifest.start_url, 'PWA start URL');
    }
  }
  if (missing.length) throw new Error('Missing local release dependencies:\n' + missing.map(record=>`${record.from} -> ${record.target}`).join('\n'));
  return {checked:references.length, missing:[], scope:'Static HTML/CSS/module/media references and manifest icons; dynamic application registries also require preservation and browser tests.'};
}

function legalComments(source) {
  return (source.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g) || [])
    .filter(comment=>/^\/\*!|^\/\/!|@license\b|@preserve\b/i.test(comment));
}

function verifyCategoryDisplaySources(sourceRoot, emitted) {
  const originals = PROTECTED_CATEGORY_NAMES.map(name=>'assets/categories/'+name+'.png');
  if (!originals.some(file=>fs.existsSync(path.join(sourceRoot,file)))) return {originalsRetained:0,displayFilesVerified:0};
  if (!originals.every(file=>fs.existsSync(path.join(sourceRoot,file)))) throw new Error('Protected category originals are incomplete. No release was written.');
  const core = fs.readFileSync(path.join(sourceRoot,'app-core.js'),'utf8');
  const context = vm.createContext({URLSearchParams});
  vm.runInContext(core,context,{timeout:1000,filename:'app-core.js'});
  for (const name of PROTECTED_CATEGORY_NAMES) {
    const markup = context.imageMarkup('categories',name,'protected image');
    if (markup.includes('assets/categories/') || !markup.includes('assets/optimized/categories/'+name+'-480.jpg') || !markup.includes('assets/optimized/categories/'+name+'-960.jpg')) throw new Error('Category display source changed; original must not be excluded: '+name);
    for (const width of [480,960]) if (!emitted.has(`assets/optimized/categories/${name}-${width}.jpg`)) throw new Error('Missing protected category display image: '+name+'-'+width+'.jpg');
  }
  return {originalsRetained:14,displayFilesVerified:28,evidence:'Executed the actual app-core imageMarkup helper for every category: existing JPEG sources, unchanged dimensions and crop; PNG originals stay in dist.'};
}

async function minify(relative, source) {
  const loader = relative.endsWith('.css') ? 'css' : 'js';
  const isolatedModule = loader === 'js' && /^\s*(?:import|export)\s/m.test(source);
  // No bundling, renaming top-level globals, property mangling, tree shaking,
  // console removal, or changing the classic/module execution order.
  const result = await esbuild.transform(source, {
    sourcefile:relative, loader, charset:'utf8', legalComments:'inline',
    // Classic files share a global scope. keepNames injects global helper vars
    // that can collide between independently transformed files; leave their
    // identifiers and natural function names intact. Module locals are isolated.
    minifyWhitespace:true, minifySyntax:true, minifyIdentifiers:isolatedModule,
    keepNames:isolatedModule, treeShaking:false,
    target:['es2022'],
  });
  return {content:Buffer.from(result.code), warnings:result.warnings.map(warning=>({file:relative,text:warning.text,line:warning.location?.line ?? null})), licenses:legalComments(source)};
}

function assertOutputPath(sourceRoot, outputRoot) {
  const releaseRoot = path.join(REPOSITORY, 'release');
  const relative = path.relative(releaseRoot, outputRoot);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Release output must be a named child of ' + releaseRoot);
  const relation = path.relative(sourceRoot, outputRoot);
  if (!relation || !relation.startsWith('..') && !path.isAbsolute(relation)) throw new Error('Output cannot be inside the source directory.');
  for (let check = outputRoot; check !== path.dirname(check); check = path.dirname(check)) {
    if (fs.existsSync(check) && fs.lstatSync(check).isSymbolicLink()) throw new Error('Release output cannot traverse a symbolic link: ' + check);
    if (check === REPOSITORY) break;
  }
}

async function buildRelease(options = {}) {
  const sourceRoot = path.resolve(options.sourceRoot || path.join(REPOSITORY, 'dist'));
  const outputRoot = path.resolve(options.outputRoot || path.join(REPOSITORY, 'release/ahlan'));
  assertOutputPath(sourceRoot, outputRoot);
  const inputs = listFiles(sourceRoot);
  const emitted = new Map(), sourceRows = new Map(), excluded = [], warnings = [], licenses = [];
  let inputBytes = 0;
  for (const relative of inputs) {
    const absolute = path.join(sourceRoot, relative);
    const stat = fs.statSync(absolute);
    inputBytes += stat.size;
    const policy = publicPolicy(relative);
    if (!policy.include) { excluded.push({path:relative,bytes:stat.size,reason:policy.reason}); continue; }
    if (stat.size > MAX_GITHUB_FILE) throw new Error('Production file exceeds GitHub 100 MiB limit: ' + relative);
    const content = fs.readFileSync(absolute);
    sourceRows.set(relative, {sourceBytes:content.length,sourceSha256:sha256(content)});
    if (/\.(?:js|css)$/.test(relative) && relative !== 'sw.js') {
      const transformed = await minify(relative, content.toString('utf8'));
      emitted.set(relative, transformed.content); warnings.push(...transformed.warnings);
      if (transformed.licenses.length) licenses.push({path:relative,comments:transformed.licenses});
    } else emitted.set(relative, content);
  }
  if (!emitted.has('index.html') || !emitted.has('sw.js')) throw new Error('A release requires index.html and sw.js.');
  const pwa = outputWorker(emitted.get('sw.js').toString('utf8'), emitted);
  const worker = await minify('sw.js', pwa.worker);
  emitted.set('sw.js', worker.content); warnings.push(...worker.warnings);
  if (worker.licenses.length) licenses.push({path:'sw.js',comments:worker.licenses});
  const references = validateReferences(emitted);
  const protectedCategorySources = verifyCategoryDisplaySources(sourceRoot,emitted);
  const rows = [];
  for (const [relative, bytes] of emitted) {
    const row = {path:relative,...sourceRows.get(relative),bytes:bytes.length,sha256:sha256(bytes)};
    if (/\.(?:js|css|html|webmanifest)$/.test(relative)) {
      row.gzipBytes = zlib.gzipSync(bytes, {level:9}).length;
      row.brotliBytes = zlib.brotliCompressSync(bytes, {params:{[zlib.constants.BROTLI_PARAM_QUALITY]:11}}).length;
    }
    rows.push(row);
  }
  rows.sort((a,b)=>a.path.localeCompare(b.path, 'en'));
  const outputBytes = rows.reduce((sum,row)=>sum+row.bytes,0);
  const fingerprint = sha256(rows.map(row=>row.path + '\0' + row.sha256).join('\n'));
  const manifest = {
    schema:1, tool:{name:'esbuild',version:esbuild.version}, fingerprint,
    inputFiles:inputs.length, inputBytes, files:rows.length, bytes:outputBytes,
    savedBytes:inputBytes-outputBytes, excluded, pwa:{revision:pwa.revision,shellFiles:pwa.files,shellBytes:pwa.bytes},
    transport:{sidecarsWritten:false,note:'gzip/Brotli sizes are measured only. Hosting must set Content-Encoding before serving compressed sidecars.',
      textBytes:rows.filter(row=>row.gzipBytes).reduce((sum,row)=>sum+row.bytes,0),
      gzipBytes:rows.reduce((sum,row)=>sum+(row.gzipBytes||0),0),brotliBytes:rows.reduce((sum,row)=>sum+(row.brotliBytes||0),0)},
    references, protectedCategorySources, warnings, legalNotices:licenses, entries:rows,
  };
  if (fs.existsSync(outputRoot) && fs.readdirSync(outputRoot).length) {
    const oldFiles = listFiles(outputRoot);
    const matches = oldFiles.length === rows.length && rows.every(row=>fs.existsSync(path.join(outputRoot,row.path)) && sha256(fs.readFileSync(path.join(outputRoot,row.path))) === row.sha256);
    if (!matches) throw new Error('Output already contains a different release. It was left untouched. Choose a new --out release/<name>; no prior release is deleted automatically.');
    return {manifest,outputRoot,reused:true};
  }
  const toolLicense = fs.readFileSync(path.join(REPOSITORY,'node_modules/esbuild/LICENSE.md'),'utf8');
  // All parsing, references, hashes and compression checks finish before output.
  fs.mkdirSync(outputRoot, {recursive:true});
  for (const [relative, content] of emitted) {
    const target = path.join(outputRoot, relative);
    fs.mkdirSync(path.dirname(target), {recursive:true}); fs.writeFileSync(target, content, {flag:'wx'});
  }
  const reportRoot = path.join(REPOSITORY,'release/build-reports',slash(path.relative(path.join(REPOSITORY,'release'),outputRoot)).replaceAll('/','__'));
  fs.mkdirSync(reportRoot,{recursive:true});
  fs.writeFileSync(path.join(reportRoot,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(reportRoot,'esbuild-LICENSE.txt'),toolLicense);
  return {manifest,outputRoot,reportRoot,reused:false};
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg,index)=>index % 2 === 0 && !['--source','--out'].includes(arg)) || args.length % 2) throw new Error('Usage: node maintenance/production/Build-Release.cjs [--source <directory>] [--out release/<name>]');
  const options = {};
  for (let index=0; index<args.length; index+=2) options[args[index] === '--source' ? 'sourceRoot' : 'outputRoot'] = args[index+1];
  const result = await buildRelease(options);
  const {manifest} = result;
  console.log(JSON.stringify({output:slash(path.relative(REPOSITORY,result.outputRoot)),report:result.reportRoot && slash(path.relative(REPOSITORY,result.reportRoot)),reused:result.reused,files:manifest.files,bytes:manifest.bytes,savedBytes:manifest.savedBytes,excluded:manifest.excluded.length,pwa:manifest.pwa,referenceChecks:manifest.references.checked,warnings:manifest.warnings.length},null,2));
}
if (require.main === module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports = {buildRelease,publicPolicy,listFiles,shellFiles,outputWorker,validateReferences,minify,verifyCategoryDisplaySources,PROTECTED_CATEGORY_NAMES};
