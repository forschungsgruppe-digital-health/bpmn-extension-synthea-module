// Runs the repository's lint configuration (.bpmnlintrc) on a diagram in-process, for the tests of
// the lint rules. Also checks that linting leaves the model alone.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import BpmnModdle from 'bpmn-moddle';
import { descriptor } from '../parse.mjs';

const root = new URL('../../../', import.meta.url).pathname;
const require = createRequire(root);
const Linter = require('bpmnlint/lib/linter');
const NodeResolver = require('bpmnlint/lib/resolver/node-resolver');
const rc = JSON.parse(readFileSync(`${root}.bpmnlintrc`, 'utf8'));

export { rc };
export const linter = new Linter({ resolver: new NodeResolver({ require: createRequire(`${root}package.json`) }) });

/** @returns {Promise<{rule: string, category: string, message: string, id: string}[]>} */
export async function lintReports(xml) {
  const moddle = new BpmnModdle({ synthea: descriptor });
  const { rootElement } = await moddle.fromXML(xml);
  const before = (await moddle.toXML(rootElement)).xml;
  const results = await linter.lint(rootElement, rc);
  const after = (await moddle.toXML(rootElement)).xml;
  assert.equal(after, before, 'linting must not change the model');
  return Object.entries(results).flatMap(([rule, list]) => list.map((r) => ({ rule, category: r.category, message: r.message, id: r.id })));
}
