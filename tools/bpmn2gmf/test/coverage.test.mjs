// Which Synthea state types, fields and transitions the converter covers, and which it only offers
// or does not write. The lists below are the concrete
// state and transition classes of Synthea v4.0.0 (org.mitre.synthea.engine.State$* and Transition$*,
// checked in synthea-with-dependencies.jar); the counts say how many of its 536 shipped modules use
// the type, so a gap can be weighed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { descriptor } from '../parse.mjs';
import { run, start, end, task, flow, stateType } from './helpers.mjs';

const SYNTHEA_STATES = [
  'Initial', 'Terminal', 'Simple', 'Guard', 'Delay', 'SetAttribute', 'Counter', 'CallSubmodule', 'Death',
  'Encounter', 'EncounterEnd', 'ConditionOnset', 'ConditionEnd', 'AllergyOnset', 'AllergyEnd',
  'MedicationOrder', 'MedicationEnd', 'CarePlanStart', 'CarePlanEnd', 'Procedure', 'VitalSign', 'Observation',
  'MultiObservation', 'DiagnosticReport', 'ImagingStudy', 'Device', 'DeviceEnd', 'SupplyList', 'Symptom',
  'Physiology', 'Vaccine'
];

// Encounter and EncounterEnd are not drawn: they are made from the encounterId groups (ADR-0003).
const SYNTHESIZED = ['Encounter', 'EncounterEnd'];
const NOT_COVERED_STATES = {};

// In the descriptor's StateType list (the panel does not offer them), but the converter does not
// produce a complete state for them.
const OFFERED_NOT_COMPLETE = {
  Physiology: { code: 'PHYSIOLOGY_UNSUPPORTED', note: 'rejected on purpose: simulates a physiological model, no BPMN counterpart (1 state in 1 shipped module)' }
};

// Fields of the Synthea states that shipped modules use and the converter never writes. Counts are
// states in shipped modules (Synthea v4.0.0, 536 modules). The test below checks that none of them
// appears in the converter, so implementing one makes it fail until the entry is removed.
const FIELDS_NOT_WRITTEN = {
  'Observation.sampled_data': '1 state in 1 module',
  'Observation.attachment': '1 state in 1 module'
};

// Keys that shipped modules carry but Synthea v4.0.0 does not read: no class of the engine package
// (org.mitre.synthea.engine) has a field or string of that name, so the engine ignores them.
// The converter leaves them out on purpose.
const FIELDS_IGNORED_BY_ENGINE = {
  // CarePlanStart.goals is declared `transient` and nothing in the engine fills it, so it stays empty:
  // a run with two goals exported a CarePlan without any Goal resource (checked with and without a reason).
  'CarePlanStart.goals': '5 states in 5 shipped modules; the field is transient and never loaded in v4.0.0',
  'DiagnosticReport.number_of_observations': '25 states in 12 modules; the lipid panel example of the wiki sets 4, other modules 4 with 11 observations',
  'MultiObservation.number_of_observations': '14 states in 9 modules; one sets 0 with 3 observations'
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

test('every Synthea state type is offered, synthesized, or listed as not covered with a reason', () => {
  for (const state of SYNTHEA_STATES) {
    const offered = drawn.includes(state) || SYNTHESIZED.includes(state);
    const listed = state in NOT_COVERED_STATES;
    assert.ok(offered !== listed, `${state}: must be exactly one of offered or listed as not covered`);
  }
});

// A state type being offered is not the same as the converter writing a complete state for it.
const TASK_TYPES = drawn.filter((t) => !['Initial', 'Terminal', 'Guard', 'Delay', 'CallSubmodule'].includes(t));

test('a state type of the descriptor has an emitter, unless it is listed as not complete', async () => {
  for (const type of TASK_TYPES) {
    const { diagnostics } = await run(start() + task('A', 'a', stateType(type)) + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E'));
    const codes = diagnostics.items.map((i) => i.code);
    assert.ok(!codes.includes('STATE_TYPE_NOT_IMPLEMENTED'), `${type} has no emitter`);
    assert.equal(codes.includes(OFFERED_NOT_COMPLETE[type]?.code ?? '-'), type in OFFERED_NOT_COMPLETE, type);
  }
  // without a supplyItem the state is reported incomplete (Synthea requires `supplies`)
  const supply = await run(start() + task('A', 'a', stateType('SupplyList')) + end() + flow('f1', 'S', 'A') + flow('f2', 'A', 'E'));
  assert.ok(supply.diagnostics.items.some((i) => i.code === 'REQUIRED_FIELD_MISSING' && /supplies/.test(i.message)));
});

test('the fields shipped modules use that the converter never writes are listed, and really are not written', () => {
  const sources = ['emit.mjs', 'encounters.mjs', 'transitions.mjs', 'codes.mjs'].map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n');
  for (const entry of Object.keys(FIELDS_NOT_WRITTEN)) {
    const field = entry.split('.')[1];
    assert.ok(!sources.includes(field), `${entry} appears in the converter: remove it from FIELDS_NOT_WRITTEN`);
  }
});

test('the extension offers no state type that Synthea does not have', () => {
  for (const state of drawn) assert.ok(SYNTHEA_STATES.includes(state), `${state} is not a Synthea state type`);
});

test('the keys the engine ignores are left out of the output', () => {
  const sources = ['emit.mjs', 'encounters.mjs', 'transitions.mjs', 'codes.mjs'].map((f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')).join('\n');
  for (const entry of Object.keys(FIELDS_IGNORED_BY_ENGINE)) {
    assert.ok(!sources.includes(entry.split('.')[1]), `${entry} is ignored by Synthea; the converter should not write it`);
  }
});

test('the transitions that are not covered are documented', () => {
  for (const [name, note] of Object.entries(SYNTHEA_TRANSITIONS)) assert.ok(note, name);
  assert.deepEqual(Object.keys(SYNTHEA_TRANSITIONS).filter((n) => SYNTHEA_TRANSITIONS[n].startsWith('not covered')), ['lookup_table_transition', 'type_of_care_transition']);
});
