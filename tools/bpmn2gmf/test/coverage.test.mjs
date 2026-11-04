// Which Synthea state types and transitions the converter covers. The lists below are the concrete
// state and transition classes of Synthea v4.0.0 (org.mitre.synthea.engine.State$* and Transition$*,
// checked in synthea-with-dependencies.jar); the counts say how many of its 536 shipped modules use
// the type, so a gap can be weighed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { descriptor } from '../parse.mjs';

const SYNTHEA_STATES = [
  'Initial', 'Terminal', 'Simple', 'Guard', 'Delay', 'SetAttribute', 'Counter', 'CallSubmodule', 'Death',
  'Encounter', 'EncounterEnd', 'ConditionOnset', 'ConditionEnd', 'AllergyOnset', 'AllergyEnd',
  'MedicationOrder', 'MedicationEnd', 'CarePlanStart', 'CarePlanEnd', 'Procedure', 'VitalSign', 'Observation',
  'MultiObservation', 'DiagnosticReport', 'ImagingStudy', 'Device', 'DeviceEnd', 'SupplyList', 'Symptom',
  'Physiology', 'Vaccine', 'TelemedicinePossibility'
];

// Encounter and EncounterEnd are not drawn: they are made from the encounterId groups (ADR-0003).
const SYNTHESIZED = ['Encounter', 'EncounterEnd'];
const NOT_COVERED_STATES = {
  Vaccine: '5 states in 1 shipped module',
  TelemedicinePossibility: 'used by no shipped module'
};

const SYNTHEA_TRANSITIONS = {
  direct_transition: 'covered',
  distributed_transition: 'covered',
  conditional_transition: 'covered',
  complex_transition: 'covered only by --fuse-gateways, which folds a probability gateway into the conditional state before it',
  lookup_table_transition: 'not covered: 69 states in 19 shipped modules, none in the lung cancer pathway; the probabilities live in a CSV outside the diagram',
  type_of_care_transition: 'not covered: 1 state in 1 shipped module, experimental'
};

const drawn = descriptor.types.find((t) => t.name === 'StateType').literalValues.map((v) => v.name);

test('every Synthea state type is covered, synthesized, or listed as not covered with a reason', () => {
  for (const state of SYNTHEA_STATES) {
    const covered = drawn.includes(state) || SYNTHESIZED.includes(state);
    const listed = state in NOT_COVERED_STATES;
    assert.ok(covered !== listed, `${state}: must be exactly one of covered or listed as not covered`);
  }
});

test('the extension offers no state type that Synthea does not have', () => {
  for (const state of drawn) assert.ok(SYNTHEA_STATES.includes(state), `${state} is not a Synthea state type`);
});

test('the transitions that are not covered are documented', () => {
  for (const [name, note] of Object.entries(SYNTHEA_TRANSITIONS)) assert.ok(note, name);
  assert.deepEqual(Object.keys(SYNTHEA_TRANSITIONS).filter((n) => SYNTHEA_TRANSITIONS[n].startsWith('not covered')), ['lookup_table_transition', 'type_of_care_transition']);
});
