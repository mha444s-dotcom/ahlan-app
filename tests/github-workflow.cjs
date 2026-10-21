const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github/workflows/pages.yml'), 'utf8');
const build = workflow.split(/^  build:\s*$/m)[1]?.split(/^  deploy:\s*$/m)[0];
const deploy = workflow.split(/^  deploy:\s*$/m)[1];
const mainOnly = "github.ref == 'refs/heads/main' && github.event_name != 'pull_request'";

// These checks protect deployment boundaries; they do not publish or contact GitHub.
test('Pages checks main pushes, pull requests and explicit dispatch without privileged PR triggers', () => {
  assert.match(workflow, /^on:\s*\n  push:\s*\n    branches: \[main\]\s*\n  pull_request:\s*\n    branches: \[main\]\s*\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /\b(?:pull_request_target|workflow_run|secrets\.inherit)\b/);
  assert.ok(build && deploy, 'separate build and deploy jobs are required');
});

test('Build uses read-only checkout and locked Node dependencies before producing the release', () => {
  const top = workflow.slice(0, workflow.indexOf('\njobs:'));
  assert.match(top, /^permissions:\s*\n  contents: read\s*$/m);
  assert.doesNotMatch(build, /(?:pages|id-token|contents): write/);
  assert.match(build, /persist-credentials: false/);
  assert.match(build, /node-version: '24'/);
  assert.match(build, /cache-dependency-path: package-lock\.json/);
  const commands = [...build.matchAll(/^        run: (.+)$/gm)].map(match => match[1]);
  assert.deepEqual(commands, [
    'node maintenance/github/Check-Publish.cjs',
    'npm ci',
    'npm run test:ci',
    'npm run build',
    'node tests/browser-pages.cjs --local --root release/ahlan --base-path /ahlan-app/',
    'node maintenance/github/Stamp-Deployment.cjs'
  ]);
  assert.doesNotMatch(workflow, /\b(?:npm install|npm update|continue-on-error:\s*true)\b/);
});

test('All external Actions are official and pinned to verified release commits', () => {
  const pins = new Map([
    ['actions/checkout', '3d3c42e5aac5ba805825da76410c181273ba90b1'],
    ['actions/setup-node', '949feb2413d6458794dcd2491c4babbbce0c15c1'],
    ['actions/upload-pages-artifact', 'fc324d3547104276b827a68afc52ff2a11cc49c9'],
    ['actions/deploy-pages', '368f82528645a54fb793d4d04e342629a3f51346']
  ]);
  const uses = [...workflow.matchAll(/^\s*uses:\s+(\S+)@(\S+)/gm)];
  assert.equal(uses.length, pins.size);
  for (const [, action, sha] of uses) {
    assert.equal(sha, pins.get(action), `unreviewed action or release: ${action}`);
    assert.match(sha, /^[0-9a-f]{40}$/);
    pins.delete(action);
  }
  assert.equal(pins.size, 0);
});

test('Only release/ahlan is uploaded after tests and only for main outside pull requests', () => {
  const upload = build.slice(build.indexOf('      - name: Upload only the production site'));
  assert.ok(upload.includes(`if: ${mainOnly}`));
  assert.match(upload, /with:\s*\n          path: release\/ahlan\s*\n          retention-days: 1/);
  assert.equal([...workflow.matchAll(/^\s+path:/gm)].length, 1);
  assert.doesNotMatch(upload, /(?:path:\s*(?:\.|dist|_backups|design)|include-hidden-files:\s*true)\s*$/m);
});

test('Deployment waits for checks, scopes write access to Pages and serializes publication', () => {
  assert.ok(deploy.includes(`if: ${mainOnly}`));
  assert.match(deploy, /^    needs: build$/m);
  assert.match(deploy, /permissions:\s*\n      actions: read\s*\n      pages: write\s*\n      id-token: write/);
  assert.match(deploy, /environment:\s*\n      name: github-pages\s*\n      url: \$\{\{ steps\.deployment\.outputs\.page_url \}\}/);
  assert.match(deploy, /concurrency:\s*\n      group: github-pages-production\s*\n      cancel-in-progress: false/);
  assert.doesNotMatch(deploy, /\b(?:run:|checkout@|contents: write|secrets\.)/);
  assert.doesNotMatch(workflow, /cancel-in-progress:\s*true/);
});
