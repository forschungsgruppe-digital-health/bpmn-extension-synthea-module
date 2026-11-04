import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../convert.mjs';
import {
  wrap, run, start, end, task, gateway, timer, call, flow,
  stateType, setAttr, prob, cond, attrCond, coding, SNOMED, LOINC, RXNORM,
  enc, procedure, order, delay, walk
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

// ---- conditions identified by a code (Observation / Active *) -------------------

// One gateway whose only conditional branch carries `conditionXml`.
const withCondition = (conditionXml) =>
  run(
    start() + gateway('G', 'g', 'fd') + task('A', 'a', setAttr('x', '1')) + end() +
    flow('f1', 'S', 'G') + flow('fc', 'G', 'A', cond(conditionXml)) + flow('fd', 'G', 'E') + flow('f3', 'A', 'E')
  );
const HCT = 'codeSystem="http://loinc.org" code="20570-8" codeDisplay="Hematocrit [Volume Fraction] of Blood by calculation"';

test('Observation condition by code becomes codes: [{system, code, display}]', async () => {
  const { module, diagnostics } = await withCondition(
    `<synthea:condition conditionType="Observation" operator="&lt;=" value="28" ${HCT} />`
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.deepEqual(module.json.states.g.conditional_transition[0].condition, {
    condition_type: 'Observation',
    codes: [{ system: 'LOINC', code: '20570-8', display: 'Hematocrit [Volume Fraction] of Blood by calculation' }],
    operator: '<=',
    value: 28
  });
});

test('Observation condition by attribute stays referenced_by_attribute', async () => {
  const { module } = await withCondition(
    '<synthea:condition conditionType="Observation" referencedAttribute="hct_test" operator="is not nil" />'
  );
  assert.deepEqual(module.json.states.g.conditional_transition[0].condition, {
    condition_type: 'Observation',
    referenced_by_attribute: 'hct_test',
    operator: 'is not nil'
  });
});

test('Active Condition by SNOMED code', async () => {
  const { module } = await withCondition(
    '<synthea:condition conditionType="Active Condition" codeSystem="http://snomed.info/sct" code="73211009" codeDisplay="Diabetes mellitus" />'
  );
  assert.deepEqual(module.json.states.g.conditional_transition[0].condition, {
    condition_type: 'Active Condition',
    codes: [{ system: 'SNOMED-CT', code: '73211009', display: 'Diabetes mellitus' }]
  });
});

test('a code and an attribute together, a code without display, an unknown system, or neither are errors', async () => {
  const cases = {
    both: `<synthea:condition conditionType="Observation" referencedAttribute="x" ${HCT} operator="==" value="1" />`,
    noDisplay: '<synthea:condition conditionType="Observation" codeSystem="http://loinc.org" code="1-1" operator="==" value="1" />',
    unknownSystem: '<synthea:condition conditionType="Observation" codeSystem="http://example.org/cs" code="1" codeDisplay="x" operator="==" value="1" />',
    neither: '<synthea:condition conditionType="Active Medication" />'
  };
  for (const [name, xml] of Object.entries(cases)) {
    const { codes } = await withCondition(xml);
    assert.ok(codes.includes('CONDITION_INVALID'), `${name} should be an error`);
  }
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

test('state types that are not supported at all say so', async () => {
  const { codes } = await run(
    start() + task('A', 'sim', stateType('Physiology')) + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
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

test('CallSubmodule resolves against the files of the run (hyphen -> underscore) and names the submodule by path', async () => {
  const { modules, diagnostics } = await convert([main('lung_sub'), sub('lung-sub')]);
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  // Synthea runs every top-level file as a module of its own; only files in a subdirectory are submodules
  assert.deepEqual(modules.map((m) => [m.fileBase, m.path]), [['main_module', 'main_module'], ['lung_sub', 'main_module/lung_sub']]);
  assert.equal(modules.find((m) => m.fileBase === 'main_module').json.states['call it'].submodule, 'main_module/lung_sub');
});

test('layout: nested calls and a shared submodule go below the first module that reaches them; unrelated files stay top-level', async () => {
  const caller = (name, ...targets) => ({
    path: `${name}.bpmn`,
    xml: wrap(
      start() + targets.map((t, i) => call(`C${i}`, `call ${t}`, t)).join('') + end() +
        flow('f0', 'S', targets.length ? 'C0' : 'E') +
        targets.map((t, i) => flow(`g${i}`, `C${i}`, i + 1 < targets.length ? `C${i + 1}` : 'E')).join(''),
      name
    )
  });
  const { modules, diagnostics } = await convert([
    caller('first', 'middle'), caller('second', 'shared'), caller('middle', 'shared'), caller('shared'), caller('alone')
  ]);
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  const paths = Object.fromEntries(modules.map((m) => [m.fileBase, m.path]));
  assert.deepEqual(paths, {
    first: 'first', second: 'second', alone: 'alone',
    middle: 'first/middle',
    shared: 'first/shared' // reached by first (via middle) before second
  });
  const calls = (name) => Object.values(modules.find((m) => m.fileBase === name).json.states).filter((st) => st.type === 'CallSubmodule').map((st) => st.submodule);
  assert.deepEqual(calls('second'), ['first/shared']);
  assert.deepEqual(calls('middle'), ['first/shared']);
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

// ---- clinical states and codes (phase 2) -------------------------------------------

// start -> one clinical task -> end; `inner` is the task's extension content
const clinical = (type, inner, opts) =>
  run(start() + task('A', 'clin', stateType(type) + inner) + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E'), opts);

test('ConditionOnset: the code on the state type becomes codes (system URI -> Synthea name)', async () => {
  const { module, diagnostics } = await clinical('ConditionOnset', coding(SNOMED, '271737000', 'Anemia (disorder)'));
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.deepEqual(module.json.states.clin.codes, [{ system: 'SNOMED-CT', code: '271737000', display: 'Anemia (disorder)' }]);
  assert.ok(!diagnostics.items.some((i) => i.code === 'REQUIRED_FIELD_MISSING'));
});

test('codes on the stateTypeConfig become codes, with the system URI mapped to the Synthea name', async () => {
  const { module, diagnostics } = await run(
    start() +
      task('A', 'clin', '<synthea:stateTypeConfig stateType="Procedure" codeSystem="http://snomed.info/sct" code="399208008" codeDisplay="Plain X-ray of chest (procedure)"/>') +
      end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.deepEqual(module.json.states.clin.codes, [{ system: 'SNOMED-CT', code: '399208008', display: 'Plain X-ray of chest (procedure)' }]);
  assert.ok(!diagnostics.items.some((i) => i.code === 'REQUIRED_FIELD_MISSING'));
});

test('a code system the state type does not accept is left out and reported', async () => {
  const { module, codes } = await run(
    start() +
      task('A', 'clin', '<synthea:stateTypeConfig stateType="Procedure" codeSystem="http://loinc.org" code="1234-5" codeDisplay="x"/>') +
      end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );
  assert.ok(!module.json.states.clin.codes);
  assert.ok(codes.includes('REQUIRED_FIELD_MISSING'));
});

test('a state has one code: a second code field is not part of the extension', async () => {
  const { module } = await clinical('Procedure', coding(SNOMED, '399208008', 'Plain X-ray of chest') + coding(LOINC, '36643-5', 'Chest X-ray'));
  assert.deepEqual(module.json.states.clin.codes.map((c) => c.system), ['SNOMED-CT']);
});

test('a state without a usable code is reported as incomplete, and an error with strict', async () => {
  const loose = await clinical('Procedure', coding(LOINC, '36643-5', 'Chest X-ray'));
  assert.ok(loose.codes.includes('REQUIRED_FIELD_MISSING'));
  assert.equal(loose.diagnostics.errorCount, 0);
  assert.match(loose.module.json.states.clin.remarks[0], /required field\(s\) missing: codes/);

  const strict = await clinical('Procedure', coding(LOINC, '36643-5', 'Chest X-ray'), { strict: true });
  assert.equal(strict.module.ok, false);
});

test('MedicationOrder assigns an attribute, MedicationEnd references it', async () => {
  const { module, diagnostics } = await run(
    start() +
      task('A', 'order', stateType('MedicationOrder') + coding(RXNORM, '1736854', 'Cisplatin 50 MG Injection') +
        '<synthea:assignToAttributeConfig attribute="chemo_order"/>') +
      task('B', 'stop', stateType('MedicationEnd') + '<synthea:referencedByAttributeConfig attribute="chemo_order"/>') +
      end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'B') + flow('f3', 'B', 'E')
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.equal(module.json.states.order.assign_to_attribute, 'chemo_order');
  assert.equal(module.json.states.stop.referenced_by_attribute, 'chemo_order');
});

test('an End state without attribute or code is paired with the one start state upstream', async () => {
  const { module, diagnostics } = await run(
    start() +
      task('A', 'dx', stateType('ConditionOnset') + coding(SNOMED, '1', 'Dx')) +
      task('B', 'end dx', stateType('ConditionEnd')) +
      end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'B') + flow('f3', 'B', 'E')
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.equal(module.json.states['end dx'].condition_onset, 'dx');
});

test('in a chain of start states the nearest one is paired', async () => {
  const { module } = await run(
    start() +
      task('A1', 'dx1', stateType('ConditionOnset') + coding(SNOMED, '1', 'Dx')) +
      task('A2', 'dx2', stateType('ConditionOnset') + coding(SNOMED, '2', 'Dx2')) +
      task('B', 'end dx', stateType('ConditionEnd')) +
      end() + flow('f1', 'S', 'A1') + flow('f2', 'A1', 'A2') + flow('f3', 'A2', 'B') + flow('f4', 'B', 'E')
  );
  assert.equal(module.json.states['end dx'].condition_onset, 'dx2');
});

test('an End state is an error when no or several start states are upstream', async () => {
  const none = await run(
    start() + task('B', 'end dx', stateType('ConditionEnd')) + end() + flow('f1', 'S', 'B') + flow('f2', 'B', 'E')
  );
  assert.ok(none.codes.includes('END_STATE_UNPAIRED'));

  // two start states on parallel branches that merge before the End state
  const two = await run(
    start() + gateway('G', 'g', 'f3') +
      task('A1', 'dx1', stateType('ConditionOnset') + coding(SNOMED, '1', 'Dx')) +
      task('A2', 'dx2', stateType('ConditionOnset') + coding(SNOMED, '2', 'Dx2')) +
      task('B', 'end dx', stateType('ConditionEnd')) +
      end() + flow('f1', 'S', 'G') + flow('f2', 'G', 'A1', prob('0.5')) + flow('f3', 'G', 'A2', prob('0.5')) +
      flow('f4', 'A1', 'B') + flow('f5', 'A2', 'B') + flow('f6', 'B', 'E')
  );
  assert.ok(two.codes.includes('END_STATE_UNPAIRED'));
});

test('a Death end event continues to the module\'s Terminal state, or gets one', async () => {
  const dying = '<bpmn2:endEvent id="D" name="Death">' +
    '<bpmn2:extensionElements>' + stateType('Death') + '</bpmn2:extensionElements></bpmn2:endEvent>';
  const withTerminal = await run(
    start() + gateway('G', 'g', 'f3') + dying + end() +
      flow('f1', 'S', 'G') + flow('f2', 'G', 'D', prob('0.5')) + flow('f3', 'G', 'E', prob('0.5'))
  );
  assert.equal(withTerminal.module.json.states.Death.direct_transition, 'Terminal');

  const alone = await run(start() + dying + flow('f1', 'S', 'D'));
  assert.equal(alone.diagnostics.errorCount, 0, alone.diagnostics.format().join('\n'));
  assert.deepEqual(alone.module.json.states.Death, { type: 'Death', direct_transition: 'Terminal' });
  assert.equal(alone.module.json.states.Terminal.type, 'Terminal');
});

test('Observation, Symptom and DiagnosticReport report the fields the extension cannot carry yet', async () => {
  const obs = await clinical('Observation', coding(LOINC, '72514-3', 'Pain severity'));
  assert.match(obs.module.json.states.clin.remarks[0], /category, unit, one of exact \| range/);
  const sym = await clinical('Symptom', '');
  assert.match(sym.module.json.states.clin.remarks[0], /symptom, one of exact \| range/);
  const rep = await clinical('DiagnosticReport', coding(LOINC, '58410-2', 'CBC panel'));
  assert.match(rep.module.json.states.clin.remarks[0], /observations/);
});

test('ImagingStudy uses the first code as procedure_code', async () => {
  const { module } = await clinical('ImagingStudy', coding(SNOMED, '16335031000119103', 'HRCT of chest'));
  assert.deepEqual(module.json.states.clin.procedure_code, { system: 'SNOMED-CT', code: '16335031000119103', display: 'HRCT of chest' });
});

test('all five real pathway files convert completely, even with --strict', async () => {
  const files = [
    'lung-cancer/synthea-lung-cancer.bpmn',
    'lung-cancer/anemia-submodule.bpmn',
    'lung-cancer/lung-cancer-treatment-submodule.bpmn',
    'lung-cancer/symptom-check-submodule.bpmn',
    'lung-cancer/lung-cancer-probabilities-submodule.bpmn'
  ];
  const { modules, diagnostics } = await convert(files.map((path) => ({ path, xml: readFileSync(path, 'utf8') })), { strict: true });
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.ok(modules.every((m) => m.ok));
  assert.ok(!diagnostics.items.some((i) => i.code === 'REQUIRED_FIELD_MISSING'));

  // nothing carries a remark about missing fields
  const remarked = modules.flatMap((m) => Object.values(m.json.states)).filter((st) => st.remarks);
  assert.equal(remarked.length, 0);

  // the Death states of the main pathway match upstream lung_cancer.json (Stage I-IV)
  const deaths = Object.values(modules.find((m) => m.fileBase === 'synthea_lung_cancer').json.states).filter((st) => st.type === 'Death');
  assert.deepEqual(deaths.map((d) => d.range), [
    { low: 2, high: 6, unit: 'years' }, { low: 16, high: 28, unit: 'months' },
    { low: 9, high: 18, unit: 'months' }, { low: 6, high: 10, unit: 'months' }
  ]);

  // the lab reports carry their contained observations (92 in total: 48 in anemia, 44 in treatment)
  const reports = modules.flatMap((m) => Object.values(m.json.states)).filter((st) => st.type === 'DiagnosticReport');
  assert.equal(reports.length, 9);
  assert.equal(reports.reduce((n, r) => n + r.observations.length, 0), 92);
});

test('--strict does not write a module that is incomplete', async () => {
  const incomplete = { path: 'p.bpmn', xml: wrap(
    start() + task('A', 'x', stateType('Procedure') + coding(LOINC, '1-1', 'wrong system') + enc('E1')) + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'E')) };
  const complete = { path: 'q.bpmn', xml: wrap(start() + end() + flow('f1', 'S', 'E')) };
  const { modules } = await convert([incomplete, complete], { strict: true });
  assert.deepEqual(modules.map((m) => [m.fileBase, m.ok]), [['p', false], ['q', true]]);
});

test('symptom-check-submodule.bpmn converts to the golden file', async () => {
  const path = 'lung-cancer/symptom-check-submodule.bpmn';
  const { modules, diagnostics } = await convert([{ path, xml: readFileSync(path, 'utf8') }], { strict: true });
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  const golden = JSON.parse(readFileSync(new URL('./golden/symptom_check_submodule.json', import.meta.url), 'utf8'));
  assert.deepEqual(modules[0].json, golden);
});

// ---- encounter synthesis (phase 3) -----------------------------------------------------

test('a group of consecutive states gets an Encounter before and an EncounterEnd after', async () => {
  const { module, diagnostics } = await run(
    start() + procedure('A', 'a', 'E1') + procedure('B', 'b', 'E1') + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'B') + flow('f3', 'B', 'E')
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.deepEqual(walk(module.json.states), ['Initial', 'E1', 'a', 'b', 'E1_End', 'Terminal']);
  assert.deepEqual(module.json.states.E1, { type: 'Encounter', encounter_class: 'ambulatory', direct_transition: 'a', remarks: module.json.states.E1.remarks });
  assert.equal(module.json.states.E1_End.type, 'EncounterEnd');
});

test('an untagged state between two tagged ones stays inside the encounter', async () => {
  const { module } = await run(
    start() + procedure('A', 'a', 'E1') + task('X', 'x', setAttr('n', '1')) + procedure('B', 'b', 'E1') + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'X') + flow('f3', 'X', 'B') + flow('f4', 'B', 'E')
  );
  assert.deepEqual(walk(module.json.states), ['Initial', 'E1', 'a', 'x', 'b', 'E1_End', 'Terminal']);
});

test('untagged states after the last tagged one inherit the open encounter until the flow ends', async () => {
  const { module, diagnostics } = await run(
    start() + procedure('A', 'a', 'E1') + order('M', 'meds', null) + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'M') + flow('f3', 'M', 'E')
  );
  assert.deepEqual(walk(module.json.states), ['Initial', 'E1', 'a', 'meds', 'E1_End', 'Terminal']);
  assert.ok(!diagnostics.items.some((i) => i.code === 'STATE_OUTSIDE_ENCOUNTER'));
});

test('neutral states after the last state that needs the encounter stay outside it', async () => {
  // upstream ends the visit right after the last clinical state; a SetAttribute behind it is not part of it
  const { module } = await run(
    start() + procedure('A', 'a', 'E1') + task('X', 'x', setAttr('n', '1')) + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'X') + flow('f3', 'X', 'E')
  );
  assert.deepEqual(walk(module.json.states), ['Initial', 'E1', 'a', 'E1_End', 'x', 'Terminal']);
  // but a neutral state in front of a clinical one still inherits the encounter
  const inside = await run(
    start() + procedure('A', 'a', 'E1') + task('X', 'x', setAttr('n', '1')) + order('M', 'meds', null) + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'X') + flow('f3', 'X', 'M') + flow('f4', 'M', 'E')
  );
  assert.deepEqual(walk(inside.module.json.states), ['Initial', 'E1', 'a', 'x', 'meds', 'E1_End', 'Terminal']);
});

test('a diagnosis without target_encounter after the last clinical state stays inside the encounter that records it', async () => {
  for (const type of ['ConditionOnset', 'AllergyOnset']) {
    const { module } = await run(
      start() + procedure('A', 'a', 'E1') + task('C', 'dx', stateType(type) + coding(SNOMED, '1', 'dx')) + end() +
      flow('f1', 'S', 'A') + flow('f2', 'A', 'C') + flow('f3', 'C', 'E')
    );
    assert.deepEqual(walk(module.json.states), ['Initial', 'E1', 'a', 'dx', 'E1_End', 'Terminal'], type);
  }
});

test('between two states of one encounter a delay stays inside up to a week; after the last one a day ends it', async () => {
  const between = (value, unit) => run(
    start() + procedure('A', 'a', 'E1') + delay('D', 'wait', value, unit) + procedure('B', 'b', 'E1') + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'D') + flow('f3', 'D', 'B') + flow('f4', 'B', 'E')
  );
  // a stay with a daily delay between its tagged states is one encounter (upstream's inpatient stay)
  assert.deepEqual(walk((await between(1, 'days')).module.json.states), ['Initial', 'E1', 'a', 'wait', 'b', 'E1_End', 'Terminal']);
  assert.deepEqual(walk((await between(1, 'hours')).module.json.states), ['Initial', 'E1', 'a', 'wait', 'b', 'E1_End', 'Terminal']);
  // weeks between them are two visits
  assert.deepEqual(walk((await between(2, 'weeks')).module.json.states), ['Initial', 'E1', 'a', 'E1_End', 'wait', 'E1_2', 'b', 'E1_End_2', 'Terminal']);

  // after the last tagged state a day already ends the visit
  const after = await run(
    start() + procedure('A', 'a', 'E1') + delay('D', 'wait', 1, 'days') + order('M', 'meds', null) + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'D') + flow('f3', 'D', 'M') + flow('f4', 'M', 'E')
  );
  assert.deepEqual(walk(after.module.json.states).slice(0, 5), ['Initial', 'E1', 'a', 'E1_End', 'wait']);
});

test('two different encounters in a row: the first ends before the second begins', async () => {
  const { module } = await run(
    start() + procedure('A', 'a', 'E1') + procedure('B', 'b', 'E2') + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'B') + flow('f3', 'B', 'E')
  );
  assert.deepEqual(walk(module.json.states), ['Initial', 'E1', 'a', 'E1_End', 'E2', 'b', 'E2_End', 'Terminal']);
});

test('a wellness encounter is marked wellness and needs no class or code', async () => {
  const { module, diagnostics } = await run(
    start() + task('A', 'a', stateType('Procedure') + coding(SNOMED, '1', 'p') +
      '<synthea:encounterContext requiresEncounterContext="true" encounterId="W" wellness="true"/>') +
      end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );
  assert.equal(module.json.states.W.wellness, true);
  assert.ok(!('encounter_class' in module.json.states.W));
  assert.ok(!diagnostics.items.some((i) => i.code === 'REQUIRED_FIELD_MISSING' && i.element === 'W'));
});

test('a non-wellness encounter takes class and reason from its group and reports the missing code', async () => {
  const { module, codes } = await run(
    start() + procedure('A', 'a', 'E1', 'reason="Suspected Lung Cancer"') + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );
  assert.equal(module.json.states.E1.reason, 'Suspected Lung Cancer');
  assert.match(module.json.states.E1.remarks[0], /codes/);
  assert.ok(codes.includes('REQUIRED_FIELD_MISSING'));
});

test('members that disagree on class, and a missing encounterId, are errors', async () => {
  const split = await run(
    start() + procedure('A', 'a', 'E1') +
      task('B', 'b', stateType('Procedure') + coding(SNOMED, '2', 'p') + '<synthea:encounterContext requiresEncounterContext="true" encounterId="E1" encounterClass="inpatient"/>') +
      end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'B') + flow('f3', 'B', 'E')
  );
  assert.ok(split.codes.includes('ENCOUNTER_INCONSISTENT'));

  const noId = await run(
    start() + task('A', 'a', stateType('Procedure') + coding(SNOMED, '1', 'p') + '<synthea:encounterContext requiresEncounterContext="true"/>') +
      end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );
  assert.ok(noId.codes.includes('ENCOUNTER_ID_MISSING'));
});

test('a gateway in front of a group is entered inside the encounter: one Encounter state for all branches', async () => {
  const { module, diagnostics } = await run(
    start() + gateway('G', 'g', 'f3') + procedure('A', 'a', 'E1') + procedure('B', 'b', 'E1') + end() +
      flow('f1', 'S', 'G') + flow('f2', 'G', 'A', prob('0.5')) + flow('f3', 'G', 'B', prob('0.5')) +
      flow('f4', 'A', 'E') + flow('f5', 'B', 'E')
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  const states = Object.entries(module.json.states);
  assert.equal(states.filter(([, v]) => v.type === 'Encounter').length, 1);
  assert.equal(states.filter(([, v]) => v.type === 'EncounterEnd').length, 1);
  assert.deepEqual(module.json.states.Initial.direct_transition, 'E1');
  assert.deepEqual(module.json.states.E1.direct_transition, 'g');
  assert.deepEqual(module.json.states.a.direct_transition, 'E1_End');
  assert.deepEqual(module.json.states.b.direct_transition, 'E1_End');
});

// A delay between the gateway and one branch keeps the encounter from being opened
// in front of the gateway: it would then include the wait.
const splitByDelay = (extra = '') =>
  start() + gateway('G', 'g', 'f3') + delay('D', 'wait', 1, 'hours') + procedure('A', 'a', 'E1') + procedure('B', 'b', 'E1') + end() +
    extra + flow('f1', 'S', 'G') + flow('f2', 'G', 'D', prob('0.5')) + flow('f3', 'G', 'B', prob('0.5')) + flow('f6', 'D', 'A') +
    flow('f4', 'A', 'E') + flow('f5', 'B', 'E');

test('branches that cannot share an Encounter get one per entered state and still share the EncounterEnd', async () => {
  const { module, diagnostics } = await run(splitByDelay());
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  const states = Object.entries(module.json.states);
  assert.equal(states.filter(([, v]) => v.type === 'Encounter').length, 2);
  assert.equal(states.filter(([, v]) => v.type === 'EncounterEnd').length, 1);
  assert.equal(module.json.states[module.json.states.wait.direct_transition].type, 'Encounter', 'the wait runs before the encounter');
});

test('target_encounter names the Encounter state of the group, when there is exactly one', async () => {
  const dx = (target) => task('X', 'dx', stateType('ConditionOnset') + coding(SNOMED, '1', 'Dx') + `<synthea:encounterReference targetEncounter="${target}"/>`);
  const ok = await run(
    start() + dx('E1') + procedure('A', 'a', 'E1') + end() + flow('f1', 'S', 'X') + flow('f2', 'X', 'A') + flow('f3', 'A', 'E')
  );
  assert.equal(ok.module.json.states.dx.target_encounter, 'E1');

  const unknown = await run(start() + dx('nope') + end() + flow('f1', 'S', 'X') + flow('f2', 'X', 'E'));
  assert.ok(unknown.codes.includes('TARGET_ENCOUNTER_UNKNOWN'));

  // with a gateway in front, the group has one Encounter state and the reference works ...
  const shared = await run(
    start() + gateway('G', 'g', 'f3') + dx('E1') + procedure('A', 'a', 'E1') + procedure('B', 'b', 'E1') + end() +
      flow('f0', 'S', 'X') + flow('f1', 'X', 'G') + flow('f2', 'G', 'A', prob('0.5')) + flow('f3', 'G', 'B', prob('0.5')) +
      flow('f4', 'A', 'E') + flow('f5', 'B', 'E')
  );
  assert.equal(shared.module.json.states.dx.target_encounter, 'E1');

  // ... but not when the group is entered at two places that cannot share one
  const twice = await run(
    start() + dx('E1') + gateway('G', 'g', 'f3') + delay('D', 'wait', 1, 'hours') + procedure('A', 'a', 'E1') + procedure('B', 'b', 'E1') + end() +
      flow('f0', 'S', 'X') + flow('f1', 'X', 'G') + flow('f2', 'G', 'D', prob('0.5')) + flow('f3', 'G', 'B', prob('0.5')) + flow('f6', 'D', 'A') +
      flow('f4', 'A', 'E') + flow('f5', 'B', 'E')
  );
  assert.ok(twice.codes.includes('TARGET_ENCOUNTER_AMBIGUOUS'));
});

test('a state that needs an encounter but lies in none is reported', async () => {
  const { codes } = await run(
    start() + order('M', 'meds', null) + end() + flow('f1', 'S', 'M') + flow('f2', 'M', 'E')
  );
  assert.ok(codes.includes('STATE_OUTSIDE_ENCOUNTER'));
});

// ---- fields added in phase 4 --------------------------------------------------------------

const noRemark = (state) => assert.ok(!state.remarks, `unexpected remark: ${state.remarks}`);

test('Symptom: name from symptomConfig, severity from valueConfig (range or exact)', async () => {
  const range = await clinical('Symptom', '<synthea:symptomConfig symptom="Cough"/><synthea:valueConfig valueShape="RANGE" value="50" valueHigh="100"/>');
  assert.equal(range.diagnostics.errorCount, 0, range.diagnostics.format().join('\n'));
  assert.deepEqual(range.module.json.states.clin, { type: 'Symptom', symptom: 'Cough', range: { low: 50, high: 100 }, direct_transition: 'Terminal' });
  noRemark(range.module.json.states.clin);

  const exact = await clinical('Symptom', '<synthea:symptomConfig symptom="Cough"/><synthea:valueConfig valueShape="EXACT" value="27"/>');
  assert.deepEqual(exact.module.json.states.clin.exact, { quantity: 27 });
});

test('Observation: category, unit and value; decimals only for a range', async () => {
  const { module, diagnostics } = await clinical(
    'Observation',
    coding(LOINC, '72514-3', 'Pain severity') + '<synthea:observationConfig category="vital-signs"/>' +
      '<synthea:valueConfig valueShape="RANGE" value="4" valueHigh="8" unit="{score}" decimals="0"/>'
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  const s = module.json.states.clin;
  assert.equal(s.category, 'vital-signs');
  assert.equal(s.unit, '{score}');
  assert.deepEqual(s.range, { low: 4, high: 8, decimals: 0 });
  assert.deepEqual(s.codes[0].code, '72514-3');
  noRemark(s);
});

test('a valueConfig that does not add up is an error', async () => {
  const cases = {
    rangeWithoutHigh: '<synthea:valueConfig valueShape="RANGE" value="4"/>',
    highBelowLow: '<synthea:valueConfig valueShape="RANGE" value="9" valueHigh="4"/>',
    exactWithHigh: '<synthea:valueConfig valueShape="EXACT" value="4" valueHigh="8"/>',
    notANumber: '<synthea:valueConfig valueShape="EXACT" value="abc"/>'
  };
  for (const [name, xml] of Object.entries(cases)) {
    const { codes } = await clinical('Observation', coding(LOINC, '1-1', 'x') + xml);
    assert.ok(codes.includes('VALUE_CONFIG_INVALID'), `${name} should be an error`);
  }
});

// A clinical state inside encounter E1 (Procedure, MedicationOrder and CarePlanStart need one).
const inEncounter = (type, inner) =>
  run(start() + task('A', 'clin', stateType(type) + inner + enc('E1')) + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E'));

test('Procedure: duration comes from valueConfig as {low, high, unit}; an exact value is low = high', async () => {
  const range = await inEncounter('Procedure', coding(SNOMED, '1-1', 'p') + '<synthea:valueConfig valueShape="RANGE" value="0.5" valueHigh="4" unit="hours"/>');
  assert.equal(range.diagnostics.errorCount, 0, range.diagnostics.format().join('\n'));
  assert.deepEqual(range.module.json.states.clin.duration, { low: 0.5, high: 4, unit: 'hours' });

  const exact = await inEncounter('Procedure', coding(SNOMED, '1-1', 'p') + '<synthea:valueConfig valueShape="EXACT" value="30" unit="minutes"/>');
  assert.deepEqual(exact.module.json.states.clin.duration, { low: 30, high: 30, unit: 'minutes' });

  const none = await inEncounter('Procedure', coding(SNOMED, '1-1', 'p'));
  assert.ok(!('duration' in none.module.json.states.clin), 'duration is optional');

  const noUnit = await inEncounter('Procedure', coding(SNOMED, '1-1', 'p') + '<synthea:valueConfig valueShape="EXACT" value="30"/>');
  assert.ok(noUnit.codes.includes('VALUE_CONFIG_INVALID'), 'a duration needs a unit');
});

test('MedicationOrder: medicationConfig administration becomes administration: true', async () => {
  const given = await inEncounter('MedicationOrder', coding(RXNORM, '1-1', 'm') + '<synthea:medicationConfig administration="true"/>');
  assert.equal(given.diagnostics.errorCount, 0, given.diagnostics.format().join('\n'));
  assert.equal(given.module.json.states.clin.administration, true);

  for (const inner of ['', '<synthea:medicationConfig administration="false"/>']) {
    const prescribed = await inEncounter('MedicationOrder', coding(RXNORM, '1-1', 'm') + inner);
    assert.ok(!('administration' in prescribed.module.json.states.clin), 'a prescription has no administration field');
  }
});

test('CarePlanStart: carePlanActivity entries become SNOMED activities; an incomplete one is an error', async () => {
  const activity = (code, display) => `<synthea:carePlanActivity code="${code}" codeDisplay="${display}"/>`;
  const { module, diagnostics } = await inEncounter(
    'CarePlanStart',
    coding(SNOMED, '182964004', 'Terminal care') + activity('133918004', 'Comfort measures') + activity('243072006', 'Cancer education')
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.deepEqual(module.json.states.clin.activities, [
    { system: 'SNOMED-CT', code: '133918004', display: 'Comfort measures' },
    { system: 'SNOMED-CT', code: '243072006', display: 'Cancer education' }
  ]);

  const none = await inEncounter('CarePlanStart', coding(SNOMED, '182964004', 'Terminal care'));
  assert.ok(!('activities' in none.module.json.states.clin));

  const incomplete = await inEncounter('CarePlanStart', coding(SNOMED, '182964004', 'Terminal care') + '<synthea:carePlanActivity code="1"/>');
  assert.ok(incomplete.codes.includes('ACTIVITY_INCOMPLETE'));
});

test('Death with a time span schedules the death and the module goes on', async () => {
  const dying = '<bpmn2:intermediateThrowEvent id="D" name="Stage I">' +
    '<bpmn2:extensionElements>' + stateType('Death') +
    '<synthea:valueConfig valueShape="RANGE" value="2" valueHigh="6" unit="years"/>' +
    '</bpmn2:extensionElements></bpmn2:intermediateThrowEvent>';
  const { module, diagnostics } = await run(
    start() + dying + task('A', 'next', setAttr('x', '1')) + end() +
    flow('f1', 'S', 'D') + flow('f2', 'D', 'A') + flow('f3', 'A', 'E')
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.deepEqual(module.json.states['Stage I'], { type: 'Death', range: { low: 2, high: 6, unit: 'years' }, direct_transition: 'next' });

  const noUnit = await run(
    start() + dying.replace(' unit="years"', '') + end() + flow('f1', 'S', 'D') + flow('f2', 'D', 'E')
  );
  assert.ok(noUnit.codes.includes('VALUE_CONFIG_INVALID'));
});

test('ImagingStudy: the series comes from imagingStudySeries; an incomplete one is an error', async () => {
  const full =
    '<synthea:imagingStudySeries bodySiteCode="51185008" bodySiteDisplay="Thoracic structure (body structure)" ' +
    'modalityCode="CT" modalityDisplay="Computed Tomography" instanceTitle="CT Image Storage" ' +
    'sopClassCode="1.2.840.10008.5.1.4.1.1.2" sopClassDisplay="CT Image Storage" minInstances="300" maxInstances="500"/>';
  const ok = await clinical('ImagingStudy', coding(SNOMED, '16335031000119103', 'HRCT of chest') + full);
  assert.equal(ok.diagnostics.errorCount, 0, ok.diagnostics.format().join('\n'));
  assert.deepEqual(ok.module.json.states.clin.series, [{
    body_site: { system: 'SNOMED-CT', code: '51185008', display: 'Thoracic structure (body structure)' },
    modality: { system: 'DICOM-DCM', code: 'CT', display: 'Computed Tomography' },
    min_number_instances: 300,
    max_number_instances: 500,
    instances: [{ title: 'CT Image Storage', sop_class: { system: 'DICOM-SOP', code: '1.2.840.10008.5.1.4.1.1.2', display: 'CT Image Storage' } }]
  }]);
  noRemark(ok.module.json.states.clin);

  const partial = await clinical('ImagingStudy', coding(SNOMED, '1', 'x') + '<synthea:imagingStudySeries bodySiteCode="1"/>');
  assert.ok(partial.codes.includes('SERIES_INCOMPLETE'));
});

test('an encounter code comes from the group and completes the Encounter state', async () => {
  const code = 'encounterCodeSystem="http://snomed.info/sct" encounterCode="185347001" encounterCodeDisplay="Encounter for problem (procedure)"';
  const { module, diagnostics } = await run(
    start() + procedure('A', 'a', 'E1', code) + procedure('B', 'b', 'E1', code) + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'B') + flow('f3', 'B', 'E')
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.deepEqual(module.json.states.E1.codes, [{ system: 'SNOMED-CT', code: '185347001', display: 'Encounter for problem (procedure)' }]);
  assert.ok(!diagnostics.items.some((i) => i.code === 'REQUIRED_FIELD_MISSING'));
});

test('encounter codes must be complete, known and the same on every member', async () => {
  const half = await run(
    start() + procedure('A', 'a', 'E1', 'encounterCode="1"') + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );
  assert.ok(half.codes.includes('ENCOUNTER_CODE_INCOMPLETE'));

  const unknown = await run(
    start() + procedure('A', 'a', 'E1', 'encounterCodeSystem="http://example.org/x" encounterCode="1" encounterCodeDisplay="x"') +
      end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );
  assert.ok(unknown.codes.includes('ENCOUNTER_CODE_SYSTEM_UNKNOWN'));

  const mixed = (c) => `encounterCodeSystem="http://snomed.info/sct" encounterCode="${c}" encounterCodeDisplay="x"`;
  const differ = await run(
    start() + procedure('A', 'a', 'E1', mixed('1')) + procedure('B', 'b', 'E1', mixed('2')) + end() +
      flow('f1', 'S', 'A') + flow('f2', 'A', 'B') + flow('f3', 'B', 'E')
  );
  assert.ok(differ.codes.includes('ENCOUNTER_INCONSISTENT'));
});

// ---- DiagnosticReport with contained observations ----------------------------------------

const reportObs = (extra) =>
  `<synthea:reportObservation code="718-7" codeDisplay="Hemoglobin [Mass/volume] in Blood" category="laboratory" unit="g/dL" ${extra}/>`;

test('DiagnosticReport: contained observations as range, coded value and vital sign', async () => {
  const { module, diagnostics } = await clinical(
    'DiagnosticReport',
    coding(LOINC, '58410-2', 'CBC panel') +
      reportObs('valueShape="RANGE" value="10" valueHigh="11.9"') +
      '<synthea:reportObservation code="5767-9" codeDisplay="Appearance of Urine" category="laboratory" unit="{nominal}" valueCodeSystem="http://snomed.info/sct" valueCode="7766007" valueCodeDisplay="Cloudy urine (finding)"/>' +
      '<synthea:reportObservation code="2339-0" codeDisplay="Glucose [Mass/volume] in Blood" category="laboratory" unit="mg/dL" vitalSign="Glucose"/>'
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  const s = module.json.states.clin;
  assert.equal(s.observations.length, 3);
  assert.deepEqual(s.observations[0], {
    category: 'laboratory', codes: [{ system: 'LOINC', code: '718-7', display: 'Hemoglobin [Mass/volume] in Blood' }],
    unit: 'g/dL', range: { low: 10, high: 11.9 }
  });
  assert.deepEqual(s.observations[1].value_code, { system: 'SNOMED-CT', code: '7766007', display: 'Cloudy urine (finding)' });
  assert.equal(s.observations[2].vital_sign, 'Glucose');
  noRemark(s);
});

test('MultiObservation: category, code and the contained observations (States wiki)', async () => {
  const { module, diagnostics } = await clinical(
    'MultiObservation',
    coding(LOINC, '85354-9', 'Blood pressure panel') + '<synthea:observationConfig category="vital-signs"/>' +
      '<synthea:reportObservation code="8480-6" codeDisplay="Systolic Blood Pressure" category="vital-signs" unit="mm[Hg]" valueShape="RANGE" value="110" valueHigh="140"/>' +
      '<synthea:reportObservation code="8462-4" codeDisplay="Diastolic Blood Pressure" category="vital-signs" unit="mm[Hg]" valueShape="RANGE" value="70" valueHigh="90"/>'
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  const s = module.json.states.clin;
  assert.equal(s.category, 'vital-signs');
  assert.equal(s.codes[0].code, '85354-9');
  assert.equal(s.observations.length, 2);
  const bare = await clinical('MultiObservation', coding(LOINC, '85354-9', 'Blood pressure panel'));
  assert.ok(bare.codes.includes('REQUIRED_FIELD_MISSING'));
});

test('a contained observation needs code, category, unit and exactly one kind of value', async () => {
  const cases = {
    noUnit: '<synthea:reportObservation code="1" codeDisplay="x" category="laboratory" value="1"/>',
    noValue: '<synthea:reportObservation code="1" codeDisplay="x" category="laboratory" unit="u"/>',
    twoValues: reportObs('value="1" vitalSign="Glucose"'),
    rangeWithoutHigh: reportObs('valueShape="RANGE" value="1"'),
    badCodedSystem: reportObs('valueCodeSystem="http://example.org" valueCode="1" valueCodeDisplay="x"')
  };
  for (const [name, xml] of Object.entries(cases)) {
    const { codes } = await clinical('DiagnosticReport', coding(LOINC, '58410-2', 'CBC panel') + xml);
    assert.ok(codes.includes('REPORT_OBSERVATION_INCOMPLETE') || codes.includes('REPORT_OBSERVATION_VALUE'), `${name} should be an error`);
  }
});

// ---- gateway fusion (phase 5) ---------------------------------------------------------------

const fused = (body) => run(body, { fuse: true });

test('--fuse-gateways: a branching gateway moves onto its single predecessor', async () => {
  const body =
    start() + task('A', 'a', setAttr('x', '1')) + gateway('G', 'g?', 'fd') + task('B', 'b', setAttr('x', '2')) + task('C', 'c', setAttr('x', '3')) + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'G') + flow('fc', 'G', 'B', cond(attrCond('x', '==', '1'))) + flow('fd', 'G', 'C') +
    flow('f5', 'B', 'E') + flow('f6', 'C', 'E');
  const plain = await run(body);
  assert.ok('g?' in plain.module.json.states);

  const { module, diagnostics } = await fused(body);
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.ok(!('g?' in module.json.states));
  assert.deepEqual(module.json.states.a.conditional_transition, [
    { condition: { condition_type: 'Attribute', attribute: 'x', operator: '==', value: 1 }, transition: 'b' },
    { transition: 'c' }
  ]);
  assert.ok(!('direct_transition' in module.json.states.a));
});

test('--fuse-gateways: a join (pass-through gateway) is removed and its predecessors continue to its target', async () => {
  const { module } = await fused(
    start() + gateway('G', 'split', 'f4') + task('B', 'b', setAttr('x', '2')) + task('C', 'c', setAttr('x', '3')) +
      gateway('J', 'join') + task('X', 'x', setAttr('y', '1')) + end() +
      flow('f1', 'S', 'G') + flow('f3', 'G', 'B', prob('0.5')) + flow('f4', 'G', 'C', prob('0.5')) +
      flow('f5', 'B', 'J') + flow('f6', 'C', 'J') + flow('f7', 'J', 'X') + flow('f8', 'X', 'E')
  );
  const s = module.json.states;
  assert.ok(!('join' in s));
  assert.equal(s.b.direct_transition, 'x');
  assert.equal(s.c.direct_transition, 'x');
});

test('--fuse-gateways: a gateway with several predecessors, one a PriorState refers to, or drawn as a Simple task stays', async () => {
  // two predecessors
  const two = await fused(
    start() + gateway('G0', 'g0', 'fx') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('x', '2')) + gateway('G', 'g?', 'fd') +
      task('C', 'c', setAttr('x', '3')) + task('D', 'd', setAttr('x', '4')) + end() +
      flow('f1', 'S', 'G0') + flow('fa', 'G0', 'A', prob('0.5')) + flow('fx', 'G0', 'B', prob('0.5')) +
      flow('f2', 'A', 'G') + flow('f3', 'B', 'G') + flow('fc', 'G', 'C', cond(attrCond('x', '==', '1'))) + flow('fd', 'G', 'D') +
      flow('f6', 'C', 'E') + flow('f7', 'D', 'E')
  );
  assert.ok('g?' in two.module.json.states, 'g? has two predecessors');

  // a PriorState condition names the gateway
  const prior = await fused(
    start() + task('A', 'a', setAttr('x', '1')) + gateway('G', 'g?', 'fd') + task('B', 'b', setAttr('x', '2')) + gateway('H', 'h?', 'fh') +
      task('C', 'c', setAttr('x', '3')) + task('D', 'd', setAttr('x', '4')) + end() +
      flow('f1', 'S', 'A') + flow('f2', 'A', 'G') +
      flow('fc', 'G', 'B', cond(attrCond('x', '==', '1'))) + flow('fd', 'G', 'H') +
      flow('f3', 'B', 'E') +
      flow('fh1', 'H', 'C', cond('<synthea:condition conditionType="PriorState" priorStateName="g?"/>')) + flow('fh', 'H', 'D') +
      flow('f6', 'C', 'E') + flow('f7', 'D', 'E')
  );
  assert.ok('g?' in prior.module.json.states, 'g? is named by a PriorState condition');

  // a Simple state the modeler drew is theirs
  const drawn = await fused(
    start() + task('A', 'named step', stateType('Simple')) + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );
  assert.ok('named step' in drawn.module.json.states);
});

test('--fuse-gateways keeps every non-gateway state and what each one leads to', async () => {
  const files = [
    'lung-cancer/synthea-lung-cancer.bpmn', 'lung-cancer/anemia-submodule.bpmn', 'lung-cancer/lung-cancer-treatment-submodule.bpmn',
    'lung-cancer/symptom-check-submodule.bpmn', 'lung-cancer/lung-cancer-probabilities-submodule.bpmn'
  ];
  const inputs = files.map((path) => ({ path, xml: readFileSync(path, 'utf8') }));
  const a = await convert(inputs, { strict: true });
  const b = await convert(inputs, { strict: true, fuse: true });
  assert.equal(b.diagnostics.errorCount, 0, b.diagnostics.format().join('\n'));

  const targets = (s) => [s.direct_transition, ...(s.distributed_transition ?? []).map((t) => t.transition), ...(s.conditional_transition ?? []).map((t) => t.transition), ...(s.complex_transition ?? []).flatMap((t) => (t.distributions ?? [t]).map((d) => d.transition))].filter(Boolean);
  const body = (s) => { const { direct_transition, distributed_transition, conditional_transition, complex_transition, ...rest } = s; return rest; };

  for (const [i, before] of a.modules.entries()) {
    const after = b.modules[i].json.states;
    const original = before.json.states;
    const gateways = new Set(Object.keys(original).filter((n) => !(n in after)));
    // everything that was not removed is still there, unchanged apart from its transition
    for (const [name, state] of Object.entries(after)) assert.deepEqual(body(state), body(original[name]), `${before.fileBase}: ${name}`);
    // the states a state can lead to, looking through removed gateways, are the same
    const through = (name, seen = new Set()) => targets(original[name]).flatMap((t) => {
      if (!gateways.has(t)) return [t];
      if (seen.has(t)) return [];
      seen.add(t);
      return through(t, seen);
    });
    for (const name of Object.keys(after)) {
      assert.deepEqual([...new Set(targets(after[name]))].sort(), [...new Set(through(name))].sort(), `${before.fileBase}: ${name}`);
    }
  }
});

test('--fuse-gateways: conditional branches into probability gateways become one complex_transition', async () => {
  const body =
    start() + task('A', 'a', setAttr('x', '1')) + gateway('G', 'g?', 'fd') + gateway('P1', 'p1') + task('B', 'b', setAttr('x', '2')) +
    task('C', 'c', setAttr('x', '3')) + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'G') + flow('fc', 'G', 'P1', cond(attrCond('x', '==', '1'))) + flow('fd', 'G', 'C') +
    flow('p1b', 'P1', 'B', prob(0.28)) + flow('p1c', 'P1', 'C') +
    flow('f5', 'B', 'E') + flow('f6', 'C', 'E');
  const plain = await run(body);
  assert.ok('p1' in plain.module.json.states);

  const { module, diagnostics } = await fused(body);
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.ok(!('p1' in module.json.states) && !('g?' in module.json.states));
  assert.deepEqual(module.json.states.a.complex_transition, [
    {
      condition: { condition_type: 'Attribute', attribute: 'x', operator: '==', value: 1 },
      distributions: [{ transition: 'b', distribution: 0.28 }, { transition: 'c', distribution: 0.72 }]
    },
    { transition: 'c' }
  ]);
  assert.ok(!('conditional_transition' in module.json.states.a));
});

test('--fuse-gateways: a probability gateway with a second predecessor stays a state of its own', async () => {
  const { module } = await fused(
    start() + task('A', 'a', setAttr('x', '1')) + gateway('G', 'g?', 'fd') + gateway('P1', 'p1') + task('B', 'b', setAttr('x', '2')) +
      task('C', 'c', setAttr('x', '3')) + end() +
      flow('f1', 'S', 'A') + flow('f2', 'A', 'G') + flow('fc', 'G', 'P1', cond(attrCond('x', '==', '1'))) + flow('fd', 'G', 'B') +
      flow('f3', 'B', 'P1') + flow('p1b', 'P1', 'C', prob(0.5)) + flow('p1e', 'P1', 'E') + flow('f6', 'C', 'E')
  );
  assert.ok('p1' in module.json.states);
  assert.ok(!('complex_transition' in module.json.states.a));
});

// ---- sub-process as one state ------------------------------------------------------------

// start -> sub-process (with `inner` flow elements inside) -> end
const subProcess = (type, ext, inner = '') =>
  run(
    start() +
      `<bpmn2:subProcess id="A" name="clin"><bpmn2:extensionElements>${type ? stateType(type) : ''}${ext}</bpmn2:extensionElements>${inner}</bpmn2:subProcess>` +
      end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );

test('a sub-process that stands for a module becomes a CallSubmodule state (how drafts and the mihub models use it)', async () => {
  const { module, diagnostics } = await subProcess('CallSubmodule', '<synthea:submoduleConfig submodule="anemia_submodule"/>');
  assert.ok(!diagnostics.items.some((i) => i.code === 'STATE_TYPE_MISMATCH' || i.code === 'SUBMODULE_MISSING'), diagnostics.format().join('\n'));
  assert.equal(module.json.states.clin.type, 'CallSubmodule');
  assert.equal(module.json.states.clin.submodule, 'anemia_submodule');
});

test('a sub-process is a CallSubmodule by itself; another state type is a mismatch', async () => {
  const none = await subProcess(null, '<synthea:submoduleConfig submodule="anemia_submodule"/>');
  assert.equal(none.module.json.states.clin.type, 'CallSubmodule');
  const empty = await subProcess(null, '');
  assert.ok(empty.codes.includes('SUBMODULE_MISSING'));
  const wrong = await subProcess('Procedure', coding(SNOMED, '399208008', 'Plain X-ray of chest (procedure)'));
  const report = await subProcess('DiagnosticReport', coding(LOINC, '58410-2', 'CBC panel'));
  assert.ok(report.codes.includes('STATE_TYPE_MISMATCH'));
  assert.ok(wrong.codes.includes('STATE_TYPE_MISMATCH'));
  assert.match(wrong.diagnostics.format().join('\n'), /allowed: CallSubmodule/);
});

test('an event sub-process is not accepted', async () => {
  const { codes } = await run(
    start() + '<bpmn2:subProcess id="A" name="ev" triggeredByEvent="true"><bpmn2:extensionElements><synthea:stateTypeConfig stateType="DiagnosticReport"/></bpmn2:extensionElements></bpmn2:subProcess>' + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  );
  assert.ok(codes.includes('EVENT_SUBPROCESS_UNSUPPORTED'));
});

// What is drawn inside a sub-process becomes a module of its own, which the sub-process calls.
const inner = (extra = '') =>
  '<bpmn2:startEvent id="IS" name="Initial"/>' + task('IT', 'inside', setAttr('x', '1') + extra) + '<bpmn2:endEvent id="IE" name="Terminal"/>' +
  flow('if1', 'IS', 'IT') + flow('if2', 'IT', 'IE');

test('the content of a sub-process becomes a module of its own, called by the sub-process', async () => {
  const { modules, diagnostics } = await convert([{ path: 'test.bpmn', xml: wrap(
    start() + `<bpmn2:subProcess id="A" name="Anemia check">${inner()}</bpmn2:subProcess>` + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  ) }]);
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.equal(modules.length, 2);
  const [parent, child] = modules;
  assert.equal(parent.json.states['Anemia check'].type, 'CallSubmodule');
  assert.equal(parent.json.states['Anemia check'].submodule, 'test/test_anemia_check');
  assert.equal(child.path, 'test/test_anemia_check');
  assert.equal(child.json.name, 'Anemia check');
  assert.deepEqual(Object.keys(child.json.states).sort(), ['Initial', 'Terminal', 'inside']);
  assert.ok(diagnostics.items.some((i) => i.code === 'SUBPROCESS_EXTRACTED'));
});

test('sub-processes inside sub-processes become modules of their own, one inside the other', async () => {
  const nested = '<bpmn2:startEvent id="S2" name="Initial"/>' +
    '<bpmn2:subProcess id="B" name="Deep">' + inner() + '</bpmn2:subProcess><bpmn2:endEvent id="E2" name="Terminal"/>' +
    flow('g1', 'S2', 'B') + flow('g2', 'B', 'E2');
  const { modules, diagnostics } = await convert([{ path: 'test.bpmn', xml: wrap(
    start() + `<bpmn2:subProcess id="A" name="Outer">${nested}</bpmn2:subProcess>` + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
  ) }]);
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.deepEqual(modules.map((m) => m.path), ['test', 'test/test_outer', 'test/test_outer_deep']);
  assert.equal(modules[1].json.states.Deep.submodule, 'test/test_outer_deep');
});

test('the module name of a sub-process is made from its name: umlauts are transliterated, a name without letters falls back to the id', async () => {
  const { modules } = await convert([{ path: 'test.bpmn', xml: wrap(
    start() + `<bpmn2:subProcess id="A" name="Größe prüfen">${inner()}</bpmn2:subProcess><bpmn2:subProcess id="B" name="???">${inner().replace(/IS|IT|IE|if1|if2/g, (m) => 'X' + m)}</bpmn2:subProcess>` + end() +
      flow('f1', 'S', 'A') + flow('f1b', 'A', 'B') + flow('f2', 'B', 'E')
  ) }]);
  assert.deepEqual(modules.map((m) => m.path), ['test', 'test/test_groesse_pruefen', 'test/test_b']);
});

test('examples/valid/sub-process.bpmn converts to a main module and the module made from the sub-process', async () => {
  const path = 'examples/valid/sub-process.bpmn';
  const { modules, diagnostics } = await convert([{ path, xml: readFileSync(path, 'utf8') }], { strict: true });
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.deepEqual(modules.map((m) => m.path), ['sub_process', 'sub_process/sub_process_diagnostic_work_up']);
  assert.equal(modules[0].json.states['Diagnostic work-up'].submodule, 'sub_process/sub_process_diagnostic_work_up');
  assert.equal(modules[1].json.states['Set risk'].distribution.kind, 'UNIFORM');
});

test('a sub-process with content must not also name a module, and needs a start event of its own', async () => {
  const both = await subProcess('CallSubmodule', '<synthea:submoduleConfig submodule="anemia_submodule"/>', inner());
  assert.ok(both.codes.includes('SUBPROCESS_SUBMODULE_CONFLICT'));
  const noStart = await subProcess(null, '', task('IT', 'inside', setAttr('x', '1')) + '<bpmn2:endEvent id="IE" name="Terminal"/>' + flow('if2', 'IT', 'IE'));
  assert.ok(noStart.codes.includes('INITIAL_COUNT'));
});

test('an encounter cannot span a sub-process: the same encounterId inside and outside is an error', async () => {
  const encounterCtx = '<synthea:encounterContext requiresEncounterContext="true" encounterId="E1" encounterClass="ambulatory" encounterCodeSystem="http://snomed.info/sct" encounterCode="1" encounterCodeDisplay="x"/>';
  const { diagnostics } = await convert([{ path: 'test.bpmn', xml: wrap(
    start() + task('P1', 'p', stateType('Procedure') + coding(SNOMED, '1', 'p') + encounterCtx) +
      `<bpmn2:subProcess id="A" name="Sub">${inner(encounterCtx)}</bpmn2:subProcess>` + end() +
      flow('f0', 'S', 'P1') + flow('f1', 'P1', 'A') + flow('f2', 'A', 'E')
  ) }]);
  assert.ok(diagnostics.items.some((i) => i.code === 'ENCOUNTER_ACROSS_SUBPROCESS'));
});

// ---- SetAttribute from a distribution or another attribute -------------------------------------

const setting = (config, extra = '') =>
  run(start() + task('A', 'set', stateType('SetAttribute') + config + extra) + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E'));

test('SetAttribute from a distribution (kind, round, parameters)', async () => {
  const { module, diagnostics } = await setting('<synthea:setAttributeConfig attribute="los" valueKind="DISTRIBUTION" distribution="EXPONENTIAL" distributionRound="true" distributionMean="3"/>');
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.deepEqual(module.json.states.set.distribution, { kind: 'EXPONENTIAL', round: true, parameters: { mean: 3 } });
  assert.ok(!('value' in module.json.states.set));

  const gaussian = await setting('<synthea:setAttributeConfig attribute="x" distribution="GAUSSIAN" distributionMean="10" distributionStandardDeviation="2" distributionMin="5"/>');
  assert.deepEqual(gaussian.module.json.states.set.distribution, { kind: 'GAUSSIAN', parameters: { mean: 10, standardDeviation: 2, min: 5 } });
});

test('SetAttribute copies the value of another attribute', async () => {
  const { module } = await setting('<synthea:setAttributeConfig attribute="hospice_reason" valueAttribute="lung_cancer_diagnosis"/>');
  assert.deepEqual(module.json.states.set, { type: 'SetAttribute', attribute: 'hospice_reason', value_attribute: 'lung_cancer_diagnosis', direct_transition: 'Terminal' });
});

test('SetAttribute: a distribution that does not match its kind, or two ways to set the value, are errors', async () => {
  const cases = {
    missingMean: ['<synthea:setAttributeConfig attribute="x" distribution="EXPONENTIAL"/>', 'DISTRIBUTION_INVALID'],
    strayParameter: ['<synthea:setAttributeConfig attribute="x" distribution="EXACT" distributionValue="1" distributionMean="2"/>', 'DISTRIBUTION_INVALID'],
    noKind: ['<synthea:setAttributeConfig attribute="x" valueKind="DISTRIBUTION" distributionMean="2"/>', 'DISTRIBUTION_INVALID'],
    valueAndDistribution: ['<synthea:setAttributeConfig attribute="x" value="3" distribution="EXACT" distributionValue="1"/>', 'SET_ATTRIBUTE_VALUE'],
    valueAndCopy: ['<synthea:setAttributeConfig attribute="x" value="3" valueAttribute="y"/>', 'SET_ATTRIBUTE_VALUE'],
    leftoverOfOtherKind: ['<synthea:setAttributeConfig attribute="x" valueKind="VALUE" value="3" valueAttribute="y"/>', 'SET_ATTRIBUTE_VALUE'],
    kindWithoutField: ['<synthea:setAttributeConfig attribute="x" valueKind="ATTRIBUTE"/>', 'SET_ATTRIBUTE_VALUE']
  };
  for (const [name, [config, code]] of Object.entries(cases)) {
    const { codes } = await setting(config);
    assert.ok(codes.includes(code), `${name} should be ${code}`);
  }
});

test('a probability: fixed and attribute together, or an attribute without a default, are errors', async () => {
  const branch = (p) =>
    run(start() + task('A', 'a', stateType('Simple')) + task('B', 'b', stateType('Simple')) + task('C', 'c', stateType('Simple')) + end() +
      flow('f1', 'S', 'A') + flow('f2', 'A', 'B', p) + flow('f3', 'A', 'C') + flow('f4', 'B', 'E') + flow('f5', 'C', 'E'));
  const ok = await branch('<synthea:probabilityConfig probabilityKind="ATTRIBUTE" probabilityAttribute="p" probabilityDefault="0.2"/>');
  assert.equal(ok.diagnostics.errorCount, 0, ok.diagnostics.format().join('\n'));
  assert.ok((await branch('<synthea:probabilityConfig probability="0.3" probabilityAttribute="p" probabilityDefault="0.2"/>')).codes.includes('TRANSITION_PROBABILITY_CONFLICT'));
  assert.ok((await branch('<synthea:probabilityConfig probabilityAttribute="p"/>')).codes.includes('TRANSITION_PROBABILITY_DEFAULT'));
  assert.ok((await branch('<synthea:probabilityConfig probabilityKind="FIXED"/>')).codes.includes('TRANSITION_PROBABILITY_EMPTY'));
});

test('AllergyOnset is reported as incomplete: allergy_type and category are required and not modeled', async () => {
  const bare = await clinical('AllergyOnset', coding(SNOMED, '91935009', 'Allergy to peanuts'));
  assert.match(bare.module.json.states.clin.remarks[0], /allergy_type, category/);
});

test('leftovers are reported: delay high on an exact delay, wellness with a class, a reference with a code, a config the state does not read', async () => {
  const delay = await run(start() + timer('T', 'wait', '<synthea:delayConfig delayShape="EXACT" delayValue="1" delayValueHigh="3" delayUnit="days"/>') + end() + flow('f1', 'S', 'T') + flow('f2', 'T', 'E'));
  assert.ok(delay.codes.includes('DELAY_CONFIG_INVALID'));

  const enc = await run(start() + task('A', 'a', stateType('Procedure') + coding(SNOMED, '1', 'p') + '<synthea:encounterContext requiresEncounterContext="true" encounterId="E1" wellness="true" encounterClass="inpatient"/>') + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E'));
  assert.ok(enc.codes.includes('ENCOUNTER_WELLNESS_CLASS'));

  const death = await run(start() + task('A', 'a', stateType('ConditionOnset') + coding(SNOMED, '1', 'Dx') + '<synthea:assignToAttributeConfig attribute="dx"/>') +
    '<bpmn2:endEvent id="E" name="Death"><bpmn2:extensionElements>' + '<synthea:stateTypeConfig stateType="Death" codeSystem="http://snomed.info/sct" code="1" codeDisplay="Dx"/>' + '<synthea:referencedByAttributeConfig attribute="dx"/></bpmn2:extensionElements></bpmn2:endEvent>' +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'E'));
  assert.ok(death.codes.includes('CODE_NOT_USED'));
  assert.equal(death.module.json.states.E?.referenced_by_attribute ?? death.module.json.states.Death?.referenced_by_attribute, 'dx');

  const stray = await run(start() + task('A', 'a', stateType('Simple') + '<synthea:counterConfig attribute="x" action="increment"/>') + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E'));
  assert.ok(stray.codes.includes('CONFIG_IGNORED'));
});

test('an Attribute condition "== nil" is an error: it compares with the text "nil"', async () => {
  const eq = await withCondition(attrCond('anemia', '==', 'nil'));
  assert.ok(eq.codes.includes('CONDITION_INVALID'));
  const ne = await withCondition(attrCond('anemia', '!=', 'nil'));
  assert.ok(ne.codes.includes('CONDITION_INVALID'));
  const ok = await withCondition(attrCond('anemia', 'is nil'));
  assert.equal(ok.diagnostics.errorCount, 0);
});

test('probabilities from attributes: a note names the branch that receives the remainder', async () => {
  const named = (attribute, p) => `<synthea:probabilityConfig probabilityAttribute="${attribute}" probabilityDefault="${p}"/>`;
  const { module, diagnostics } = await run(
    start() + gateway('G', 'risk') + task('A', 'event', setAttr('x', '1')) + task('B', 'none', setAttr('x', '2')) + end() +
    flow('f1', 'S', 'G') + flow('f2', 'G', 'A', named('p_event', '0.1')) + flow('f3', 'G', 'B', named('p_none', '0.9')) +
    flow('f4', 'A', 'E') + flow('f5', 'B', 'E')
  );
  assert.deepEqual(module.json.states.risk.distributed_transition, [
    { transition: 'event', distribution: { attribute: 'p_event', default: 0.1 } },
    { transition: 'none', distribution: { attribute: 'p_none', default: 0.9 } }
  ]);
  const note = diagnostics.items.find((i) => i.code === 'DISTRIBUTION_REMAINDER');
  assert.ok(note && note.message.includes('(none)'), 'the last branch gets the remainder');
});

// --- documentation-only elements ---
const docOnly = '<synthea:documentationOnly/>';

test('documentation-only task: no state, its neighbours are connected', async () => {
  const { module, diagnostics } = await run(
    start() + task('D', 'Treatment coordination', docOnly) + task('A', 'Set smoker', setAttr('smoker', 'true')) + end() +
    flow('f1', 'S', 'D') + flow('f2', 'D', 'A') + flow('f3', 'A', 'E')
  );
  assert.equal(diagnostics.errorCount, 0);
  assert.ok(!('Treatment coordination' in module.json.states));
  assert.equal(module.json.states.Initial.direct_transition, 'Set smoker');
  assert.ok(diagnostics.items.some((i) => i.code === 'DOCUMENTATION_ONLY'));
});

test('documentation-only chain and branch order: the joined flow keeps its place among the branches', async () => {
  const { module, diagnostics } = await run(
    start() + gateway('G', 'Smoker?') +
      task('D1', 'Doc one', docOnly) + task('D2', 'Doc two', docOnly) +
      task('A', 'Yes path', setAttr('x', '1')) + task('B', 'No path', setAttr('x', '0')) + end() +
      flow('f1', 'S', 'G') +
      flow('f2', 'G', 'D1', cond(attrCond('smoker', '==', 'true'))) +
      flow('f3', 'G', 'B', cond(attrCond('smoker', '==', 'false'))) +
      flow('f4', 'D1', 'D2') + flow('f5', 'D2', 'A') + flow('f6', 'A', 'E') + flow('f7', 'B', 'E')
  );
  assert.equal(diagnostics.errorCount, 0);
  const { conditional_transition: branches } = module.json.states['Smoker?'];
  assert.deepEqual(branches.map((b) => b.transition), ['Yes path', 'No path']);
  assert.equal(branches[0].condition.attribute, 'smoker');
});

test('documentation-only: errors for config, start/end, branching and conflicting flows', async () => {
  const codes = async (body) => (await run(body)).diagnostics.items.filter((i) => i.level === 'error').map((i) => i.code);
  assert.ok((await codes(
    start() + task('D', 'Doc', docOnly + stateType('SetAttribute')) + end() + flow('f1', 'S', 'D') + flow('f2', 'D', 'E')
  )).includes('DOCUMENTATION_ONLY_HAS_CONFIG'));
  assert.ok((await codes(
    '<bpmn2:startEvent id="S" name="Initial">' + `<bpmn2:extensionElements>${docOnly}</bpmn2:extensionElements></bpmn2:startEvent>` + end() + flow('f1', 'S', 'E')
  )).includes('DOCUMENTATION_ONLY_NOT_ALLOWED'));
  assert.ok((await codes(
    start() + task('D', 'Doc', docOnly) + end() + end('E2', 'Other') + flow('f1', 'S', 'D') + flow('f2', 'D', 'E') + flow('f3', 'D', 'E2')
  )).includes('DOCUMENTATION_ONLY_NEEDS_ONE_EXIT'));
  assert.ok((await codes(
    start() + gateway('G', 'g') + task('D', 'Doc', docOnly) + task('A', 'a', setAttr('x', '1')) + end() +
    flow('f1', 'S', 'G') + flow('f2', 'G', 'D', prob(0.5)) + flow('f3', 'D', 'A', prob(0.5)) + flow('f4', 'G', 'A', prob(0.5)) + flow('f5', 'A', 'E')
  )).includes('DOCUMENTATION_ONLY_EDGE_CONFLICT'));
});

// --- parallel and inclusive gateways ---
const par = (id, name) => `<bpmn2:parallelGateway id="${id}" name="${name}"/>`;
const inc = (id, name) => `<bpmn2:inclusiveGateway id="${id}" name="${name}"/>`;
const errorCodes = (diagnostics) => diagnostics.items.filter((i) => i.level === 'error').map((i) => i.code);

test('parallel gateway: branches run one after the other in the order of the outgoing flows', async () => {
  const { module, diagnostics } = await run(
    start() + par('SP', 'Split') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('y', '1')) + task('C', 'c', setAttr('z', '1')) +
      par('J', 'Join') + end() +
      flow('f1', 'S', 'SP') + flow('f2', 'SP', 'B') + flow('f3', 'SP', 'A') + flow('f4', 'B', 'C') + flow('f5', 'A', 'J') + flow('f6', 'C', 'J') +
      flow('f7', 'J', 'E')
  );
  assert.deepEqual(errorCodes(diagnostics), []);
  const s = module.json.states;
  assert.equal(s.Initial.direct_transition, 'b');
  assert.equal(s.b.direct_transition, 'c');
  assert.equal(s.c.direct_transition, 'a');
  assert.equal(s.a.direct_transition, 'Terminal');
  assert.ok(!('Split' in s) && !('Join' in s));
});

test('inclusive gateway: each branch is decided on its own, any combination can happen', async () => {
  const { module, diagnostics } = await run(
    start() + inc('I', 'Therapies') + task('A', 'Radiotherapy', setAttr('x', '1')) + task('B', 'Chemotherapy', setAttr('y', '1')) +
      inc('J', 'Done') + end() +
      flow('f1', 'S', 'I') + flow('f2', 'I', 'A', prob(0.3)) + flow('f3', 'I', 'B', cond(attrCond('fit', '==', 'true'))) +
      flow('f4', 'A', 'J') + flow('f5', 'B', 'J') + flow('f6', 'J', 'E')
  );
  assert.deepEqual(errorCodes(diagnostics), []);
  const s = module.json.states;
  assert.equal(s.Initial.direct_transition, 'Therapies: Radiotherapy');
  assert.deepEqual(s['Therapies: Radiotherapy'].distributed_transition, [
    { transition: 'Radiotherapy', distribution: 0.3 },
    { transition: 'Therapies: Chemotherapy', distribution: 0.7 }
  ]);
  assert.equal(s['Therapies: Chemotherapy'].conditional_transition[0].transition, 'Chemotherapy');
  assert.equal(s['Therapies: Chemotherapy'].conditional_transition[1].transition, 'Terminal');
  assert.equal(s.Radiotherapy.direct_transition, 'Therapies: Chemotherapy');
  assert.equal(s.Chemotherapy.direct_transition, 'Terminal');
});

test('nested parallel blocks are linearized from the inside out', async () => {
  const { module, diagnostics } = await run(
    start() + par('P1', 'p1') + par('P2', 'p2') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('y', '1')) + task('C', 'c', setAttr('z', '1')) +
      par('J2', 'j2') + par('J1', 'j1') + end() +
      flow('f1', 'S', 'P1') + flow('f2', 'P1', 'P2') + flow('f3', 'P1', 'C') + flow('f4', 'P2', 'A') + flow('f5', 'P2', 'B') +
      flow('f6', 'A', 'J2') + flow('f7', 'B', 'J2') + flow('f8', 'J2', 'J1') + flow('f9', 'C', 'J1') + flow('f10', 'J1', 'E')
  );
  assert.deepEqual(errorCodes(diagnostics), []);
  const s = module.json.states;
  assert.deepEqual([s.Initial.direct_transition, s.a.direct_transition, s.b.direct_transition, s.c.direct_transition], ['a', 'b', 'c', 'Terminal']);
});

test('parallel and inclusive gateways: unstructured or incomplete blocks are errors', async () => {
  // a split without a join
  assert.ok(errorCodes((await run(
    start() + par('SP', 'p') + task('A', 'a', setAttr('x', '1')) + end() + end('E2', 'Other') +
      flow('f1', 'S', 'SP') + flow('f2', 'SP', 'A') + flow('f3', 'SP', 'E2') + flow('f4', 'A', 'E')
  )).diagnostics).includes('PARALLEL_NOT_STRUCTURED'));
  // a condition on a parallel branch
  assert.ok(errorCodes((await run(
    start() + par('SP', 'p') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('y', '1')) + par('J', 'j') + end() +
      flow('f1', 'S', 'SP') + flow('f2', 'SP', 'A', prob(0.5)) + flow('f3', 'SP', 'B') + flow('f4', 'A', 'J') + flow('f5', 'B', 'J') + flow('f6', 'J', 'E')
  )).diagnostics).includes('PARALLEL_BRANCH_CONFIG'));
  // an inclusive branch without condition or probability
  assert.ok(errorCodes((await run(
    start() + inc('I', 'i') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('y', '1')) + inc('J', 'j') + end() +
      flow('f1', 'S', 'I') + flow('f2', 'I', 'A', prob(0.5)) + flow('f3', 'I', 'B') + flow('f4', 'A', 'J') + flow('f5', 'B', 'J') + flow('f6', 'J', 'E')
  )).diagnostics).includes('INCLUSIVE_BRANCH_CONFIG_MISSING'));
  // a decision inside a branch is fine, but not when one of its ways ends the process
  assert.ok(errorCodes((await run(
    start() + par('SP', 'p') + gateway('G', 'g') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('y', '1')) + par('J', 'j') + end() + end('E2', 'Other') +
      flow('f1', 'S', 'SP') + flow('f2', 'SP', 'G') + flow('f3', 'SP', 'B') + flow('f4', 'G', 'A', prob(0.5)) + flow('f5', 'G', 'E2') + flow('f6', 'A', 'J') + flow('f7', 'B', 'J') + flow('f8', 'J', 'E')
  )).diagnostics).includes('PARALLEL_NOT_STRUCTURED'));
});

// --- link events and loop markers ---
const linkEvent = (id, name, role) =>
  role === 'throw'
    ? `<bpmn2:intermediateThrowEvent id="${id}" name="${name}"><bpmn2:linkEventDefinition name="${name}"/></bpmn2:intermediateThrowEvent>`
    : `<bpmn2:intermediateCatchEvent id="${id}" name="${name}"><bpmn2:linkEventDefinition name="${name}"/></bpmn2:intermediateCatchEvent>`;

test('link events: the throw and the catch event with the same name become one direct flow', async () => {
  const { module, diagnostics } = await run(
    start() + gateway('G', 'Smoker?') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('y', '1')) + end() +
      linkEvent('T', 'to-b', 'throw') + linkEvent('C', 'to-b', 'catch') +
      flow('f1', 'S', 'G') + flow('f2', 'G', 'T', cond(attrCond('smoker', '==', 'true'))) + flow('f3', 'G', 'A', cond(attrCond('smoker', '==', 'false'))) +
      flow('f4', 'C', 'B') + flow('f5', 'A', 'E') + flow('f6', 'B', 'E')
  );
  assert.deepEqual(errorCodes(diagnostics), []);
  const branches = module.json.states['Smoker?'].conditional_transition;
  assert.deepEqual(branches.map((b) => b.transition), ['b', 'a']);
  assert.ok(!('to-b' in module.json.states));
});

test('link events: unmatched, unnamed and configured link events are errors', async () => {
  assert.ok(errorCodes((await run(
    start() + linkEvent('T', 'nowhere', 'throw') + end() + flow('f1', 'S', 'T')
  )).diagnostics).includes('LINK_UNMATCHED'));
  assert.ok(errorCodes((await run(
    start() + linkEvent('C', 'orphan', 'catch') + end() + flow('f1', 'C', 'E') + flow('f2', 'S', 'E')
  )).diagnostics).includes('LINK_UNMATCHED'));
});

test('a loop or multi-instance marker is an error, not silently dropped', async () => {
  const looping = '<bpmn2:task id="A" name="a"><bpmn2:standardLoopCharacteristics/></bpmn2:task>';
  const { diagnostics } = await run(start() + looping + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E'));
  assert.ok(errorCodes(diagnostics).includes('LOOP_MARKER_UNSUPPORTED'));
});

test('link events without a definition name are paired by their label, ignoring case', async () => {
  const unnamed = (id, label, role) =>
    role === 'throw'
      ? `<bpmn2:intermediateThrowEvent id="${id}" name="${label}"><bpmn2:linkEventDefinition/></bpmn2:intermediateThrowEvent>`
      : `<bpmn2:intermediateCatchEvent id="${id}" name="${label}"><bpmn2:linkEventDefinition/></bpmn2:intermediateCatchEvent>`;
  const { module, diagnostics } = await run(
    start() + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('y', '1')) + end() +
      unnamed('T', 'Re-Evaluation', 'throw') + unnamed('C', 'Re-evaluation', 'catch') +
      flow('f1', 'S', 'A') + flow('f2', 'A', 'T') + flow('f3', 'C', 'B') + flow('f4', 'B', 'E')
  );
  assert.deepEqual(errorCodes(diagnostics), []);
  assert.equal(module.json.states.a.direct_transition, 'b');
  assert.ok(diagnostics.items.some((i) => i.code === 'LINK_RESOLVED' && /label/.test(i.message)));
});

test('a branch may contain decisions: parallel branches with a decision inside run in order', async () => {
  const { module, diagnostics } = await run(
    start() + par('SP', 'Split') + gateway('G', 'Risk?') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('y', '1')) + task('C', 'c', setAttr('z', '1')) +
      par('J', 'Join') + end() +
      flow('f1', 'S', 'SP') + flow('f2', 'SP', 'G') + flow('f3', 'SP', 'C') +
      flow('f4', 'G', 'A', cond(attrCond('risk', '==', 'true'))) + flow('f5', 'G', 'B') +
      flow('f6', 'A', 'J') + flow('f7', 'B', 'J') + flow('f8', 'C', 'J') + flow('f9', 'J', 'E')
  );
  assert.deepEqual(errorCodes(diagnostics), []);
  const s = module.json.states;
  assert.equal(s.Initial.direct_transition, 'Risk?');
  assert.deepEqual(s['Risk?'].conditional_transition.map((b) => b.transition), ['a', 'b']);
  assert.equal(s.a.direct_transition, 'c'); // both ways out of the first branch lead to the second
  assert.equal(s.b.direct_transition, 'c');
  assert.equal(s.c.direct_transition, 'Terminal');
});

test('a branch with an end event, or a flow in from outside, is still not structured; the join is not reported twice', async () => {
  const ended = await run(
    start() + inc('I', 'i') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('y', '1')) + inc('J', 'j') + end() + end('E2', 'Other') +
      flow('f1', 'S', 'I') + flow('f2', 'I', 'A', prob(0.5)) + flow('f3', 'I', 'B', prob(0.5)) + flow('f4', 'A', 'J') + flow('f5', 'B', 'E2') + flow('f6', 'J', 'E')
  );
  assert.ok(errorCodes(ended.diagnostics).includes('INCLUSIVE_NOT_STRUCTURED'));
  const missing = await run(
    start() + inc('I', 'i') + task('A', 'a', setAttr('x', '1')) + task('B', 'b', setAttr('y', '1')) + inc('J', 'j') + end() +
      flow('f1', 'S', 'I') + flow('f2', 'I', 'A', prob(0.5)) + flow('f3', 'I', 'B') + flow('f4', 'A', 'J') + flow('f5', 'B', 'J') + flow('f6', 'J', 'E')
  );
  assert.deepEqual(errorCodes(missing.diagnostics).filter((c) => c.startsWith('INCLUSIVE')), ['INCLUSIVE_BRANCH_CONFIG_MISSING']);
});

test('constructs GMF cannot express get their own error code and a hint', async () => {
  const codeOf = async (el) => errorCodes((await run(start() + el + end() + flow('f1', 'S', 'X') + flow('f2', 'X', 'E'))).diagnostics);
  const inner = '<bpmn2:startEvent id="IS"/>';
  assert.ok((await codeOf(`<bpmn2:adHocSubProcess id="X" name="x">${inner}</bpmn2:adHocSubProcess>`)).includes('ADHOC_SUBPROCESS_UNSUPPORTED'));
  assert.ok((await codeOf(`<bpmn2:transaction id="X" name="x">${inner}</bpmn2:transaction>`)).includes('TRANSACTION_UNSUPPORTED'));
  assert.ok((await codeOf(`<bpmn2:subProcess id="X" name="x" triggeredByEvent="true">${inner}</bpmn2:subProcess>`)).includes('EVENT_SUBPROCESS_UNSUPPORTED'));
  assert.ok((await codeOf('<bpmn2:eventBasedGateway id="X"/>')).includes('EVENT_BASED_GATEWAY_UNSUPPORTED'));
  assert.ok((await codeOf('<bpmn2:complexGateway id="X"/>')).includes('COMPLEX_GATEWAY_UNSUPPORTED'));
  assert.ok((await codeOf('<bpmn2:manualTask id="X"/>')).includes('STATE_TYPE_REQUIRED')); // a task is still a task
});

test('every encounter class Synthea knows can be used (hospice, home, snf, virtual included)', async () => {
  for (const cls of ['wellness', 'ambulatory', 'outpatient', 'inpatient', 'emergency', 'urgentcare', 'hospice', 'home', 'snf', 'virtual']) {
    const wellness = cls === 'wellness';
    const { module, diagnostics } = await run(
      start() +
        task('A', 'a', stateType('Procedure') + coding(SNOMED, '1', 'p') +
          `<synthea:encounterContext requiresEncounterContext="true" encounterId="V"${wellness ? ' wellness="true"' : ` encounterClass="${cls}" encounterCodeSystem="${SNOMED}" encounterCode="185345009" encounterCodeDisplay="Encounter"`}/>`) +
        end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E')
    );
    assert.ok(!errorCodes(diagnostics).some((c) => c.startsWith('ENCOUNTER_') && c !== 'ENCOUNTER_CODE_MISSING'), cls);
    const encounter = Object.values(module.json.states).find((s) => s.type === 'Encounter');
    if (wellness) assert.equal(encounter.wellness, true);
    else assert.equal(encounter.encounter_class, cls);
  }
});
