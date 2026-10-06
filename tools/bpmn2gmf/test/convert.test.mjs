import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../convert.mjs';
import {
  wrap, run, start, end, task, gateway, timer, call, flow,
  stateType, setAttr, prob, cond, attrCond
} from './helpers.mjs';

test('linear flow: Initial -> SetAttribute -> Terminal', async () => {
  const { module, diagnostics } = await run(
    start() + task('A', 'Set smoker', setAttr('smoker', 'true')) + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );
  assert.equal(diagnostics.errorCount, 0);
  assert.deepEqual(module.json, {
    name: 'Test Module',
    states: {
      Initial: { type: 'Initial', direct_transition: 'Set smoker' },
      'Set smoker': { type: 'SetAttribute', attribute: 'smoker', value: true, direct_transition: 'Terminal' },
      Terminal: { type: 'Terminal' }
    }
  });
});

test('the start state is always called "Initial", even with another label', async () => {
  const { module } = await run(
    '<bpmn2:startEvent id="S" name="Begin here"/>' + end() + flow('f1', 'S', 'E')
  );
  assert.ok('Initial' in module.json.states);
});

test('SetAttribute values are typed: number, boolean, string', async () => {
  const { module } = await run(
    start() +
      task('A', 'a', setAttr('x', '0.185')) + task('B', 'b', setAttr('y', 'false')) + task('C', 'c', setAttr('z', 'SCLC')) +
      end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'B') + flow('f3', 'B', 'C') + flow('f4', 'C', 'E')
  );
  const s = module.json.states;
  assert.equal(s.a.value, 0.185);
  assert.equal(s.b.value, false);
  assert.equal(s.c.value, 'SCLC');
});

test('Delay: exact and range', async () => {
  const exact = '<synthea:delayConfig delayShape="EXACT" delayValue="3" delayUnit="days"/>';
  const range = '<synthea:delayConfig delayShape="RANGE" delayValue="1" delayValueHigh="9" delayUnit="weeks"/>';
  const { module } = await run(
    start() + timer('D1', 'wait exact', exact) + timer('D2', 'wait range', range) + end() +
    flow('f1', 'S', 'D1') + flow('f2', 'D1', 'D2') + flow('f3', 'D2', 'E')
  );
  assert.deepEqual(module.json.states['wait exact'].exact, { quantity: 3, unit: 'days' });
  assert.deepEqual(module.json.states['wait range'].range, { low: 1, high: 9, unit: 'weeks' });
});

test('Counter keeps attribute, action and amount', async () => {
  const { module } = await run(
    start() +
      task('C', 'count', `${stateType('Counter')}<synthea:counterConfig attribute="n" action="increment" amount="2"/>`) +
      end() + flow('f1', 'S', 'C') + flow('f2', 'C', 'E')
  );
  const s = module.json.states.count;
  assert.equal(s.attribute, 'n');
  assert.equal(s.action, 'increment');
  assert.equal(s.amount, 2);
});

test('distributed_transition: the flow without probability gets the remainder', async () => {
  const { module, diagnostics } = await run(
    start() + gateway('G', 'split') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('x', '2')) + end() +
    flow('f1', 'S', 'G') + flow('f2', 'G', 'A', prob('0.3')) + flow('f3', 'G', 'B') +
    flow('f4', 'A', 'E') + flow('f5', 'B', 'E')
  );
  assert.equal(diagnostics.errorCount, 0);
  assert.deepEqual(module.json.states.split.distributed_transition, [
    { transition: 'a', distribution: 0.3 },
    { transition: 'b', distribution: 0.7 }
  ]);
});

test('distributed_transition with probabilityAttribute', async () => {
  const named = '<synthea:probabilityConfig probabilityAttribute="p" probabilityDefault="0.1"/>';
  const { module } = await run(
    start() + gateway('G', 'split') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('x', '2')) + end() +
    flow('f1', 'S', 'G') + flow('f2', 'G', 'A', named) + flow('f3', 'G', 'B') +
    flow('f4', 'A', 'E') + flow('f5', 'B', 'E')
  );
  assert.deepEqual(module.json.states.split.distributed_transition[0], {
    transition: 'a',
    distribution: { attribute: 'p', default: 0.1 }
  });
});

test('conditional_transition: default flow goes last, negate becomes Not', async () => {
  const { module, diagnostics } = await run(
    start() + gateway('G', 'smoker?', 'fDefault') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('x', '2')) + end() +
    flow('f1', 'S', 'G') +
    flow('fDefault', 'G', 'B') +
    flow('fCond', 'G', 'A', cond(attrCond('smoker', '==', 'true', ' negate="true"'))) +
    flow('f4', 'A', 'E') + flow('f5', 'B', 'E')
  );
  assert.equal(diagnostics.errorCount, 0);
  assert.deepEqual(module.json.states['smoker?'].conditional_transition, [
    {
      condition: {
        condition_type: 'Not',
        condition: { condition_type: 'Attribute', attribute: 'smoker', operator: '==', value: true }
      },
      transition: 'a'
    },
    { transition: 'b' }
  ]);
});

test('conditions: "is not nil" has no value; nested And is recursive', async () => {
  const and =
    '<synthea:condition conditionType="And">' +
    '<synthea:conditions conditionType="Gender" gender="F"/>' +
    '<synthea:conditions conditionType="Age" operator="&gt;=" quantity="40" unit="years"/>' +
    '</synthea:condition>';
  const { module, diagnostics } = await run(
    start() + gateway('G', 'g', 'fd') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('x', '2')) + end() +
    flow('f1', 'S', 'G') +
    flow('fc1', 'G', 'A', cond(attrCond('quit_age', 'is not nil'))) +
    flow('fc2', 'G', 'B', cond(and)) +
    flow('fd', 'G', 'E') +
    flow('f4', 'A', 'E') + flow('f5', 'B', 'E')
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  const [c1, c2] = module.json.states.g.conditional_transition;
  assert.deepEqual(c1.condition, { condition_type: 'Attribute', attribute: 'quit_age', operator: 'is not nil' });
  assert.deepEqual(c2.condition, {
    condition_type: 'And',
    conditions: [
      { condition_type: 'Gender', gender: 'F' },
      { condition_type: 'Age', operator: '>=', quantity: 40, unit: 'years' }
    ]
  });
});

test('Guard emits allow', async () => {
  const guard = `${stateType('Guard')}<synthea:guardConfig><synthea:allow conditionType="Gender" gender="M"/></synthea:guardConfig>`;
  const { module, diagnostics } = await run(
    start() +
      `<bpmn2:exclusiveGateway id="G" name="men only">
         <bpmn2:extensionElements>${guard}</bpmn2:extensionElements></bpmn2:exclusiveGateway>` +
      end() + flow('f1', 'S', 'G') + flow('f2', 'G', 'E')
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.deepEqual(module.json.states['men only'].allow, { condition_type: 'Gender', gender: 'M' });
});

test('a gateway without conditions or probabilities is an error', async () => {
  const { module, codes } = await run(
    start() + gateway('G', 'gender?') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('x', '2')) + end() +
    flow('f1', 'S', 'G') + flow('f2', 'G', 'A') + flow('f3', 'G', 'B') + flow('f4', 'A', 'E') + flow('f5', 'B', 'E')
  );
  assert.ok(codes.includes('TRANSITION_AMBIGUOUS'));
  assert.equal(module.ok, false);
});

test('mixing probabilities and conditions on one element is an error', async () => {
  const { codes } = await run(
    start() + gateway('G', 'g') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('x', '2')) + end() +
    flow('f1', 'S', 'G') + flow('f2', 'G', 'A', prob('0.5')) + flow('f3', 'G', 'B', cond(attrCond('x', '==', '1'))) +
    flow('f4', 'A', 'E') + flow('f5', 'B', 'E')
  );
  assert.ok(codes.includes('TRANSITION_MIXED'));
});

test('boundary events are rejected with a clear error', async () => {
  const { codes, diagnostics } = await run(
    start() + task('A', 'a', setAttr('x', '1')) + end() +
    '<bpmn2:boundaryEvent id="B" attachedToRef="A"><bpmn2:timerEventDefinition/></bpmn2:boundaryEvent>' +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'E') + flow('f3', 'B', 'E')
  );
  assert.ok(codes.includes('BOUNDARY_EVENT_UNSUPPORTED'));
  assert.ok(!codes.includes('FLOW_ENDPOINT_UNKNOWN'), 'flow from the rejected event is not reported twice');
  assert.ok(diagnostics.errorCount >= 1);
});

test('a task without stateType is an error (no guessing)', async () => {
  const { codes } = await run(start() + task('A', 'a') + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E'));
  assert.ok(codes.includes('STATE_TYPE_REQUIRED'));
});

test('a start event cannot be typed as another state', async () => {
  const { codes } = await run(
    `<bpmn2:startEvent id="S" name="x"><bpmn2:extensionElements>${stateType('Delay')}</bpmn2:extensionElements></bpmn2:startEvent>` +
      end() + flow('f1', 'S', 'E')
  );
  assert.ok(codes.includes('STATE_TYPE_MISMATCH'));
});

test('duplicate labels are made unique with the element id', async () => {
  const { module, diagnostics } = await run(
    start() + task('A', 'same', setAttr('x', '1')) + task('B', 'same', setAttr('x', '2')) + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'B') + flow('f3', 'B', 'E')
  );
  assert.deepEqual(Object.keys(module.json.states).sort(), ['Initial', 'Terminal', 'same', 'same_B']);
  assert.ok(diagnostics.items.some((i) => i.code === 'STATE_NAME_DUPLICATE'));
});

test('an empty label falls back to <stateType>_<id>', async () => {
  const { module } = await run(
    start() + task('A', '', setAttr('x', '1')) + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );
  assert.ok('SetAttribute_A' in module.json.states);
});

test('clinical state types are not implemented yet and say so', async () => {
  const { codes } = await run(
    start() + task('A', 'Dx', stateType('ConditionOnset')) + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );
  assert.ok(codes.includes('STATE_TYPE_NOT_IMPLEMENTED'));
});

test('a missing transition target / dead end is reported by verify', async () => {
  const { codes } = await run(start() + task('A', 'a', setAttr('x', '1')) + flow('f1', 'S', 'A'));
  assert.ok(codes.includes('NO_TRANSITION'));
});

// ---- cross-file --------------------------------------------------------------

const sub = (name) => ({
  path: `${name}.bpmn`,
  xml: wrap(start() + end() + flow('f1', 'S', 'E'), name)
});
const main = (target) => ({
  path: 'main-module.bpmn',
  xml: wrap(start() + call('C', 'call it', target) + end() + flow('f1', 'S', 'C') + flow('f2', 'C', 'E'), 'Main')
});

test('CallSubmodule resolves against the files of the run (hyphen -> underscore)', async () => {
  const { modules, diagnostics } = await convert([main('lung_sub'), sub('lung-sub')]);
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.equal(modules.find((m) => m.fileBase === 'main_module').json.states['call it'].submodule, 'lung_sub');
});

test('CallSubmodule to an unknown module is an error', async () => {
  const { diagnostics } = await convert([main('nope')]);
  assert.ok(diagnostics.items.some((i) => i.code === 'SUBMODULE_NOT_FOUND'));
});

test('circular submodule calls are an error', async () => {
  const a = { path: 'a.bpmn', xml: wrap(start() + call('C', 'c', 'b') + end() + flow('f1', 'S', 'C') + flow('f2', 'C', 'E')) };
  const b = { path: 'b.bpmn', xml: wrap(start() + call('C', 'c', 'a') + end() + flow('f1', 'S', 'C') + flow('f2', 'C', 'E')) };
  const { diagnostics } = await convert([a, b]);
  assert.ok(diagnostics.items.some((i) => i.code === 'SUBMODULE_CYCLE'));
});

// ---- real model -----------------------------------------------------------------

import { readFileSync } from 'node:fs';

test('lung-cancer-probabilities-submodule.bpmn converts to the golden file', async () => {
  const path = 'lung-cancer/lung-cancer-probabilities-submodule.bpmn';
  const { modules, diagnostics } = await convert([{ path, xml: readFileSync(path, 'utf8') }]);
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  const golden = JSON.parse(
    readFileSync(new URL('./golden/lung_cancer_probabilities_submodule.json', import.meta.url), 'utf8')
  );
  assert.deepEqual(modules[0].json, golden);
});
