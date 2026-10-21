#!/usr/bin/env node
'use strict';

// Reproducible extraction of the approved Discover source. This only creates
// page-specific modules and byte-identical raster assets; it does not edit the
// application shell, routes, source checkpoint, or other pages.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const {pruneDiscoverStyles} = require('./discover-dead-styles.cjs');
const {approvedSourcePath, readDiscoverSource} = require('./discover-source.cjs');

const project = path.resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');
const argumentsWithoutFlags = process.argv.slice(2).filter(argument => argument !== '--check');
const sourcePath = path.resolve(argumentsWithoutFlags[0] || approvedSourcePath);
const outputPath = path.resolve(argumentsWithoutFlags[1] || path.join(project, 'dist/discover-egypt'));
const permittedOutput = path.join(project, 'dist/discover-egypt');
if (outputPath !== permittedOutput && !outputPath.startsWith(project + path.sep)) {
  throw new Error('Extraction output must remain inside the project.');
}
if (sourcePath === path.join(outputPath, 'page.html')) {
  throw new Error('The approved source and generated template must be different files.');
}

const sourceInput = readDiscoverSource(sourcePath);
const source = sourceInput.source;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
// Approved visual identity is preserved by decoded-pixel verification. The
// compressed source still retains every original PNG, including provenance.
const optimizedImages = JSON.parse(fs.readFileSync(path.join(project,
  'maintenance/production/discover-image-manifest.json'), 'utf8'));
const modernImages = new Map(optimizedImages.records.map(record => [record.source, record]));
const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/\bsrc\s*=/.test(match[1])).map(match => match[2]);
const styles = [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]);
if (scripts.length !== 4 || styles.length !== 12) {
  throw new Error(`Unexpected source structure: ${scripts.length} scripts and ${styles.length} styles.`);
}

const rasterPattern = /data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/gi;
const assets = new Map();
const sourceRasterCounts = new Map();
for (const match of source.matchAll(rasterPattern)) {
  const bytes = Buffer.from(match[2], 'base64');
  const hash = sha(bytes);
  const extension = ({png:'png',jpeg:'jpg',jpg:'jpg',webp:'webp',gif:'gif'})[match[1].toLowerCase()];
  if (!extension || !bytes.length) throw new Error(`Unsupported raster asset: ${match[1]}`);
  const existing = assets.get(match[0]);
  if (!existing) {
    const sourceFile = `assets/${hash}.${extension}`;
    const modern = modernImages.get('discover-egypt/' + sourceFile);
    if (modern) {
      if (modern.sourceSHA256 !== hash || modern.pixelDifferences || modern.alphaDifferences) throw new Error('Unverified modern asset: ' + sourceFile);
      const file = modern.target.replace(/^discover-egypt\//, '');
      const encoded = fs.readFileSync(path.join(project, 'dist', modern.target));
      if (sha(encoded) !== modern.sha256) throw new Error('Modern asset differs: ' + file);
      assets.set(match[0], {file, hash:modern.sha256, bytes:encoded, sourceFile, sourceHash:hash, sourceBytes:bytes.length,
        decodedRGBA256:modern.decodedRGBA256, width:modern.width, height:modern.height});
    } else assets.set(match[0], {file:sourceFile, hash, bytes});
  }
  sourceRasterCounts.set(hash, (sourceRasterCounts.get(hash) || 0) + 1);
}
if (assets.size !== 23) throw new Error(`Expected 23 approved raster payloads, found ${assets.size}.`);
const inlineVectors = [...source.matchAll(/data:image\/svg\+xml,[^'"\s)<>]+/gi)].map(match => match[0]);
if (inlineVectors.length !== 6) throw new Error(`Expected 6 approved inline vector payloads, found ${inlineVectors.length}.`);

const assetFor = dataURL => {
  const asset = assets.get(dataURL);
  if (!asset) throw new Error('A source raster payload was not indexed.');
  return asset;
};
const replaceMarkupAssets = text => text.replace(rasterPattern, url => './' + assetFor(url).file);
const replaceJavaScriptAssets = text => text.replace(
  /(['"])(data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+)\1/gi,
  (_, quote, url) => `assetURL(${JSON.stringify(assetFor(url).file)})`
);
const replaceTemplateAssets = text => text.replace(rasterPattern,
  url => '${assetURL(' + JSON.stringify(assetFor(url).file) + ')}');
function responsiveMarkup(text) {
  return text.replace(/<img\b[^>]*>/gi, tag => {
    const match = tag.match(/\bsrc=["']\.\/assets\/([a-f0-9]{64})\.webp["']/);
    if (!match || /\bsrcset=/.test(tag)) return tag;
    const small = modernImages.get(`discover-egypt/assets/renditions/${match[1]}-320.png`);
    const medium = modernImages.get(`discover-egypt/assets/renditions/${match[1]}-640.png`);
    const full = modernImages.get(`discover-egypt/assets/${match[1]}.png`);
    if (!small || !medium || !full) return tag;
    const relative = record => './' + record.target.replace(/^discover-egypt\//, '');
    return tag.replace(/\s*\/?>$/, ending => ` srcset="${relative(small)} ${small.width}w, ${relative(medium)} ${medium.width}w, ${relative(full)} ${full.width}w" sizes="(max-width:760px) 256px, 640px"${ending}`);
  });
}

// These data declarations contain strings, arrays and plain objects. A small
// balanced scanner preserves their original bytes and stops only at the real
// declaration terminator, not semicolons inside strings or comments.
function takeDeclaration(text, name) {
  const token = new RegExp('\\bconst\\s+' + name + '\\s*=');
  const found = token.exec(text);
  if (!found) throw new Error(`Missing source data declaration: ${name}`);
  const start = found.index;
  let quote = '', comment = '', escaped = false, depth = 0;
  for (let index = start; index < text.length; index++) {
    const character = text[index], next = text[index + 1];
    if (comment === '//') { if (character === '\n') comment = ''; continue; }
    if (comment === '/*') { if (character === '*' && next === '/') {comment = '';index++;} continue; }
    if (quote) {
      if (escaped) {escaped = false;continue;}
      if (character === '\\') {escaped = true;continue;}
      if (character === quote) quote = '';
      continue;
    }
    if (character === '/' && (next === '/' || next === '*')) {comment = character + next;index++;continue;}
    if (character === '"' || character === "'" || character === '`') {quote = character;continue;}
    if ('([{'.includes(character)) depth++;
    if (')]}'.includes(character)) depth--;
    if (character === ';' && depth === 0) {
      return {name, start, end:index + 1, text:text.slice(start, index + 1)};
    }
  }
  throw new Error(`Unterminated source data declaration: ${name}`);
}

const mainSource = scripts[0];
const prefixEnd = mainSource.indexOf('function esc(s)');
if (prefixEnd < 0) throw new Error('The approved main-script boundary was not found.');
const prefix = mainSource.slice(0, prefixEnd).replace(/^\s*'use strict';\s*/, '');
const dataNames = ['photo','entries','add','tourism','featured','eras','ancient','greek',
  'coptic','islam','dynasties','dynastiesDetails','modern','culture','regions','experiences',
  'heritageRecords','heritageFallback','heritageCategories','eraVisuals','eraArtifacts','timeScenes'];
const extractedNames = ['heritageRecords','heritageFallback','heritageCategories','eraVisuals','eraArtifacts','timeScenes'];
const declarations = extractedNames.map(name => takeDeclaration(mainSource, name));
let viewSource = mainSource.slice(prefixEnd);
for (const declaration of [...declarations].sort((left, right) => right.start - left.start)) {
  const localStart = declaration.start - prefixEnd;
  viewSource = viewSource.slice(0, localStart) + viewSource.slice(declaration.end - prefixEnd);
}

const dataSource = prefix + '\n' + declarations.map(item => item.text).join('\n');
// Approved mobile-quality patch: keep the entire catalogue and original image
// query URLs, but delegate loading to the native viewport-aware resource scope.
// Failure values must not become permanent cache entries or unrelated photos.
const imageStart = viewSource.indexOf('// Wikipedia thumbnails are loaded dynamically');
const imageEnd = viewSource.indexOf("el('heritage-filters').addEventListener", imageStart);
if (imageStart < 0 || imageEnd < 0) throw new Error('Original image-loader boundary changed.');
viewSource = viewSource.slice(0,imageStart) +
  'function heritageLoadImages(){env.heritageImages.observe();}\n' + viewSource.slice(imageEnd);
viewSource = viewSource.replace("if(typeof heritageImageCache!=='undefined')heritageLoadImages();",'heritageLoadImages();')
  .replace('\nheritageRenderHome();','\nenv.heritageImages.prepare();\nheritageRenderHome();');
// Evaluate only the original data factory, never browser logic. This catches
// accidental extraction changes before writing any generated deployment file.
const dataSnapshot = vm.runInNewContext(dataSource + '\n({heritageRecords,heritageCategories,eras});', {}, {timeout:5000});
if (dataSnapshot.heritageRecords.length !== 170 || dataSnapshot.eras.length !== 11 ||
    dataSnapshot.heritageCategories.length !== 10) throw new Error('The approved data counts changed.');

const environmentNames = ['document','window','history','location','localStorage',
  'requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout','matchMedia',
  'IntersectionObserver','ResizeObserver','performance','getComputedStyle','fetch','alert',
  'devicePixelRatio','queueMicrotask','Event'];
const environment = `const {${environmentNames.join(',')}} = env;\nconst assetURL = env.assetURL;\n`;
const banner = '// Extracted from the approved Discover page. Preserve source content and behavior.\n';
const contentModule = banner + 'export function createDiscoverData(assetURL) {\n' +
  replaceJavaScriptAssets(dataSource) + '\nreturn {' + dataNames.join(',') + '};\n}\n';
const viewModule = banner + 'export function installView(env, data) {\n' + environment +
  'const {' + dataNames.join(',') + '} = data;\n' + replaceJavaScriptAssets(viewSource) +
  '\nreturn {showFavorites,heritageShow,heritageHide,changeEra,' +
  'getGalleryState:()=>({expanded:heritageExpanded,y:heritageFullScreen.scrollTop,' +
  'element:heritageFullScreen}),getFavoriteCount:()=>favSet.size};\n}\n';
const tombModule = banner + 'export function installTomb(env) {\n' + environment +
  replaceTemplateAssets(scripts[2]) + '\n}\n';
// Stop scheduling idle frames while paused; the original play/pause controls
// still resume the same auto-scroll when requested, in the visible local scope.
const ambientSource = scripts[1].replace('let last=0;','let last=0;let frameId=0;')
  .replace('function frame(ts){','function frame(ts){frameId=0;if(paused)return;')
  .replaceAll('requestAnimationFrame(frame);','frameId=requestAnimationFrame(frame);')
  .replace('const stop=()=>{paused=true};','const stop=()=>{paused=true;last=0;cancelAnimationFrame(frameId);frameId=0};')
  .replace('const play=()=>{paused=false};','const play=()=>{paused=false;if(!frameId)frameId=requestAnimationFrame(frame);};');
const effectsModule = banner + 'export function installAmbientEffects(env) {\n' + environment +
  ambientSource + '\n}\n' + 'export function finalizeEffects(env) {\n' + environment +
  scripts[3] + '\n}\n' + 'export function installEffects(env) {\n' +
  'installAmbientEffects(env);\nfinalizeEffects(env);\n}\n';

const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(source);
if (!body) throw new Error('The approved page body was not found.');
const template = responsiveMarkup(replaceMarkupAssets(body[1]
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ''))).trim() + '\n';
const scopedCSS = styles.map((style, index) => `/* Approved source stylesheet ${index + 1}. */\n` +
  replaceMarkupAssets(style)
    .replace(/:root\b/g, ':host')
    .replace(/(?<![\w-])html(?![\w-])/g, '[data-discover-document]')
    .replace(/(?<![\w-])body(?![\w-])/g, '[data-discover-body]')
    // Resolve the original page's viewport against its native component width,
    // just as the former document viewport did, without changing its proportions.
    .replace(/(-?(?:\d*\.)?\d+)vw\b/g, (_, value) => `calc(var(--discover-width, 100vw) * ${Number(value)/100})`)
    .replace(/((?:\d*\.)?\d+)(?:d|s|l)?vh\b/g, (_, value) => `calc(var(--discover-viewport-height) * ${Number(value)/100})`)
    // Font faces declared in a shadow stylesheet are ignored by Chrome. Use
    // private family names for the exact original font faces registered by fonts.js.
    .replace(/\b(Cairo|Alexandria|Amiri)\b/g, 'AhlanDiscover$1')).join('\n\n');
// Explicitly audited old layers have no native DOM/JavaScript constructors.
// Retain every original visual payload, including art in a retired CSS rule.
const styleCleanup = pruneDiscoverStyles(scopedCSS);
const css = styleCleanup.css;
const retainedVectors = [...css.matchAll(/data:image\/svg\+xml,[^'"\s)<>]+/gi)].map(match => match[0]);
if (JSON.stringify(retainedVectors) !== JSON.stringify(inlineVectors)) {
  throw new Error('An approved inline vector payload changed during CSS scoping.');
}
const fontLink = [...source.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/gi)]
  .map(match => match[1].replace(/&amp;/g, '&')).find(url => url.includes('fonts.googleapis.com/css'));
if (!fontLink) throw new Error('The original font stylesheet is missing.');

for (const [name, generated] of [['content.js',contentModule],['view.js',viewModule],
  ['tomb.js',tombModule],['effects.js',effectsModule]]) {
  // Parse as a classic function after removing the single module export. The
  // extracted logic uses no imports and remains private to its native module.
  new vm.Script(generated.replace(/\bexport\s+(?=function\b)/g, ''), {filename:name});
  if (/data:image\/[a-z0-9.+-]+;base64,/i.test(generated)) throw new Error(`Unextracted raster data in ${name}.`);
}

if (!checkOnly) fs.mkdirSync(path.join(outputPath, 'assets'), {recursive:true});
const outputFiles = {'content.js':contentModule,'view.js':viewModule,'tomb.js':tombModule,
  'effects.js':effectsModule,'page.html':template,'page.css':css};
for (const asset of assets.values()) {
  const destination = path.join(outputPath, asset.file);
  if (fs.existsSync(destination) && sha(fs.readFileSync(destination)) !== asset.hash) {
    throw new Error(`Existing generated asset differs: ${asset.file}`);
  }
  if (!fs.existsSync(destination)) {
    if (checkOnly) throw new Error(`Missing extracted asset: ${asset.file}`);
    fs.writeFileSync(destination, asset.bytes);
  }
  if (sha(fs.readFileSync(destination)) !== asset.hash) throw new Error(`Asset verification failed: ${asset.file}`);
}
for (const [filename, text] of Object.entries(outputFiles)) {
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(path.join(outputPath, filename), 'utf8') !== text) throw new Error('Extracted source differs: '+filename);
  } else fs.writeFileSync(path.join(outputPath, filename), text, 'utf8');
}
const manifest = {
  source:path.relative(project, sourcePath).replaceAll('\\','/'),sourceSHA256:sha(source),
  sourceArchive:sourceInput.archive,
  scripts:scripts.map((text,index)=>({index,sha256:sha(text)})),
  styles:styles.map((text,index)=>({index,sha256:sha(text)})),
  fontStylesheet:fontLink,
  counts:{heritageRecords:dataSnapshot.heritageRecords.length,categories:dataSnapshot.heritageCategories.length-1,
    eras:dataSnapshot.eras.length,rasterAssets:assets.size,inlineVectors:inlineVectors.length,
    embeddedVisuals:assets.size+inlineVectors.length},
  heritageRecordsSHA256:sha(JSON.stringify(dataSnapshot.heritageRecords)),
  styleCleanup:{policy:'audited-retired-native-layers-v1',removedRules:styleCleanup.removedRules,
    prunedRules:styleCleanup.prunedRules,removedSelectors:styleCleanup.removedSelectors,
    preservedAssetRules:styleCleanup.preservedAssetRules,inputBytes:styleCleanup.inputBytes,
    outputBytes:styleCleanup.outputBytes,bytesSaved:styleCleanup.bytesSaved},
  assets:[...assets.values()].map(asset=>({file:asset.file,sha256:asset.hash,bytes:asset.bytes.length,
    ...(asset.sourceFile ? {sourceFile:asset.sourceFile,sourceSHA256:asset.sourceHash,sourceBytes:asset.sourceBytes,
      decodedRGBA256:asset.decodedRGBA256,width:asset.width,height:asset.height,encoding:'WebP lossless exact'} : {}),
    sourceOccurrences:sourceRasterCounts.get(asset.sourceHash || asset.hash)})),
  inlineVectors:inlineVectors.map(url=>({sha256:sha(url),bytes:Buffer.byteLength(url)})),
  embeddedVisuals:[...source.matchAll(/data:image\/(?:[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+|svg\+xml,[^'"\s)<>]+)/gi)]
    .map(match=>({sha256:sha(match[0]),bytes:Buffer.byteLength(match[0]),
      kind:match[0].startsWith('data:image/svg+xml,')?'inline-vector':'externalized-raster'})),
  files:Object.fromEntries(Object.entries(outputFiles).map(([filename,text])=>[filename,{sha256:sha(text),bytes:Buffer.byteLength(text)}]))
};
if (process.argv.includes('--check')) {
  if (fs.readFileSync(path.join(outputPath, 'extraction-manifest.json'), 'utf8') !== JSON.stringify(manifest,null,2)+'\n') throw new Error('Extraction manifest differs');
} else fs.writeFileSync(path.join(outputPath, 'extraction-manifest.json'), JSON.stringify(manifest,null,2)+'\n', 'utf8');
console.log(JSON.stringify({status:'Extracted and verified',output:outputPath,counts:manifest.counts,
  files:Object.fromEntries(Object.entries(manifest.files).map(([name,info])=>[name,info.bytes])),
  assetBytes:manifest.assets.reduce((total,asset)=>total+asset.bytes,0)},null,2));
