// The two lint rules that keep the diagram free of what the converter would have to repair:
// unique-element-names (SYN-34) and exclusive-gateway-requires-default-flow (SYN-35).
// Each case is a small diagram that is run through the real bpmnlint CLI, so the plugin, the
// configuration and the rule are tested together.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../../../', import.meta.url).pathname;

const cond = (v) =>
  `<bpmn2:extensionElements><synthea:conditionConfig><synthea:condition conditionType="Attribute" attribute="t" operator="==" value="${v}"/></synthea:conditionConfig></bpmn2:extensionElements>`;
const prob = (p) =>
  `<bpmn2:extensionElements><synthea:probabilityConfig probability="${p}"/></bpmn2:extensionElements>`;
const flow = (id, from, to, inner = '') =>
  `<bpmn2:sequenceFlow id="${id}" sourceRef="${from}" targetRef="${to}">${inner}</bpmn2:sequenceFlow>`;

function lint(processBody) {
  const dir = mkdtempSync(join(tmpdir(), 'lint-model-rules-'));
  const file = join(dir, 'case.bpmn');
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:synthea="https://forschungsgruppe-digital-health.github.io/schema/synthea/1.0" id="d" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn2:process id="P" isExecutable="false">${processBody}</bpmn2:process>
</bpmn2:definitions>`
  );
  try {
    const r = spawnSync(process.execPath, [join(root, 'node_modules/bpmnlint/bin/bpmnlint.js'), '-c', join(root, '.bpmnlintrc'), file], {
      cwd: root,
      encoding: 'utf8'
    });
    return `${r.stdout}${r.stderr}`;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const start = '<bpmn2:startEvent id="S" name="Initial"/>';
const end = (id, name) => `<bpmn2:endEvent id="${id}" name="${name}"/>`;
const task = (id, name) => `<bpmn2:task id="${id}" name="${name}"/>`;
const NAMES = 'synthea/unique-element-names';
const DEFAULT = 'synthea/exclusive-gateway-requires-default-flow';

test('two elements with the same name are reported', () => {
  const out = lint(start + task('A', 'Same') + task('B', 'Same') + end('E', 'Terminal'));
  assert.match(out, /Name "Same" is already used by A/);
  assert.match(out, new RegExp(NAMES));
});

test('another element called "Initial" collides with the start event', () => {
  const out = lint(start + task('A', 'Initial') + end('E', 'Terminal'));
  assert.match(out, /Name "Initial" is already used by the start event/);
});

test('unique names, unnamed elements and a link pair with one name are fine', () => {
  const link = (id, kind) =>
    `<bpmn2:intermediate${kind}Event id="${id}" name="L"><bpmn2:linkEventDefinition name="L"/></bpmn2:intermediate${kind}Event>`;
  const out = lint(start + task('A', 'One') + task('B', 'Two') + task('C', '') + task('D', '') + link('T', 'Throw') + link('K', 'Catch') + end('E', 'Terminal'));
  assert.doesNotMatch(out, new RegExp(NAMES));
});

test('a gateway with conditions and no default flow is reported', () => {
  const out = lint(
    start + '<bpmn2:exclusiveGateway id="G" name="Type?"/>' + task('A', 'A') + task('B', 'B') + end('E', 'Terminal') +
      flow('f0', 'S', 'G') + flow('f1', 'G', 'A', cond('a')) + flow('f2', 'G', 'B', cond('b')) + flow('f3', 'A', 'E') + flow('f4', 'B', 'E')
  );
  assert.match(out, /has no default flow/);
  assert.match(out, new RegExp(DEFAULT));
});

test('a default flow that also has a condition is reported', () => {
  const out = lint(
    start + '<bpmn2:exclusiveGateway id="G" name="Type?" default="f2"/>' + task('A', 'A') + task('B', 'B') + end('E', 'Terminal') +
      flow('f0', 'S', 'G') + flow('f1', 'G', 'A', cond('a')) + flow('f2', 'G', 'B', cond('b')) + flow('f3', 'A', 'E') + flow('f4', 'B', 'E')
  );
  assert.match(out, /default flow f2 also has a synthea:conditionConfig/);
});

test('one condition plus an unconditioned default flow is fine', () => {
  const out = lint(
    start + '<bpmn2:exclusiveGateway id="G" name="Type?" default="f2"/>' + task('A', 'A') + task('B', 'B') + end('E', 'Terminal') +
      flow('f0', 'S', 'G') + flow('f1', 'G', 'A', cond('a')) + flow('f2', 'G', 'B') + flow('f3', 'A', 'E') + flow('f4', 'B', 'E')
  );
  assert.doesNotMatch(out, new RegExp(DEFAULT));
});

test('a probability gateway needs no default flow', () => {
  const out = lint(
    start + '<bpmn2:exclusiveGateway id="G" name="Chance?"/>' + task('A', 'A') + task('B', 'B') + end('E', 'Terminal') +
      flow('f0', 'S', 'G') + flow('f1', 'G', 'A', prob('0.3')) + flow('f2', 'G', 'B', prob('0.7')) + flow('f3', 'A', 'E') + flow('f4', 'B', 'E')
  );
  assert.doesNotMatch(out, new RegExp(DEFAULT));
});
