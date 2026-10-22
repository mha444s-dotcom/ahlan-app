'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const test = require('node:test');
const scripts = path.resolve(__dirname, '../maintenance/github');
const scanner = require('../maintenance/github/Check-Publish.cjs');
const sha = 'a'.repeat(40);
const httpsOrigin = 'https://github.com/mha444s-dotcom/ahlan-app.git';
const sshOrigin = 'git@github.com:mha444s-dotcom/ahlan-app.git';

// Production scripts are loaded with isolated process/network/FS doubles.
// No test invokes git, opens a browser, changes repository state or sends requests.
function isolated(name, overrides = {}, globals = {}) {
  const filename = path.join(scripts, name);
  const module = { exports: {} };
  const messages = [];
  const localRequire = id => {
    if (Object.hasOwn(overrides, id)) return overrides[id];
    if (id.startsWith('node:') && id !== 'node:child_process') return require(id);
    throw Error('Unexpected dependency in isolated test: ' + id);
  };
  localRequire.main = null;
  const context = {
    module, exports: module.exports, require: localRequire,
    __filename: filename, __dirname: scripts,
    process: { argv: [], execPath: process.execPath, env: {}, platform: process.platform },
    Buffer, URL, AbortSignal, setTimeout, clearTimeout,
    console: { log: (...args) => messages.push(args.join(' ')), error: (...args) => messages.push(args.join(' ')) },
    fetch: () => { throw Error('Network access is forbidden in unit tests.'); },
    ...globals
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return { api: module.exports, messages };
}

function fixture(callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ahlan-publish-test-'));
  function write(name, contents) {
    const target = path.join(directory, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
    return target;
  }
  try { return callback({ directory, write }); }
  finally {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('ahlan-publish-test-'), 'cleanup must stay inside its named temporary fixture');
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

function publishDouble({ branch = 'main', origins = [httpsOrigin], pushOrigins = origins, conflicts = '', failCommand, reports } = {}) {
  const calls = [];
  let scans = 0;
  const outputs = new Map([
    ['branch --show-current', branch],
    ['remote get-url --all origin', origins.join('\n')],
    ['remote get-url --push --all origin', pushOrigins.join('\n')],
    ['diff --name-only --diff-filter=U', conflicts],
    ['diff --cached --name-only', 'dist/index.html'],
    ['rev-parse HEAD', sha]
  ]);
  const child = {
    spawnSync(command, args, options) {
      const commandLine = args.join(' ');
      calls.push({ command, args: Array.from(args), options });
      return { status: failCommand?.(command, commandLine) ? 1 : 0, stdout: command === 'git' ? outputs.get(commandLine) || '' : '' };
    }
  };
  const wait = [];
  const loaded = isolated('Publish.cjs', {
    'node:child_process': child,
    './Check-Publish.cjs': {
      gitFiles: () => ['dist/index.html'],
      checkFiles: () => reports?.[scans++] || { files: 1, bytes: 10, findings: [], fingerprint: 'unchanged' }
    },
    '../cloudflare/Wait-Cloudflare.cjs': { waitCloudflare: async commit => wait.push(commit) }
  });
  return { ...loaded, calls, wait };
}

test('Publish rejects missing messages and publishes only from main to the reviewed repository', async () => {
  const invalidArgs = publishDouble();
  await assert.rejects(invalidArgs.api.publish([]), /Usage:/);
  assert.equal(invalidArgs.calls.length, 0);
  for (const configuration of [
    { branch: 'feature' },
    { origins: ['https://github.com/mha444s-dotcom/safer-app.git'] },
    { pushOrigins: ['https://github.com/another/ahlan-app.git'] },
    { pushOrigins: [httpsOrigin, 'https://example.com/unreviewed.git'] },
    { conflicts: 'dist/index.html' }
  ]) {
    const run = publishDouble(configuration);
    await assert.rejects(run.api.publish(['--message', 'A tested change']));
    assert.ok(!run.calls.some(call => call.args[0] === 'add' || call.args[0] === 'commit' || call.args[0] === 'push'));
  }
  for (const origin of [httpsOrigin, sshOrigin]) {
    const run = publishDouble({ origins: [origin] });
    assert.doesNotThrow(() => run.api.assertTarget());
  }
});

test('Publish stops before staging after failed validation or failed security checks', async () => {
  for (const configuration of [
    { failCommand: (_, args) => args.includes('test:ci') },
    { failCommand: (_, args) => args.includes('Prepare-Release.cjs') },
    { failCommand: (_, args) => args.includes('browser-pages.cjs') },
    { failCommand: (_, args) => args.includes('browser-startup.cjs') },
    { reports: [{ findings: [{ file: '.env', rule: 'forbidden-path' }] }] }
  ]) {
    const run = publishDouble(configuration);
    await assert.rejects(run.api.publish(['--message', 'A tested change']));
    assert.ok(!run.calls.some(call => ['add', 'commit', 'push'].includes(call.args[0])));
  }
});

test('Publish refuses source edits discovered during validation before staging or push', async () => {
  for (const after of [
    { findings: [], fingerprint: 'modified' },
    { findings: [{ file: '.env', rule: 'forbidden-path' }], fingerprint: 'original' }
  ]) {
    const run = publishDouble({ reports: [{ findings: [], fingerprint: 'original' }, after] });
    await assert.rejects(run.api.publish(['--message', 'A tested change']), /Source changed/);
    assert.ok(!run.calls.some(call => ['add', 'commit', 'push'].includes(call.args[0])));
  }
});

test('Publish treats commit text literally and waits for the exact pushed commit', async () => {
  const run = publishDouble();
  const message = 'Literal "quotes", $(), `text` and\nnewlines';
  await run.api.publish(['--message', message]);
  const commit = run.calls.find(call => call.args[0] === 'commit');
  assert.ok(commit.args[2] === message, 'commit message must be one unchanged argument');
  assert.ok(run.calls.every(call => !call.options.shell), 'shell interpolation must stay disabled');
  const push = run.calls.find(call => call.args[0] === 'push');
  assert.deepEqual(push.args, ['push', 'origin', 'HEAD:main']);
  assert.deepEqual(run.wait, [sha]);
});

test('Source checks reject private paths, traversal, missing files and non-regular files', () => {
  fixture(({ directory, write }) => {
    write('allowed.js', 'module.exports = 1;');
    fs.mkdirSync(path.join(directory, 'directory'));
    const forbiddenPaths = ['../escape.js', path.join(directory, 'allowed.js'), '.env', '.env.local', '.openai/hosting.json', '_backups/old.json', '_backups\\old.json', 'node_modules/a.js', 'tests/browser-artifacts/profile/data.json', 'private.pem', 'state.vscdb'];
    for (const file of forbiddenPaths) {
      const result = scanner.checkFiles([file], directory);
      assert.ok(result.findings.some(finding => ['forbidden-path', 'outside-root'].includes(finding.rule)), 'unsafe path must be rejected: ' + file);
    }
    assert.ok(scanner.checkFiles(['missing.js'], directory).findings.some(f => f.rule === 'missing-file'));
    assert.ok(scanner.checkFiles(['directory'], directory).findings.some(f => f.rule === 'non-regular-file'));
    assert.equal(scanner.checkFiles(['allowed.js'], directory).findings.length, 0);
  });
});

test('Source fingerprints cover contents and names rather than only timestamps and file sizes', () => {
  fixture(({ directory, write }) => {
    write('a.json', '1111');
    write('b.json', '2222');
    const first = scanner.checkFiles(['a.json', 'b.json'], directory);
    assert.equal(first.fingerprint, scanner.checkFiles(['b.json', 'a.json'], directory).fingerprint);
    write('a.json', '3333');
    assert.notEqual(first.fingerprint, scanner.checkFiles(['a.json', 'b.json'], directory).fingerprint);
    write('a.json', '1111');
    assert.equal(first.fingerprint, scanner.checkFiles(['a.json', 'b.json'], directory).fingerprint);
    assert.notEqual(first.fingerprint, scanner.checkFiles(['a.json'], directory).fingerprint);
    fs.renameSync(path.join(directory, 'b.json'), path.join(directory, 'c.json'));
    assert.notEqual(first.fingerprint, scanner.checkFiles(['a.json', 'c.json'], directory).fingerprint);
  });
});

test('Linked source directories cannot import files from outside the reviewed checkout', () => {
  fixture(({ directory, write }) => {
    const source = path.join(directory, 'source');
    fs.mkdirSync(source);
    write('outside/file.json', '{}');
    const linked = path.join(source, 'linked');
    // Windows junction creation does not need symbolic-link elevation.
    fs.symlinkSync(path.join(directory, 'outside'), linked, process.platform === 'win32' ? 'junction' : 'dir');
    assert.ok(scanner.checkFiles(['linked/file.json'], source).findings.some(finding => finding.rule === 'linked-ancestor'));
  });
});

test('Source checks reject files at and beyond the GitHub 50 MiB warning threshold', () => {
  fixture(({ directory, write }) => {
    const file = write('large.bin', '');
    const handle = fs.openSync(file, 'r+');
    try {
      for (const size of [50 * 1024 * 1024, 50 * 1024 * 1024 + 1]) {
        fs.ftruncateSync(handle, size);
        const result = scanner.checkFiles(['large.bin'], directory);
        assert.ok(result.findings.some(finding => finding.rule === 'github-50MiB-threshold'));
        assert.equal(result.bytes, size);
      }
    } finally { fs.closeSync(handle); }
  });
});

test('Secret checks report rule and filename without echoing sensitive values', () => {
  fixture(({ directory, write }) => {
    const cases = [
      ['private-key', '-----BEGIN ' + 'PRIVATE KEY-----'],
      ['github-token', 'ghp' + '_' + 'A'.repeat(36)],
      ['openai-token', 'sk' + '-' + 'B'.repeat(36)],
      ['aws-access-key', 'AK' + 'IA' + 'C'.repeat(16)],
      ['google-api-key', 'AI' + 'za' + 'D'.repeat(35)],
      ['credential-url', 'https://' + 'user' + ':' + 'secret' + '@example.test'],
      ['literal-secret', 'api' + '_key = "' + 'E'.repeat(20) + '"'],
      ['windows-user-sid', ['S', 1, 5, 21, 123, 456, 789, 1001].join('-')]
    ];
    for (let index = 0; index < cases.length; index++) {
      const [rule, value] = cases[index];
      const filename = 'secret-' + index + '.json';
      write(filename, value);
      const result = scanner.checkFiles([filename], directory);
      assert.ok(result.findings.some(finding => finding.rule === rule), 'missing secret detector: ' + rule);
      assert.ok(!JSON.stringify(result).includes(value), 'scanner must never print matched secret values');
      assert.ok(result.findings.every(finding => Object.keys(finding).every(key => ['file', 'rule'].includes(key))));
    }
  });
});

test('Approved compressed source is inspected, and corrupt compression fails explicitly', () => {
  fixture(({ directory, write }) => {
    const filename = 'maintenance/sources/discover-approved.html.gz';
    write(filename, zlib.gzipSync('ghp' + '_' + 'F'.repeat(36)));
    assert.ok(scanner.checkFiles([filename], directory).findings.some(finding => finding.rule === 'github-token'));
    write(filename, 'invalid gzip bytes');
    assert.throws(() => scanner.checkFiles([filename], directory));
  });
});

test('Credential lookup cannot prompt or log credentials; errors omit the credential response', () => {
  const calls = [];
  const token = 'unit-test-' + 'credential-value';
  const loaded = isolated('Credentials.cjs', { 'node:child_process': {
    spawnSync(command, args, options) {
      calls.push({ command, args: Array.from(args), options });
      return { status: 0, stdout: 'username=unit-test\npassword=' + token + '\n' };
    }
  } });
  assert.ok(loaded.api.credential() === token);
  assert.equal(calls[0].options.env.GIT_TERMINAL_PROMPT, '0');
  assert.equal(calls[0].options.env.GCM_INTERACTIVE, 'never');
  assert.equal(loaded.messages.length, 0);
  const failed = isolated('Credentials.cjs', { 'node:child_process': { spawnSync: () => ({ status: 1, stdout: token, stderr: token }) } });
  assert.throws(() => failed.api.credential(), error => !error.message.includes(token) && /sign-in unavailable/.test(error.message));
});

test('GitHub request restricts target repository and redacts failed API responses', async () => {
  let requests = 0;
  const token = 'unit-test-' + 'credential-value';
  const loaded = isolated('Credentials.cjs', { 'node:child_process': { spawnSync: () => { throw Error('Unexpected credential lookup.'); } } }, {
    fetch: async () => { requests++; return { ok: false, status: 403, json: async () => ({ error: token }) }; }
  });
  await assert.rejects(loaded.api.request('/repos/mha444s-dotcom/safer-app', { token }), /outside ahlan-app/);
  assert.equal(requests, 0);
  await assert.rejects(loaded.api.request('/repos/mha444s-dotcom/ahlan-app/pages', { token }), error => /403/.test(error.message) && !error.message.includes(token));
  assert.equal(requests, 1);
  assert.equal(loaded.messages.length, 0);
});

test('GitHub route traversal is rejected before fetching or reading sign-in credentials', async () => {
  let credentials = 0;
  let requests = 0;
  const loaded = isolated('Credentials.cjs', { 'node:child_process': { spawnSync: () => { credentials++; throw Error('Unexpected lookup.'); } } }, {
    fetch: async () => { requests++; throw Error('Unexpected request.'); }
  });
  const prefix = '/repos/mha444s-dotcom/ahlan-app/';
  for (const route of [
    '/repos/mha444s-dotcom/safer-app/pages',
    'https://example.test/repos/mha444s-dotcom/ahlan-app/pages',
    '//example.test/repos/mha444s-dotcom/ahlan-app/pages',
    prefix + '../safer-app', prefix + './pages',
    prefix + '%2e%2e/safer-app', prefix + '%2E%2E/safer-app',
    prefix + '%2fother', prefix + '%2Fother', prefix + '%5cother',
    prefix + '..\\safer-app', prefix + 'pages#fragment'
  ]) await assert.rejects(loaded.api.request(route), /(?:Unsafe|outside ahlan-app)/);
  assert.equal(credentials, 0);
  assert.equal(requests, 0);
});

test('Deployment confirmation rejects incomplete SHAs before looking up credentials', async () => {
  let credentials = 0;
  const loaded = isolated('Wait-Deployment.cjs', { './Credentials.cjs': {
    OWNER: 'mha444s-dotcom', REPO: 'ahlan-app',
    credential: () => { credentials++; return 'test-only'; },
    request: () => { throw Error('Unexpected request.'); }
  } });
  for (const invalid of ['', 'main', sha.slice(1), sha.toUpperCase()]) await assert.rejects(loaded.api.waitDeployment(invalid), /complete tested commit SHA/);
  assert.equal(credentials, 0);
});

test('Deployment confirmation considers only the matching push run and checks the public response', async () => {
  const routes = [];
  const url = 'https://mha444s-dotcom.github.io/ahlan-app/';
  const loaded = isolated('Wait-Deployment.cjs', { './Credentials.cjs': {
    OWNER: 'mha444s-dotcom', REPO: 'ahlan-app', credential: () => 'test-only',
    request: async route => {
      routes.push(route);
      return route.endsWith('/pages') ? { html_url: url } : { workflow_runs: [
        { id: 99, head_sha: sha, event: 'pull_request', status: 'completed', conclusion: 'failure' },
        { id: 98, head_sha: 'b'.repeat(40), event: 'push', status: 'completed', conclusion: 'failure' },
        { id: 5, head_sha: sha, event: 'push', status: 'completed', conclusion: 'success', html_url: 'https://github.com/mha444s-dotcom/ahlan-app/actions/runs/5' }
      ] };
    }
  } }, { fetch: async requested => {
    if (requested instanceof URL) {
      assert.equal(requested.href, url + 'deployment.json?commit=' + sha);
      return { ok: true, status: 200, json: async () => ({ commit: sha }) };
    }
    assert.equal(requested, url);
    return { ok: true, status: 200 };
  } });
  const result = await loaded.api.waitDeployment(sha, { timeoutMs: 1000, intervalMs: 0 });
  assert.equal(result.sha, sha);
  assert.equal(result.url, url);
  assert.ok(routes[0].includes('head_sha=' + sha));
});

test('A successful Actions run cannot confirm an older deployment or a missing commit marker', async () => {
  for (const marker of [null, { commit: 'b'.repeat(40) }]) {
    const loaded = isolated('Wait-Deployment.cjs', { './Credentials.cjs': {
      OWNER: 'mha444s-dotcom', REPO: 'ahlan-app', credential: () => 'test-only',
      request: async route => route.endsWith('/pages') ? { html_url: 'https://example.test/ahlan-app/' } : { workflow_runs: [
        { id: 1, head_sha: sha, event: 'push', status: 'completed', conclusion: 'success', html_url: 'https://example.test/run' }
      ] }
    } }, { fetch: async requested => requested instanceof URL ? { ok: !!marker, json: async () => marker } : { ok: true } });
    await assert.rejects(loaded.api.waitDeployment(sha, { timeoutMs: 1000, intervalMs: 0 }), /does not yet match/);
    assert.ok(!loaded.messages.some(message => message.startsWith('Published:')));
  }
});

test('Failed Actions and confirmation timeouts never report a published release', async () => {
  for (const mode of ['failure', 'timeout', 'http-failure']) {
    const loaded = isolated('Wait-Deployment.cjs', { './Credentials.cjs': {
      OWNER: 'mha444s-dotcom', REPO: 'ahlan-app', credential: () => 'test-only',
      request: async route => route.endsWith('/pages') ? { html_url: 'https://example.test/' } : { workflow_runs: [
        { id: 1, head_sha: sha, event: 'push', status: 'completed', conclusion: mode === 'failure' ? 'failure' : 'success', html_url: 'https://example.test/run' }
      ] }
    } }, { fetch: async () => ({ ok: false, status: 404 }) });
    await assert.rejects(loaded.api.waitDeployment(sha, { timeoutMs: mode === 'timeout' ? 0 : 1000, intervalMs: 0 }));
    assert.ok(!loaded.messages.some(message => message.startsWith('Published:')));
  }
});

test('Candidate promotion keeps the previous release and rolls back if promotion fails', async () => {
  for (const failPromotion of [false, true]) {
    const renames = [];
    const loaded = isolated('Prepare-Release.cjs', {
      'node:fs': {
        existsSync: () => true,
        lstatSync: () => ({ isSymbolicLink: () => false }),
        renameSync: (from, to) => {
          renames.push({ from, to });
          if (failPromotion && path.basename(from).startsWith('candidate-')) throw Error('Simulated promotion failure.');
        }
      },
      '../production/Build-Release.cjs': { buildRelease: async () => ({ manifest: { files: [], bytes: 0 } }) }
    });
    if (failPromotion) await assert.rejects(loaded.api.prepare(), /Simulated promotion failure/);
    else await loaded.api.prepare();
    assert.equal(path.basename(renames[0].from), 'ahlan');
    assert.ok(path.basename(renames[0].to).startsWith('previous-'));
    assert.ok(path.basename(renames[1].from).startsWith('candidate-'));
    assert.equal(path.basename(renames[1].to), 'ahlan');
    if (failPromotion) {
      assert.equal(renames.length, 3);
      assert.equal(renames[2].from, renames[0].to);
      assert.equal(renames[2].to, renames[0].from);
    }
  }
});

test('Failed builds and release symlinks stop promotion before any rename', async () => {
  for (const symlink of [false, true]) {
    let renamed = false;
    const loaded = isolated('Prepare-Release.cjs', {
      'node:fs': { existsSync: () => true, lstatSync: () => ({ isSymbolicLink: () => symlink }), renameSync: () => { renamed = true; } },
      '../production/Build-Release.cjs': { buildRelease: async () => { if (!symlink) throw Error('Failed build.'); return { manifest: { files: [], bytes: 0 } }; } }
    });
    await assert.rejects(loaded.api.prepare());
    assert.equal(renamed, false);
  }
});
