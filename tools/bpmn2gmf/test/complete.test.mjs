// For every state type the extension offers: a fully filled-in example converts without an error
// (strict, so a missing required field is one) and every state of the result has all the fields
// Synthea requires. This is what the coverage test does not check: that an emitter exists is not
// that it writes a complete state (VitalSign wrote nothing for a long time).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descriptor } from '../parse.mjs';
import { missingFields } from '../required-fields.mjs';
import {
  run, start, end, task, flow, stateType, setAttr, coding, delay, SNOMED, LOINC, RXNORM
} from './helpers.mjs';

const CVX = 'http://hl7.org/fhir/sid/cvx';
const ENC = '<synthea:encounterContext requiresEncounterContext="true" encounterId="W" wellness="true"/>';
const step = (id, type, inner = '') => task(id, id, stateType(type) + inner);
const assign = (attribute) => `<synthea:assignToAttributeConfig attribute="${attribute}"/>`;
const refer = (attribute) => `<synthea:referencedByAttributeConfig attribute="${attribute}"/>`;

const SERIES =
  '<synthea:imagingStudySeries bodySiteCode="51185008" bodySiteDisplay="Thoracic structure (body structure)" ' +
  'modalityCode="CT" modalityDisplay="Computed Tomography" instanceTitle="CT Image Storage" ' +
  'sopClassCode="1.2.840.10008.5.1.4.1.1.2" sopClassDisplay="CT Image Storage" minInstances="1" maxInstances="2"/>';
const REPORT_VALUE =
  '<synthea:reportObservation code="8480-6" codeDisplay="Systolic Blood Pressure" category="vital-signs" unit="mm[Hg]" valueShape="RANGE" value="110" valueHigh="140"/>';

// A pair of an onset and its end: the end finds its onset through an attribute.
const pair = (onset, endType, code, extra = '') => [
  step('A', onset, code + assign('x') + ENC + extra),
  step('B', endType, refer('x'))
];

// type -> the tasks of a small diagram that contains a complete state of that type
const FIXTURES = {
  Simple: [step('A', 'Simple')],
  SetAttribute: [task('A', 'A', setAttr('x', '1'))],
  Counter: [step('A', 'Counter', '<synthea:counterConfig attribute="n" action="increment"/>')],
  ConditionOnset: [step('A', 'ConditionOnset', coding(SNOMED, '1', 'Dx') + ENC)],
  ConditionEnd: pair('ConditionOnset', 'ConditionEnd', coding(SNOMED, '1', 'Dx')),
  AllergyOnset: [step('A', 'AllergyOnset', coding(SNOMED, '264287008', 'Animal dander') + ENC +
    '<synthea:allergyConfig allergyType="allergy" category="environment"/>')],
  AllergyEnd: pair('AllergyOnset', 'AllergyEnd', coding(SNOMED, '264287008', 'Animal dander'),
    '<synthea:allergyConfig allergyType="allergy" category="environment"/>'),
  MedicationOrder: [step('A', 'MedicationOrder', coding(RXNORM, '860975', 'metformin') + ENC)],
  MedicationEnd: pair('MedicationOrder', 'MedicationEnd', coding(RXNORM, '860975', 'metformin')),
  CarePlanStart: [step('A', 'CarePlanStart', coding(SNOMED, '1', 'Care plan') + ENC)],
  CarePlanEnd: pair('CarePlanStart', 'CarePlanEnd', coding(SNOMED, '1', 'Care plan')),
  Procedure: [step('A', 'Procedure', coding(SNOMED, '1', 'Procedure') + ENC)],
  ImagingStudy: [step('A', 'ImagingStudy', coding(SNOMED, '16335031000119103', 'HRCT of chest') + SERIES + ENC)],
  Device: [step('A', 'Device', coding(SNOMED, '1', 'Device') + ENC)],
  DeviceEnd: pair('Device', 'DeviceEnd', coding(SNOMED, '1', 'Device')),
  SupplyList: [step('A', 'SupplyList', ENC + '<synthea:supplyItem quantity="2" code="52291003" codeDisplay="Glove, device (physical object)"/>')],
  VitalSign: [step('A', 'VitalSign', '<synthea:vitalSignConfig vitalSign="Systolic Blood Pressure"/><synthea:valueConfig valueShape="EXACT" value="120" unit="mmHg"/>')],
  Observation: [step('A', 'Observation', coding(LOINC, '72514-3', 'Pain severity') + ENC +
    '<synthea:observationConfig category="survey"/><synthea:valueConfig valueShape="EXACT" value="3" unit="{score}"/>')],
  MultiObservation: [step('A', 'MultiObservation', coding(LOINC, '85354-9', 'Blood pressure panel') + ENC +
    '<synthea:observationConfig category="vital-signs"/>' + REPORT_VALUE)],
  DiagnosticReport: [step('A', 'DiagnosticReport', coding(LOINC, '85354-9', 'Blood pressure panel') + ENC + REPORT_VALUE)],
  Symptom: [step('A', 'Symptom', '<synthea:symptomConfig symptom="Cough"/><synthea:valueConfig valueShape="RANGE" value="50" valueHigh="100"/>')],
  Death: [step('A', 'Death', coding(SNOMED, '1', 'Dx'))],
  Vaccine: [step('A', 'Vaccine', coding(CVX, '115', 'Tdap vaccine') + ENC)]
};

// Types that are not a task, or that are rejected, and where they are checked instead.
const ELSEWHERE = {
  Initial: 'the start event (convert.test.mjs)',
  Terminal: 'the end event (convert.test.mjs)',
  CallSubmodule: 'the call activity and the sub-process (convert.test.mjs)',
  Physiology: 'rejected with PHYSIOLOGY_UNSUPPORTED (coverage.test.mjs)',
  Guard: 'an exclusive gateway, below',
  Delay: 'a timer event, below'
};

const chain = (nodes, ids = nodes.map((n) => /id="([^"]+)"/.exec(n)[1])) =>
  start() + nodes.join('') + end() +
  [['S', ids[0]], ...ids.slice(1).map((id, i) => [ids[i], id]), [ids[ids.length - 1], 'E']].map(([a, b], i) => flow(`f${i}`, a, b)).join('');

const checkComplete = async (label, body, expectedType) => {
  const { module, diagnostics } = await run(body, { strict: true });
  assert.equal(diagnostics.errorCount, 0, `${label}: ${diagnostics.format().filter((l) => l.startsWith('ERROR')).join('\n')}`);
  const states = Object.entries(module.json.states);
  assert.ok(states.some(([, s]) => s.type === expectedType), `${label}: no ${expectedType} state in the output`);
  for (const [name, state] of states) {
    assert.deepEqual(missingFields(state), [], `${label}: state "${name}" (${state.type}) lacks required fields`);
    assert.ok(!state.remarks, `${label}: state "${name}" is marked incomplete: ${state.remarks}`);
  }
};

test('every state type of the extension is either checked here or listed with where it is checked', () => {
  const types = descriptor.types.find((t) => t.name === 'StateType').literalValues.map((v) => v.name);
  for (const type of types) {
    assert.ok(type in FIXTURES || type in ELSEWHERE, `${type}: add a complete example to FIXTURES or list it in ELSEWHERE`);
  }
  for (const type of Object.keys(FIXTURES)) assert.ok(types.includes(type), `${type} is not a state type of the extension`);
});

for (const [type, nodes] of Object.entries(FIXTURES)) {
  test(`${type}: a complete example converts strictly and every state has its required fields`, async () => {
    await checkComplete(type, chain(nodes), type);
  });
}

test('Guard and Delay: a complete example converts strictly with every required field', async () => {
  const guard = '<synthea:stateTypeConfig stateType="Guard"/><synthea:guardConfig><synthea:allow conditionType="Gender" gender="M"/></synthea:guardConfig>';
  const gateway = `<bpmn2:exclusiveGateway id="G" name="G"><bpmn2:extensionElements>${guard}</bpmn2:extensionElements></bpmn2:exclusiveGateway>`;
  await checkComplete('Guard', chain([gateway]), 'Guard');
  await checkComplete('Delay', chain([delay('D', 'wait', 3, 'days')]), 'Delay');
});

test('a non-wellness encounter with its class and code is complete, together with its EncounterEnd', async () => {
  const inpatient =
    `<synthea:encounterContext requiresEncounterContext="true" encounterId="H" encounterClass="inpatient" encounterCodeSystem="${SNOMED}" encounterCode="32485007" encounterCodeDisplay="Hospital admission" dischargeCode="01" dischargeDisplay="Discharged home"/>`;
  const body = chain([step('A', 'Procedure', coding(SNOMED, '1', 'Procedure') + inpatient)]);
  await checkComplete('Encounter', body, 'Encounter');
  await checkComplete('EncounterEnd', body, 'EncounterEnd');
});
