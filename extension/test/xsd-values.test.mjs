// The extension XSD is generated from the model and from extension/model/synthea.values.json. Besides
// the structure it has to refuse a value that is not one of the fixed choices: a state type or
// condition type that does not exist, a unit that is not a unit of time, an operator or a gender
// that Synthea does not know. These tests run xmllint on small diagrams against BPMN core + the
// extension, the way `npm run xsd:ext` does for the examples.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateXsd, loadValues } from '../../tools/moddle-to-xsd.mjs';
import { wrap, start, end, task, timer, flow, gateway, stateType, cond } from './helpers.mjs';

const descriptorPath = fileURLToPath(new URL('../model/synthea.json', import.meta.url));
const bpmnXsd = fileURLToPath(new URL('../../node_modules/bpmn-moddle/resources/bpmn/xsd/BPMN20.xsd', import.meta.url));
const descriptor = JSON.parse(readFileSync(descriptorPath, 'utf8'));

const hasXmllint = spawnSync('xmllint', ['--version']).status !== null && !spawnSync('xmllint', ['--version']).error;
const dir = mkdtempSync(join(tmpdir(), 'xsd-values-'));
const { xsd } = generateXsd(descriptor, loadValues(descriptorPath));
writeFileSync(join(dir, 'extension.xsd'), xsd);
writeFileSync(
  join(dir, 'driver.xsd'),
  `<?xml version="1.0"?><xsd:schema xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <xsd:import namespace="http://www.omg.org/spec/BPMN/20100524/MODEL" schemaLocation="${bpmnXsd}"/>
  <xsd:import namespace="${descriptor.uri}" schemaLocation="${join(dir, 'extension.xsd')}"/></xsd:schema>`
);

let n = 0;
function validate(xml) {
  const file = join(dir, `case${n++}.bpmn`);
  writeFileSync(file, xml);
  try {
    execFileSync('xmllint', ['--noout', '--schema', join(dir, 'driver.xsd'), file], { stdio: 'pipe' });
    return { ok: true, message: '' };
  } catch (err) {
    return { ok: false, message: `${err.stderr ?? ''}${err.stdout ?? ''}` };
  }
}

const delay = (unit) => `<synthea:delayConfig delayShape="EXACT" delayValue="1" delayUnit="${unit}"/>`;
const timerDiagram = (inner) => wrap(start() + timer('T', 'T', stateType('Delay') + inner) + end() + flow('f1', 'S', 'T') + flow('f2', 'T', 'E'));
const guardFlow = (condition) =>
  wrap(
    start() + gateway('G', 'G', 'f3') + task('B', 'B', stateType('Simple')) + task('C', 'C', stateType('Simple')) + end() +
    flow('f1', 'S', 'G') + flow('f2', 'G', 'B', cond(condition)) + flow('f3', 'G', 'C') + flow('f4', 'B', 'E') + flow('f5', 'C', 'E')
  );

const opts = { skip: !hasXmllint && 'xmllint is not installed' };

test('xsd: a unit that is not a unit of time is refused, the units of the wiki are not', opts, () => {
  const bad = validate(timerDiagram(delay('day')));
  assert.equal(bad.ok, false);
  assert.match(bad.message, /delayUnit/);
  for (const unit of ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds']) {
    assert.equal(validate(timerDiagram(delay(unit))).ok, true, unit);
  }
});

test('xsd: a state type that does not exist is refused', opts, () => {
  const xml = (type) => wrap(start() + task('A', 'A', stateType(type)) + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E'));
  assert.equal(validate(xml('Bogus')).ok, false);
  assert.equal(validate(xml('SetAttribute')).ok, true);
});

test('xsd: operator and gender of a condition', opts, () => {
  assert.equal(validate(guardFlow('<synthea:condition conditionType="Age" operator="=" quantity="5" unit="years"/>')).ok, false);
  assert.equal(validate(guardFlow('<synthea:condition conditionType="Age" operator="&gt;=" quantity="5" unit="years"/>')).ok, true);
  assert.equal(validate(guardFlow('<synthea:condition conditionType="Gender" gender="male"/>')).ok, false);
  assert.equal(validate(guardFlow('<synthea:condition conditionType="Gender" gender="F"/>')).ok, true);
});

test('xsd: the enumerations of the model are no longer free text, and are not elements either', () => {
  assert.match(xsd, /<xsd:simpleType name="sStateType">/);
  assert.doesNotMatch(xsd, /name="tStateType"/);
  assert.doesNotMatch(xsd, /<xsd:element name="stateType" type=/);
});
