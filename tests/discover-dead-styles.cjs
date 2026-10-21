'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {DEAD_CLASSES, pruneDiscoverStyles} = require('../maintenance/discover-dead-styles.cjs');

test('retired selectors are removed while active branches retain their declarations', () => {
  const source = '.quicklink {color:red}.active, .quicklink:hover, .other {color:blue}';
  const result = pruneDiscoverStyles(source);
  assert.equal(result.css, '.active, .other {color:blue}');
  assert.equal(result.removedRules, 1); assert.equal(result.prunedRules, 1);
  assert.deepEqual(result.removedSelectors, ['.quicklink', '.quicklink:hover']);
});
test('nested groups are pruned without treating keyframes or declaration at-rules as selectors', () => {
  const source = '@import url("sample.css");@media(max-width:700px){@supports(display:grid){.quicklink{color:red}.active{content:"} { /*"}}}@keyframes quicklink{from{opacity:0}to{opacity:1}}@font-face{font-family:quicklink;src:url("a.woff2")}';
  assert.equal(pruneDiscoverStyles(source).css, source.replace('.quicklink{color:red}', ''));
});
test('functional pseudo classes, quoted attributes, escaped names and comments do not create false positives', () => {
  const source = ':is(.quicklink,.active){color:red}.active:not(.quicklink){color:blue}.active:has(.quicklink){color:gold}[title=".quicklink,}"]{color:green}.quicklink\\-active{color:pink}/* .quicklink */.active{color:teal}';
  assert.equal(pruneDiscoverStyles(source).css, source);
  assert.equal(pruneDiscoverStyles('.quicklink:is(.active,.other){color:red}').css, '');
});
test('selector commas inside pseudo functions and attributes are not top-level separators', () => {
  const source = '.quicklink, :is(.active,.other), [data-value="a,b"] {content:"quoted \\\" }"}';
  assert.equal(pruneDiscoverStyles(source).css, ' :is(.active,.other), [data-value="a,b"] {content:"quoted \\\" }"}');
});
test('all approved SVG/data URL payloads survive even when their layer is retired', () => {
  const source = '.new-photo{background:url("data:image/svg+xml,%3Csvg%3E,%7B%7D")} .quicklink{color:red}';
  const result = pruneDiscoverStyles(source);
  assert.equal(result.css, '.new-photo{background:url("data:image/svg+xml,%3Csvg%3E,%7B%7D")} ');
  assert.deepEqual(result.preservedAssetRules, ['.new-photo']);
  assert.equal(result.removedRules, 1);
});
test('malformed CSS aborts instead of silently dropping or rewriting input', () => {
  for (const source of ['.quicklink{color:red', '/* missing', '.quicklink:is(.a{color:red}', '.active[title="a]{color:red}']) {
    assert.throws(() => pruneDiscoverStyles(source), /CSS/);
  }
});
test('cleanup is idempotent and never removes dynamically constructed card families or active gate layers', () => {
  const source = '.quicklink{color:red}.tomb-experience{height:300px}.city-story-1{display:grid}.culture-story-crafts{color:blue}.islam-1{height:200px}';
  const first = pruneDiscoverStyles(source), second = pruneDiscoverStyles(first.css);
  assert.equal(second.css, first.css); assert.equal(second.bytesSaved, 0);
  assert.ok(first.css.includes('.tomb-experience')); assert.ok(first.css.includes('.city-story-1'));
});
test('explicit retired class allowlist is absent from deployed template, code and data', () => {
  const directory = path.resolve(__dirname, '../dist/discover-egypt');
  for (const entry of fs.readdirSync(directory)) {
    if (!/\.(?:js|html)$/.test(entry)) continue;
    const source = fs.readFileSync(path.join(directory, entry), 'utf8');
    for (const token of DEAD_CLASSES) assert.ok(!source.includes(token), `${entry}: ${token}`);
  }
});
