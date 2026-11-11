// The converter column of docs/extension-matrix.md: each "K" cell is run on a small diagram, so the
// matrix does not rest on reading the code alone. (The panel column is read out of the demo.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convert } from '../convert.mjs';
import { wrap, start, end, task, timer, call, flow, gateway, stateType, prob, cond, attrCond, enc, coding, SNOMED, LOINC, RXNORM } from './helpers.mjs';

const ext = (inner) => `<bpmn2:extensionElements>${inner}</bpmn2:extensionElements>`;
const withCode = (type, system, code, extra = '') =>
  `<synthea:stateTypeConfig stateType="${type}" codeSystem="${system}" code="${code}" codeDisplay="d"/>${extra}`;

// ext content per state type and what must come out
const PAYLOADS = {
  Procedure: [withCode('Procedure', SNOMED, '1'), (s) => s.codes?.length === 1],
  Counter: [stateType('Counter') + '<synthea:counterConfig attribute="a" action="increment"/>', (s) => s.attribute === 'a'],
  SetAttribute: [stateType('SetAttribute') + '<synthea:setAttributeConfig attribute="a" value="1"/>', (s) => s.attribute === 'a' && s.value === 1],
  ConditionOnset: [withCode('ConditionOnset', SNOMED, '1', '<synthea:assignToAttributeConfig attribute="dx"/>'), (s) => s.assign_to_attribute === 'dx'],
  MedicationEnd: [stateType('MedicationEnd') + '<synthea:referencedByAttributeConfig attribute="rx"/>', (s) => s.referenced_by_attribute === 'rx'],
  Symptom: [stateType('Symptom') + '<synthea:symptomConfig symptom="Cough"/><synthea:valueConfig valueShape="RANGE" value="10" valueHigh="20"/>', (s) => s.symptom === 'Cough' && s.range?.high === 20],
  Observation: [withCode('Observation', LOINC, '1-1', '<synthea:observationConfig category="vital-signs"/><synthea:valueConfig valueShape="EXACT" value="5" unit="u"/>'), (s) => s.category === 'vital-signs' && s.exact?.quantity === 5],
  MedicationOrder: [withCode('MedicationOrder', RXNORM, '1', '<synthea:medicationConfig administration="true"/>'), (s) => s.administration === true],
  CarePlanStart: [withCode('CarePlanStart', SNOMED, '1', '<synthea:carePlanActivity code="2" codeDisplay="a"/>'), (s) => s.activities?.length === 1],
  ImagingStudy: [withCode('ImagingStudy', SNOMED, '1', '<synthea:imagingStudySeries bodySiteCode="1" bodySiteDisplay="b" modalityCode="CT" modalityDisplay="CT" instanceTitle="t" sopClassCode="1.2" sopClassDisplay="s"/>'), (s) => s.series?.length === 1],
  DiagnosticReport: [withCode('DiagnosticReport', LOINC, '1-1', '<synthea:reportObservation code="718-7" codeDisplay="h" category="laboratory" unit="g/dL" value="1"/>'), (s) => s.observations?.length === 1]
};

const kinds = {
  task: (id, inner) => task(id, 'x', inner),
  'intermediate catch event': (id, inner) => timer(id, 'x', inner),
  'intermediate throw event': (id, inner) => `<bpmn2:intermediateThrowEvent id="${id}" name="x">${ext(inner)}</bpmn2:intermediateThrowEvent>`
};

const between = (element) => start() + element + end() + flow('f1', 'S', 'X') + flow('f2', 'X', 'E');

async function states(body, extraInputs = []) {
  const { modules, diagnostics } = await convert([{ path: 'test.bpmn', xml: wrap(body) }, ...extraInputs]);
  return { modules, diagnostics, states: modules[0]?.json.states ?? {} };
}
const subModule = { path: 'sub.bpmn', xml: wrap(start() + task('T', 't', stateType('Simple')) + end() + flow('g1', 'S', 'T') + flow('g2', 'T', 'E')) };

for (const [kind, make] of Object.entries(kinds)) {
  for (const [type, [inner, check]] of Object.entries(PAYLOADS)) {
    test(`matrix: the converter reads ${type} configs on a ${kind}`, async () => {
      const { diagnostics, states: s } = await states(between(make('X', inner)));
      assert.equal(diagnostics.errorCount, 0, diagnostics.format().join('\n'));
      assert.ok(check(s.x), JSON.stringify(s.x));
    });
  }
}

test('matrix: the converter reads delayConfig on a timer event, guardConfig on a gateway, StateTypeConfig on a start event', async () => {
  const delayed = await states(between(timer('X', 'x', '<synthea:delayConfig delayShape="EXACT" delayValue="2" delayUnit="days"/>')));
  assert.equal(delayed.states.x.exact.quantity, 2);
  const guarded = await states(start() + '<bpmn2:exclusiveGateway id="X" name="x"><bpmn2:extensionElements><synthea:guardConfig><synthea:allow conditionType="True"/></synthea:guardConfig></bpmn2:extensionElements></bpmn2:exclusiveGateway>' + end() + flow('f1', 'S', 'X') + flow('f2', 'X', 'E'));
  assert.equal(guarded.diagnostics.errorCount, 0, guarded.diagnostics.format().join('\n'));
  assert.equal(guarded.states.x.type, 'Guard');
  const initial = await states('<bpmn2:startEvent id="S" name="Initial"><bpmn2:extensionElements><synthea:stateTypeConfig stateType="Initial"/></bpmn2:extensionElements></bpmn2:startEvent>' + task('X', 'x', stateType('Simple')) + end() + flow('f1', 'S', 'X') + flow('f2', 'X', 'E'));
  assert.equal(initial.states.Initial.type, 'Initial');
});

test('matrix: the converter reads probability and condition on the flows of a task and of an event', async () => {
  for (const make of [kinds.task, kinds['intermediate catch event']]) {
    const probable = await states(start() + make('X', stateType('Simple')) + task('B', 'b', stateType('Simple')) + task('C', 'c', stateType('Simple')) + end() +
      flow('f1', 'S', 'X') + flow('f2', 'X', 'B', prob(0.4)) + flow('f3', 'X', 'C', prob(0.6)) + flow('f4', 'B', 'E') + flow('f5', 'C', 'E'));
    assert.equal(probable.states.x.distributed_transition?.length, 2);
    const conditional = await states(start() + make('X', stateType('Simple')) + task('B', 'b', stateType('Simple')) + task('C', 'c', stateType('Simple')) + end() +
      flow('f1', 'S', 'X') + flow('f2', 'X', 'B', cond(attrCond('a', '==', '1'))) + flow('f3', 'X', 'C') + flow('f4', 'B', 'E') + flow('f5', 'C', 'E'));
    assert.equal(conditional.states.x.conditional_transition?.length, 2);
  }
});

test('matrix: the converter reads a death on an end event (value, reference to an attribute) and the submodule config on a call activity and an empty sub-process', async () => {
  const dies = (inner) => start() + task('A', 'a', withCode('ConditionOnset', SNOMED, '1', '<synthea:assignToAttributeConfig attribute="dx"/>')) +
    `<bpmn2:endEvent id="X" name="x">${ext(inner)}</bpmn2:endEvent>` + flow('f1', 'S', 'A') + flow('f2', 'A', 'X');
  const timed = await states(dies(stateType('Death') + '<synthea:valueConfig valueShape="EXACT" value="3" unit="years"/>'));
  assert.equal(timed.states.x.exact.unit, 'years');
  const referenced = await states(dies(stateType('Death') + '<synthea:referencedByAttributeConfig attribute="dx"/>'));
  assert.equal(referenced.states.x.referenced_by_attribute, 'dx');

  const called = await states(between(call('X', 'x', 'sub')), [subModule]);
  assert.equal(called.diagnostics.errorCount, 0, called.diagnostics.format().join('\n'));
  assert.match(called.states.x.submodule, /sub$/);
  const embedded = await states(between(`<bpmn2:subProcess id="X" name="x">${ext('<synthea:submoduleConfig submodule="sub"/>')}</bpmn2:subProcess>`), [subModule]);
  assert.equal(embedded.diagnostics.errorCount, 0, embedded.diagnostics.format().join('\n'));
  assert.match(embedded.states.x.submodule, /sub$/);
});

test('matrix: the converter reads encounterContext on an end event, a call activity, a sub-process and the events, and encounterReference on a task and an event', async () => {
  const group = (id) => enc(id, 'encounterCodeSystem="http://snomed.info/sct" encounterCode="1" encounterCodeDisplay="e"');
  const inGroup = (element) => start() + task('TP', 'p', withCode('Procedure', SNOMED, '1', group('E1'))) + element + end() +
    flow('f1', 'S', 'TP') + flow('f2', 'TP', 'X') + flow('f3', 'X', 'E');
  const members = {
    'call activity': `<bpmn2:callActivity id="X" name="x">${ext('<synthea:submoduleConfig submodule="sub"/>' + group('E1'))}</bpmn2:callActivity>`,
    'intermediate catch event': timer('X', 'x', '<synthea:delayConfig delayShape="EXACT" delayValue="1" delayUnit="days"/>' + group('E1')),
    'intermediate throw event': `<bpmn2:intermediateThrowEvent id="X" name="x">${ext(stateType('Simple') + group('E1'))}</bpmn2:intermediateThrowEvent>`,
    'sub-process': `<bpmn2:subProcess id="X" name="x">${ext('<synthea:submoduleConfig submodule="sub"/>' + group('E1'))}</bpmn2:subProcess>`
  };
  for (const [name, element] of Object.entries(members)) {
    const { diagnostics, states: s } = await states(inGroup(element), [subModule]);
    assert.equal(diagnostics.errorCount, 0, `${name}: ${diagnostics.format().join('\n')}`);
    assert.ok(Object.values(s).some((x) => x.type === 'Encounter'), name);
  }
  // an end event inside the group (Death) and encounterReference on a task and an event
  const ending = start() + task('TP', 'p', withCode('Procedure', SNOMED, '1', group('E1'))) +
    `<bpmn2:endEvent id="X" name="x">${ext(stateType('Death') + group('E1'))}</bpmn2:endEvent>` + flow('f1', 'S', 'TP') + flow('f2', 'TP', 'X');
  const death = await states(ending);
  assert.equal(death.diagnostics.errorCount, 0, death.diagnostics.format().join('\n'));
  for (const make of [kinds.task, kinds['intermediate catch event']]) {
    const dx = await states(start() + task('TP', 'p', withCode('Procedure', SNOMED, '1', group('E1'))) +
      make('X', withCode('ConditionOnset', SNOMED, '2', '<synthea:encounterReference targetEncounter="E1"/>')) + end() +
      flow('f1', 'S', 'TP') + flow('f2', 'TP', 'X') + flow('f3', 'X', 'E'));
    assert.equal(dx.diagnostics.errorCount, 0, dx.diagnostics.format().join('\n'));
    assert.ok(dx.states.x.target_encounter, 'target_encounter');
  }
});
