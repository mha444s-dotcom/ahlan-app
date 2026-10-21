'use strict';

// Explicitly audited, retired Discover layers. These names occur in the approved
// source CSS but are absent from the native template, data, and every constructor
// in the deployed JavaScript. Dynamic islam-*, city-story-*, culture-story-* and
// all active tomb-experience classes are deliberately outside this allowlist.
const DEAD_CLASSES = Object.freeze([
  'header-inner', 'header-tools', 'icon-btn', 'site-location',
  'quicklinks', 'quicklink', 'era-intro', 'epoch-head', 'egypt-grid',
  'new-hero', 'new-copy', 'new-photo', 'culture-panel', 'culture-facts',
  'bottom-nav', 'temple-gallery-heading', 'temple-line', 'ionic-columns',
  'culture-stickers', 'culture-ribbon', 'tomb-scene', 'tomb-loaded',
  'heritage-scene-shell', 'heritage-scene-container',
  'heritage-door-inscription', 'heritage-scene-prompt'
]);

// CSS delimiters inside comments, strings, attribute selectors, or functions do
// not delimit rules/selectors. Fail closed on malformed input rather than emit
// a partially parsed stylesheet. Keyframes and declaration at-rules stay opaque.
function lexicalStep(text, index, state) {
  const character = text[index], next = text[index + 1];
  if (state.comment) {
    if (character === '*' && next === '/') { state.comment = false; return index + 1; }
    return index;
  }
  if (state.quote) {
    if (state.escaped) state.escaped = false;
    else if (character === '\\') state.escaped = true;
    else if (character === state.quote) state.quote = '';
    return index;
  }
  if (character === '/' && next === '*') { state.comment = true; return index + 1; }
  if (character === '"' || character === "'") { state.quote = character; return index; }
  if (character === '\\') return Math.min(index + 1, text.length - 1);
  return -1;
}
function balancedEnd(text, opening, limit) {
  const state = {comment:false, quote:'', escaped:false};
  let depth = 1;
  for (let index = opening + 1; index < limit; index++) {
    const skipped = lexicalStep(text, index, state);
    if (skipped >= 0) { index = skipped; continue; }
    if (text[index] === '{') depth++;
    else if (text[index] === '}' && --depth === 0) return index;
  }
  throw new Error('Unterminated CSS block during safe Discover cleanup.');
}
function splitSelectors(selector) {
  const state = {comment:false, quote:'', escaped:false};
  const pieces = [];
  let start = 0, parentheses = 0, brackets = 0;
  for (let index = 0; index < selector.length; index++) {
    const skipped = lexicalStep(selector, index, state);
    if (skipped >= 0) { index = skipped; continue; }
    const character = selector[index];
    if (character === '(') parentheses++;
    else if (character === ')') parentheses--;
    else if (character === '[') brackets++;
    else if (character === ']') brackets--;
    else if (character === ',' && !parentheses && !brackets) {
      pieces.push(selector.slice(start, index)); start = index + 1;
    }
    if (parentheses < 0 || brackets < 0) throw new Error('Unbalanced CSS selector.');
  }
  if (state.comment || state.quote || parentheses || brackets) throw new Error('Unterminated CSS selector.');
  pieces.push(selector.slice(start));
  return pieces;
}
function requiresDeadClass(selector, dead) {
  const state = {comment:false, quote:'', escaped:false};
  let parentheses = 0, brackets = 0;
  for (let index = 0; index < selector.length; index++) {
    const skipped = lexicalStep(selector, index, state);
    if (skipped >= 0) { index = skipped; continue; }
    const character = selector[index];
    if (character === '(') parentheses++;
    else if (character === ')') parentheses--;
    else if (character === '[') brackets++;
    else if (character === ']') brackets--;
    // A dead class inside :is(), :not(), :has(), or an attribute string does
    // not prove the complete selector dead. Retain it conservatively.
    else if (character === '.' && !parentheses && !brackets) {
      const token = /^[a-zA-Z_][\w-]*/.exec(selector.slice(index + 1));
      if (token && selector[index + token[0].length + 1] !== '\\' && dead.has(token[0])) return true;
    }
  }
  return false;
}

function pruneDiscoverStyles(source, {deadClasses = DEAD_CLASSES} = {}) {
  if (typeof source !== 'string') throw new TypeError('CSS source must be a string.');
  const dead = new Set(deadClasses), removedSelectors = [], preservedAssetRules = [];
  let removedRules = 0, prunedRules = 0;
  function region(start, end) {
    let position = start, result = '';
    while (position < end) {
      const triviaStart = position;
      while (position < end) {
        if (/\s/.test(source[position])) { position++; continue; }
        if (source.startsWith('/*', position)) {
          const closing = source.indexOf('*/', position + 2);
          if (closing < 0 || closing >= end) throw new Error('Unterminated CSS comment.');
          position = closing + 2; continue;
        }
        break;
      }
      result += source.slice(triviaStart, position);
      if (position >= end) break;
      const ruleStart = position;
      const state = {comment:false, quote:'', escaped:false};
      let parentheses = 0, brackets = 0, opening = -1, statement = false;
      for (; position < end; position++) {
        const skipped = lexicalStep(source, position, state);
        if (skipped >= 0) { position = skipped; continue; }
        const character = source[position];
        if (character === '(') parentheses++;
        else if (character === ')') parentheses--;
        else if (character === '[') brackets++;
        else if (character === ']') brackets--;
        else if (!parentheses && !brackets && character === ';') { statement = true; break; }
        else if (!parentheses && !brackets && character === '{') { opening = position; break; }
        if (parentheses < 0 || brackets < 0) throw new Error('Unbalanced CSS rule prelude.');
      }
      if (statement) { result += source.slice(ruleStart, ++position); continue; }
      if (opening < 0) throw new Error('Missing CSS rule block.');
      const closing = balancedEnd(source, opening, end);
      const head = source.slice(ruleStart, opening);
      const atRule = /^@([\w-]+)/.exec(head.trim());
      if (atRule) {
        if (/^(?:media|supports|layer|container|document|scope|starting-style)$/i.test(atRule[1])) {
          result += head + '{' + region(opening + 1, closing) + '}';
        } else result += source.slice(ruleStart, closing + 1);
      } else {
        const selectors = splitSelectors(head);
        const retired = selectors.filter(selector => requiresDeadClass(selector, dead));
        const retained = selectors.filter(selector => !requiresDeadClass(selector, dead));
        if (!retired.length) result += source.slice(ruleStart, closing + 1);
        else if (!retained.length && /\burl\s*\(/i.test(source.slice(opening + 1, closing))) {
          // Preserve approved inline art byte-for-byte, even in an unused rule.
          preservedAssetRules.push(head.trim()); result += source.slice(ruleStart, closing + 1);
        } else {
          removedSelectors.push(...retired.map(selector => selector.trim()));
          if (!retained.length) removedRules++;
          else { prunedRules++; result += retained.join(',') + source.slice(opening, closing + 1); }
        }
      }
      position = closing + 1;
    }
    return result;
  }
  const css = region(0, source.length), inputBytes = Buffer.byteLength(source), outputBytes = Buffer.byteLength(css);
  return {css, removedRules, prunedRules, removedSelectors, preservedAssetRules,
    inputBytes, outputBytes, bytesSaved:inputBytes - outputBytes};
}

module.exports = {DEAD_CLASSES, pruneDiscoverStyles};
