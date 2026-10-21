'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');

function ignored(paths) {
  // --no-index also checks tracked files, without changing the Git index.
  const result = spawnSync('git', ['check-ignore', '--no-index', '-z', '--stdin'], {
    cwd:root, input:paths.join('\0')+'\0', encoding:'utf8', maxBuffer:8*1024*1024
  });
  assert(!result.error, result.error?.message);
  assert([0,1].includes(result.status), result.stderr);
  return new Set(result.stdout.split('\0').filter(Boolean));
}
function files(dir, prefix='') {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry => {
    const relative = prefix ? prefix+'/'+entry.name : entry.name;
    assert(!entry.isSymbolicLink(), 'Production must not follow external links: '+relative);
    return entry.isDirectory() ? files(path.join(dir,entry.name),relative) : [relative];
  });
}

test('publishing is restricted to the optimized release and every production source remains eligible for Git', () => {
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/pages.yml'),'utf8');
  assert.equal((workflow.match(/uses:\s*actions\/upload-pages-artifact@/g)||[]).length,1,
    'Exactly one Pages artifact is uploaded');
  assert.match(workflow,/uses:\s*actions\/upload-pages-artifact@[^\r\n]+[\s\S]*?with:\s*\r?\n\s+path:\s*["']?release\/ahlan["']?\s*(?:\r?\n|$)/,
    'Pages publishes only the optimized public output');
  assert.doesNotMatch(workflow,/^\s*path:\s*["']?(?:\.|dist)["']?\s*$/m,
    'Neither the repository root nor unfiltered dist is a deployment artifact');
  const production=files(path.join(root,'dist'));
  assert(production.includes('index.html'));
  assert(production.includes('sw.js'));
  assert.deepEqual([...ignored(production.map(file=>'dist/'+file))],[]);
  for(const relative of production) {
    assert(!/(^|\/)(?:\.git|_backups|browser-artifacts|node_modules|prechange|test-artifacts)(?:\/|$)/.test(relative),relative);
    assert(fs.statSync(path.join(root,'dist',relative)).size<=100*1024*1024,
      'GitHub regular-file hard limit exceeded: '+relative);
  }
});

test('local backups, browser caches and downloaded encoder binaries cannot enter a new Git commit', () => {
  const artifacts=[
    '_backups/example/prechange/dist/index.html',
    '_migration-tests/example/state.vscdb',
    'node_modules/esbuild/bin/esbuild',
    'release/ahlan/index.html',
    'maintenance/storage-migration/test-artifacts/example/inventory.json',
    'maintenance/storage-migration/StorageMigration.psm1',
    '.openai/hosting.json',
    'tests/browser-artifacts/example/profile/Default/Cache/data_3',
    'tests/latest-results.tap',
    '.chrome-example/Default/History',
    'design/mobile-review-example/image-tool-profile/Default/History',
    'design/app-review-example/prechange/dist/index.html',
    'design/production-size-example/metrics.json',
    'design/size-experiments/lossless/example.webp',
    'design/header-scroll/prechange/dist/index.html',
    'design/native-discover/prechange/dist/discover-egypt/index.html',
    'design/native-discover/retired-embedding/index.html',
    'design/discover-package-integration/audit/audit-script-0.txt',
    'design/discover-package-integration/source/discover_egypt_source.html',
    'maintenance/tools/libwebp/bin/cwebp.exe'
  ];
  assert.deepEqual([...ignored(artifacts)].sort(),artifacts.sort());
});

test('required source, approved original input, tests, references and encoder licenses remain eligible', () => {
  const source=[
    '.gitignore', 'README.md', 'serve-local.cjs', 'tests/production-package.cjs',
    'tests/browser-app-final.cjs', 'maintenance/extract-discover-native.cjs',
    'maintenance/optimize-discover-images.cjs',
    'maintenance/discover-source.cjs',
    'maintenance/sources/discover-approved.html.gz',
    'maintenance/sources/discover-approved.html.gz.json',
    'design/approved-icon-system/source/home.png',
    'design/approved-icon-system/reference/approved-board.png',
    'design/approved-icon-system/verify-files.cjs',
    'design-references/01.png',
    'maintenance/tools/libwebp/LICENSE',
    'maintenance/tools/libwebp/provenance.json',
    'maintenance/tools/README.md'
  ];
  assert.deepEqual([...ignored(source)],[]);
});
