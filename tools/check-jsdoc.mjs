#!/usr/bin/env node
//
// Checks that the source documents itself: every file of the extension and of the converter starts
// with a JSDoc block that says what the module is for, and every exported symbol has a JSDoc block
// with a description (an exported function also an @param for each of its parameters).
//
//   node tools/check-jsdoc.mjs        # exit 1 and list what is missing
//
// Scope: extension/src/*.js and tools/bpmn2gmf/*.mjs (no tests). There is no TypeScript and no
// ESLint in this repository, so this is a small script rather than a lint rule.
import { readFileSync, globSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const SCOPE = ['extension/src/*.js', 'tools/bpmn2gmf/*.mjs'];

/** Index of the parenthesis that closes the one at `open`, or -1. */
function closingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** The number of parameters in a parameter list (top-level commas; a destructured one counts as one). */
function countParams(list) {
  const inner = list.trim();
  if (!inner) return 0;
  let depth = 0;
  let count = 1;
  for (const ch of inner) {
    if ('{[('.includes(ch)) depth++;
    else if ('}])'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return inner.endsWith(',') ? count - 1 : count;
}

/** The parameter count of the function that a declaration starting at `index` declares, or null if it is no function. */
function paramsOf(text, index) {
  const head = text.slice(index, index + 400);
  const fn = /^export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*[\w$]*\s*\(/.exec(head);
  const arrow = /^export\s+const\s+[\w$]+\s*=\s*(?:async\s*)?\(/.exec(head);
  const match = fn ?? arrow;
  if (!match) return null;
  const open = index + match[0].length - 1;
  const close = closingParen(text, open);
  return close < 0 ? null : countParams(text.slice(open + 1, close));
}

/**
 * Finds what is missing in one file.
 * @param {string} source the text of the file
 * @returns {string[]} one line per problem
 */
export function checkSource(source) {
  const problems = [];
  const lines = source.split('\n');

  // the module block: a JSDoc block before the first line of code (a shebang is skipped)
  let first = 0;
  if (lines[0]?.startsWith('#!')) first = 1;
  let i = first;
  while (i < lines.length && (lines[i].trim() === '' || lines[i].trim().startsWith('//') || lines[i].trim().startsWith('/*') || lines[i].trim().startsWith('*'))) i++;
  if (!lines.slice(first, i).some((l) => l.trim().startsWith('/**'))) problems.push('1: no JSDoc block at the top of the file that says what the module is for');

  // offsets of the lines, to find a declaration in the whole text
  const offsets = [];
  let offset = 0;
  for (const line of lines) { offsets.push(offset); offset += line.length + 1; }

  lines.forEach((line, n) => {
    if (!/^export\s+(default\b|(async\s+)?function\b|const\b|let\b|class\b|\{)/.test(line)) return;
    const label = `${n + 1}: ${line.replace(/\s*[{=(].*$/, '').trim() || line.trim()}`;
    let end = n - 1;
    while (end >= 0 && lines[end].trim() === '') end--;
    if (end < 0 || !lines[end].trim().endsWith('*/')) { problems.push(`${label} has no JSDoc block`); return; }
    let start = end;
    while (start >= 0 && !lines[start].includes('/*')) start--;
    const block = lines.slice(start, end + 1).join('\n');
    if (!block.trimStart().startsWith('/**')) { problems.push(`${label} has a comment that is not a JSDoc block`); return; }
    const description = block.split('\n').map((l) => l.replace(/^\s*(\/\*\*|\*\/|\*)?\s?/, '').trim()).find((l) => l && !l.startsWith('@'));
    if (!description) problems.push(`${label} has no description`);
    const wanted = paramsOf(source, offsets[n]);
    if (wanted) {
      const documented = (block.match(/@param\b/g) ?? []).length;
      if (documented < wanted) problems.push(`${label} documents ${documented} of ${wanted} parameters`);
    }
  });
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let failed = 0;
  for (const file of SCOPE.flatMap((pattern) => globSync(pattern, { cwd: root })).sort()) {
    const problems = checkSource(readFileSync(`${root}${file}`, 'utf8'));
    for (const p of problems) console.error(`${file}:${p}`);
    failed += problems.length;
  }
  if (failed) {
    console.error(`\n${failed} JSDoc problem(s). See tools/check-jsdoc.mjs for what is checked.`);
    process.exit(1);
  }
  console.log('JSDoc check passed');
}
