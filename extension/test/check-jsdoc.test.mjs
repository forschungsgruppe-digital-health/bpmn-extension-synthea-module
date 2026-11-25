// The JSDoc check (tools/check-jsdoc.mjs) accepts documented code and finds what is missing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSource } from '../../tools/check-jsdoc.mjs';

const documented = `/**
 * What this module is for.
 */

/**
 * Adds two numbers.
 *
 * @param {number} a the first number
 * @param {number} b the second number
 * @returns {number} the sum
 */
export function add(a, b) {
  return a + b;
}
`;

test('documented code passes', () => {
  assert.deepEqual(checkSource(documented), []);
});

test('a shebang before the module block is fine', () => {
  assert.deepEqual(checkSource(`#!/usr/bin/env node\n${documented}`), []);
});

test('a file without a module block is reported', () => {
  const problems = checkSource(documented.replace('/**\n * What this module is for.\n */\n\n', 'import x from "y";\n\n'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /top of the file/);
});

test('an export without a JSDoc block is reported, a line comment does not count', () => {
  const source = '/**\n * Module.\n */\n\n// adds\nexport const add = (a, b) => a + b;\nexport function sub(a, b) { return a - b; }\n';
  const problems = checkSource(source);
  assert.equal(problems.length, 2);
  assert.ok(problems.every((p) => /no JSDoc block/.test(p)));
});

test('a function with fewer @param tags than parameters is reported', () => {
  const problems = checkSource(documented.replace(' * @param {number} b the second number\n', ''));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /1 of 2 parameters/);
});

test('a destructured parameter counts as one', () => {
  const source = '/**\n * Module.\n */\n\n/**\n * Reads options.\n *\n * @param {object} options the options\n */\nexport function read({ a, b } = {}) {}\n';
  assert.deepEqual(checkSource(source), []);
});

test('a block without a description is reported', () => {
  const problems = checkSource('/**\n * Module.\n */\n\n/**\n * @returns {number} one\n */\nexport const one = () => 1;\n');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no description/);
});
