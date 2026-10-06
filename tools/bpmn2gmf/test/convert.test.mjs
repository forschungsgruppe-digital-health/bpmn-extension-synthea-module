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

// ---- clinical states and codes (phase 2) -------------------------------------------

// start -> one clinical task -> end; `inner` is the task's extension content
const clinical = (type, inner, opts) =>
  run(start() + task('A', 'clin', stateType(type) + inner) + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E'), opts);

test('ConditionOnset: term:coding becomes codes (system URI -> Synthea name)', async () => {
  const { module, diagnostics } = await clinical('ConditionOnset', coding(SNOMED, '271737000', 'Anemia (disorder)'));
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.deepEqual(module.json.states.clin.codes, [{ system: 'SNOMED-CT', code: '271737000', display: 'Anemia (disorder)' }]);
  assert.ok(!diagnostics.items.some((i) => i.code === 'REQUIRED_FIELD_MISSING'));
});

test('the real package form term:annotations/annotation/coding reads the same', async () => {
  const real =
    '<term:annotations><term:annotation id="a1" text="x">' + coding(SNOMED, '271737000', 'Anemia (disorder)') +
    '</term:annotation></term:annotations>';
  const { module } = await clinical('ConditionOnset', real);
  assert.deepEqual(module.json.states.clin.codes, [{ system: 'SNOMED-CT', code: '271737000', display: 'Anemia (disorder)' }]);
});

test('only codings in a system the state accepts are used; the others are mentioned', async () => {
  const { module, diagnostics } = await clinical(
    'Procedure',
    coding(SNOMED, '399208008', 'Plain X-ray of chest') + coding(LOINC, '36643-5', 'Chest X-ray') +
      coding('http://ihe-d.de/CodeSystems/IHEXDStypeCode', 'ERGE', 'Diagnostic imaging results')
  );
  assert.deepEqual(module.json.states.clin.codes.map((c) => c.system), ['SNOMED-CT']);
  assert.ok(diagnostics.items.some((i) => i.code === 'CODING_IGNORED'));
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

test('the real submodules convert without errors; only gaps the extension cannot express are reported', async () => {
  const files = [
    'lung-cancer/anemia-submodule.bpmn',
    'lung-cancer/lung-cancer-treatment-submodule.bpmn',
    'lung-cancer/symptom-check-submodule.bpmn',
    'lung-cancer/lung-cancer-probabilities-submodule.bpmn'
  ];
  const { modules, diagnostics } = await convert(files.map((path) => ({ path, xml: readFileSync(path, 'utf8') })));
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  assert.ok(modules.every((m) => m.ok));

  const gaps = {};
  for (const i of diagnostics.items.filter((x) => x.code === 'REQUIRED_FIELD_MISSING')) {
    const type = i.message.split(' ')[0];
    gaps[type] = (gaps[type] ?? 0) + 1;
  }
  // docs/bpmn2gmf-concept.md section 5: these are the fields phase 4 adds to the extension
  // plus the codes of the synthesized Encounter states (decision 5, phase 4)
  assert.deepEqual(gaps, { Symptom: 10, DiagnosticReport: 6, Observation: 4, ImagingStudy: 1, Encounter: 9 });
});

test('the main pathway is only blocked by its boundary timer', async () => {
  const path = 'lung-cancer/synthea-lung-cancer.bpmn';
  const { diagnostics } = await convert([{ path, xml: readFileSync(path, 'utf8') }]);
  assert.deepEqual(
    [...new Set(diagnostics.items.filter((i) => i.level === 'error').map((i) => i.code))].sort(),
    ['BOUNDARY_EVENT_UNSUPPORTED', 'SUBMODULE_NOT_FOUND'].sort()
  );
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

test('a delay shorter than a day stays inside the encounter, a day or longer ends it', async () => {
  const short = await run(
    start() + procedure('A', 'a', 'E1') + delay('D', 'wait', 1, 'hours') + procedure('B', 'b', 'E1') + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'D') + flow('f3', 'D', 'B') + flow('f4', 'B', 'E')
  );
  assert.deepEqual(walk(short.module.json.states), ['Initial', 'E1', 'a', 'wait', 'b', 'E1_End', 'Terminal']);

  const long = await run(
    start() + procedure('A', 'a', 'E1') + delay('D', 'wait', 1, 'days') + procedure('B', 'b', 'E1') + end() +
    flow('f1', 'S', 'A') + flow('f2', 'A', 'D') + flow('f3', 'D', 'B') + flow('f4', 'B', 'E')
  );
  assert.deepEqual(walk(long.module.json.states), ['Initial', 'E1', 'a', 'E1_End', 'wait', 'E1_2', 'b', 'E1_End_2', 'Terminal']);
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

test('branches into the same encounter get one Encounter per entered state and share the EncounterEnd', async () => {
  const { module, diagnostics } = await run(
    start() + gateway('G', 'g', 'f3') + procedure('A', 'a', 'E1') + procedure('B', 'b', 'E1') + end() +
      flow('f1', 'S', 'G') + flow('f2', 'G', 'A', prob('0.5')) + flow('f3', 'G', 'B', prob('0.5')) +
      flow('f4', 'A', 'E') + flow('f5', 'B', 'E')
  );
  assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
  const states = Object.entries(module.json.states);
  assert.equal(states.filter(([, v]) => v.type === 'Encounter').length, 2);
  assert.equal(states.filter(([, v]) => v.type === 'EncounterEnd').length, 1);
  assert.deepEqual(module.json.states.a.direct_transition, 'E1_End');
  assert.deepEqual(module.json.states.b.direct_transition, 'E1_End');
});

test('target_encounter names the Encounter state of the group, when there is exactly one', async () => {
  const dx = (target) => task('X', 'dx', stateType('ConditionOnset') + coding(SNOMED, '1', 'Dx') + `<synthea:encounterReference targetEncounter="${target}"/>`);
  const ok = await run(
    start() + dx('E1') + procedure('A', 'a', 'E1') + end() + flow('f1', 'S', 'X') + flow('f2', 'X', 'A') + flow('f3', 'A', 'E')
  );
  assert.equal(ok.module.json.states.dx.target_encounter, 'E1');

  const unknown = await run(start() + dx('nope') + end() + flow('f1', 'S', 'X') + flow('f2', 'X', 'E'));
  assert.ok(unknown.codes.includes('TARGET_ENCOUNTER_UNKNOWN'));

  const twice = await run(
    start() + gateway('G', 'g', 'f3') + dx('E1') + procedure('A', 'a', 'E1') + procedure('B', 'b', 'E1') + end() +
      flow('f0', 'S', 'X') + flow('f1', 'X', 'G') + flow('f2', 'G', 'A', prob('0.5')) + flow('f3', 'G', 'B', prob('0.5')) +
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
