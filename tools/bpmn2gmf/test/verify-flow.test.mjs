// Level 1 order checks on plain module JSON (verify-flow.mjs): each rule has a module that must
// pass and one that must be reported. They work on JSON, so the cases are written as JSON.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Diagnostics } from '../diagnostics.mjs';
import {
  checkInitialWait, checkEncounterScope, checkStartEndOrder, checkGuardAttributes, verifyFlow
} from '../verify-flow.mjs';

const where = { module: 'm' };
const codesOf = (fn) => {
  const diag = new Diagnostics();
  fn(diag);
  return diag.items.map((i) => i.code);
};
const T = { type: 'Terminal' };

test('INITIAL_WITHOUT_WAIT: Delay, Guard, wellness Encounter and pass-through states are fine', () => {
  const ok = (states) => assert.deepEqual(codesOf((d) => checkInitialWait(states, where, d)), []);
  ok({ Initial: { type: 'Initial', direct_transition: 'D' }, D: { type: 'Delay', exact: { quantity: 1, unit: 'years' }, direct_transition: 'T' }, T });
  ok({ Initial: { type: 'Initial', direct_transition: 'G' }, G: { type: 'Guard', allow: {}, direct_transition: 'T' }, T });
  ok({ Initial: { type: 'Initial', direct_transition: 'E' }, E: { type: 'Encounter', wellness: true, direct_transition: 'T' }, T });
  ok({
    Initial: { type: 'Initial', direct_transition: 'S' },
    S: { type: 'SetAttribute', attribute: 'a', direct_transition: 'D' },
    D: { type: 'Delay', exact: { quantity: 1, unit: 'years' }, direct_transition: 'C' },
    C: { type: 'ConditionOnset', direct_transition: 'T' }, T
  });
});

test('INITIAL_WITHOUT_WAIT: a diagnosis straight after Initial is reported, also behind a branch', () => {
  const states = {
    Initial: { type: 'Initial', direct_transition: 'S' },
    S: { type: 'Simple', distributed_transition: [{ distribution: 0.5, transition: 'C' }, { distribution: 0.5, transition: 'D' }] },
    C: { type: 'ConditionOnset', direct_transition: 'D' },
    D: { type: 'Delay', exact: { quantity: 1, unit: 'years' }, direct_transition: 'T' }, T
  };
  assert.deepEqual(codesOf((d) => checkInitialWait(states, where, d)), ['INITIAL_WITHOUT_WAIT']);
});

const visit = (extra = {}) => ({
  Initial: { type: 'Initial', direct_transition: 'E' },
  E: { type: 'Encounter', encounter_class: 'ambulatory', codes: [], direct_transition: 'P' },
  P: { type: 'Procedure', codes: [], direct_transition: 'X' },
  X: { type: 'EncounterEnd', direct_transition: 'T' },
  T,
  ...extra
});

test('ENCOUNTER_REQUIRED: a Procedure between Encounter and EncounterEnd is fine', () => {
  assert.deepEqual(codesOf((d) => checkEncounterScope(visit(), where, d)), []);
});

test('ENCOUNTER_REQUIRED: a Procedure with no Encounter before it, or after EncounterEnd, is reported', () => {
  const none = {
    Initial: { type: 'Initial', direct_transition: 'P' },
    P: { type: 'Procedure', codes: [], direct_transition: 'T' }, T
  };
  assert.deepEqual(codesOf((d) => checkEncounterScope(none, where, d)), ['ENCOUNTER_REQUIRED']);
  const after = visit({ X: { type: 'EncounterEnd', direct_transition: 'P2' }, P2: { type: 'Observation', direct_transition: 'T' } });
  assert.deepEqual(codesOf((d) => checkEncounterScope(after, where, d)), ['ENCOUNTER_REQUIRED']);
});

test('ENCOUNTER_REQUIRED: one path without an open Encounter is enough', () => {
  const states = {
    Initial: { type: 'Initial', distributed_transition: [{ distribution: 0.5, transition: 'E' }, { distribution: 0.5, transition: 'P' }] },
    E: { type: 'Encounter', encounter_class: 'ambulatory', codes: [], direct_transition: 'P' },
    P: { type: 'Procedure', codes: [], direct_transition: 'T' }, T
  };
  // the path through E also leaves the encounter open at Terminal, which is a note of its own
  assert.deepEqual(codesOf((d) => checkEncounterScope(states, where, d)), ['ENCOUNTER_REQUIRED', 'ENCOUNTER_NOT_ENDED']);
});

test('ENCOUNTER_REQUIRED: a called module and the state after a CallSubmodule are not judged', () => {
  const none = {
    Initial: { type: 'Initial', direct_transition: 'P' },
    P: { type: 'Procedure', codes: [], direct_transition: 'T' }, T
  };
  assert.deepEqual(codesOf((d) => checkEncounterScope(none, where, d, { entry: 'unknown' })), []);
  const afterCall = {
    Initial: { type: 'Initial', direct_transition: 'C' },
    C: { type: 'CallSubmodule', submodule: 'x', direct_transition: 'P' },
    P: { type: 'Procedure', codes: [], direct_transition: 'T' }, T
  };
  assert.deepEqual(codesOf((d) => checkEncounterScope(afterCall, where, d)), []);
});

test('ENCOUNTER_NOT_ENDED: an Encounter still open at Terminal is a note, not a warning', () => {
  const open = visit({ P: { type: 'Procedure', codes: [], direct_transition: 'T' } });
  const diag = new Diagnostics();
  checkEncounterScope(open, where, diag);
  assert.deepEqual(diag.items.map((i) => [i.code, i.level]), [['ENCOUNTER_NOT_ENDED', 'note']]);
});

const onset = (extra = {}) => ({
  Initial: { type: 'Initial', direct_transition: 'On' },
  On: { type: 'ConditionOnset', codes: [], assign_to_attribute: 'x', direct_transition: 'End' },
  End: { type: 'ConditionEnd', referenced_by_attribute: 'x', direct_transition: 'T' },
  T,
  ...extra
});

test('END_BEFORE_START: an end after its start passes, by attribute and by name', () => {
  assert.deepEqual(codesOf((d) => checkStartEndOrder(onset(), where, d)), []);
  const named = onset({ End: { type: 'ConditionEnd', condition_onset: 'On', direct_transition: 'T' } });
  assert.deepEqual(codesOf((d) => checkStartEndOrder(named, where, d)), []);
});

test('END_BEFORE_START: an end that comes before its start is reported', () => {
  const states = {
    Initial: { type: 'Initial', direct_transition: 'End' },
    End: { type: 'ConditionEnd', condition_onset: 'On', direct_transition: 'On' },
    On: { type: 'ConditionOnset', codes: [], direct_transition: 'T' },
    T
  };
  // the loop-free order is End -> On, so the end cannot follow the onset
  assert.deepEqual(codesOf((d) => checkStartEndOrder(states, where, d)), ['END_BEFORE_START']);
});

test('END_START_MISSING / END_START_TYPE: the named start must exist and have the right type', () => {
  const missing = onset({ End: { type: 'ConditionEnd', condition_onset: 'Nope', direct_transition: 'T' } });
  assert.deepEqual(codesOf((d) => checkStartEndOrder(missing, where, d)), ['END_START_MISSING']);
  const wrong = onset({ End: { type: 'ConditionEnd', condition_onset: 'Initial', direct_transition: 'T' } });
  assert.deepEqual(codesOf((d) => checkStartEndOrder(wrong, where, d)), ['END_START_TYPE']);
});

test('END_BEFORE_START: an attribute set in no state of the module is left to other modules', () => {
  const states = onset({ On: { type: 'ConditionOnset', codes: [], direct_transition: 'End' } });
  assert.deepEqual(codesOf((d) => checkStartEndOrder(states, where, d)), []);
});

test('GUARD_ATTRIBUTE_NEVER_SET: a note, and only when no module of the run sets the attribute', () => {
  const states = {
    Initial: { type: 'Initial', direct_transition: 'G' },
    G: { type: 'Guard', allow: { condition_type: 'Attribute', attribute: 'a', operator: '==', value: true }, direct_transition: 'T' },
    T
  };
  const diag = new Diagnostics();
  checkGuardAttributes(states, new Set(), where, diag);
  assert.deepEqual(diag.items.map((i) => [i.code, i.level]), [['GUARD_ATTRIBUTE_NEVER_SET', 'note']]);
  assert.deepEqual(codesOf((d) => checkGuardAttributes(states, new Set(['a']), where, d)), []);
});

test('verifyFlow: a module that another one calls is not asked for a wait after Initial', () => {
  const diag = new Diagnostics();
  const sub = { fileBase: 'sub', states: { Initial: { type: 'Initial', direct_transition: 'C' }, C: { type: 'ConditionOnset', direct_transition: 'T' }, T } };
  const top = { fileBase: 'top', states: { Initial: { type: 'Initial', direct_transition: 'Call' }, Call: { type: 'CallSubmodule', submodule: 'sub', direct_transition: 'T' }, T } };
  verifyFlow([top, sub], diag);
  assert.deepEqual(diag.items.map((i) => i.code), []);
  const alone = new Diagnostics();
  verifyFlow([sub], alone);
  assert.deepEqual(alone.items.map((i) => i.code), ['INITIAL_WITHOUT_WAIT']);
});
