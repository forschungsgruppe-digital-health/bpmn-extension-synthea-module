// Stage 6b: checks on the order of states in a generated module (Level 1, structure, no simulation).
// They work on the plain module JSON (`states`), so they also run on hand-written Synthea modules.
// Everything here is a warning or a note: a graph cannot see that two branches exclude each other,
// so a finding means "a path exists", not "Synthea will fail".
//
// Sources: States wiki (Encounter, EncounterEnd, the *End states) and Kramer et al. 2025 (Level 1:
// temporal logic, care delivery sequence, event timing, attribute validity).

export const targetsOf = (s) => {
  if (s.direct_transition) return [s.direct_transition];
  if (s.distributed_transition) return s.distributed_transition.map((t) => t.transition);
  if (s.conditional_transition) return s.conditional_transition.map((t) => t.transition);
  if (s.complex_transition) return s.complex_transition.flatMap((t) => (t.distributions ?? [t]).map((d) => d.transition));
  return [];
};

// The wiki says these "must occur during an Encounter"; without a current encounter the engine
// raises an error. Vaccine is not on the wiki page but the converter treats it the same way.
export const NEEDS_ENCOUNTER = new Set([
  'MedicationOrder', 'CarePlanStart', 'Procedure', 'ImagingStudy', 'Device', 'Vaccine',
  'SupplyList', 'Observation', 'MultiObservation', 'DiagnosticReport'
]);

// End state -> the field that names its start state, and the type that start state must have.
export const END_STATES = {
  ConditionEnd: { field: 'condition_onset', start: 'ConditionOnset' },
  AllergyEnd: { field: 'allergy_onset', start: 'AllergyOnset' },
  MedicationEnd: { field: 'medication_order', start: 'MedicationOrder' },
  CarePlanEnd: { field: 'careplan', start: 'CarePlanStart' },
  DeviceEnd: { field: 'device', start: 'Device' }
};

export function reachableFrom(states, from) {
  const seen = new Set([from]);
  const stack = [from];
  while (stack.length) {
    for (const t of targetsOf(states[stack.pop()] ?? {})) {
      if (t in states && !seen.has(t)) {
        seen.add(t);
        stack.push(t);
      }
    }
  }
  return seen;
}

// Kramer: a Delay or Guard right after Initial. Without one the whole population gets the disease
// at birth. States that take no time and record nothing (Simple, SetAttribute, Counter) are passed
// through; a wellness Encounter blocks until the next visit and a CallSubmodule leaves the wait to
// the callee, so both count as a wait. Only for a module nobody calls: a submodule starts when its
// caller reaches it. Of the 97 shipped modules nobody calls, about half put a SetAttribute or Simple
// in front of the Delay, which is why those are skipped.
const PASS_THROUGH = new Set(['Simple', 'SetAttribute', 'Counter']);
export function checkInitialWait(states, where, diag) {
  if (!states.Initial) return;
  const seen = new Set(['Initial']);
  const stack = [...targetsOf(states.Initial)];
  while (stack.length) {
    const name = stack.pop();
    const s = states[name];
    if (!s || seen.has(name)) continue;
    seen.add(name);
    if (s.type === 'Delay' || s.type === 'Guard' || s.type === 'CallSubmodule' || s.type === 'Terminal') continue;
    if (s.type === 'Encounter' && s.wellness) continue;
    if (PASS_THROUGH.has(s.type)) {
      stack.push(...targetsOf(s));
      continue;
    }
    diag.warn(
      'INITIAL_WITHOUT_WAIT',
      `${s.type} can run right after Initial with no Delay or Guard before it, so every patient gets there at birth. Fine for a module that only runs when another one asks for it.`,
      { ...where, element: name }
    );
    return;
  }
}

// Wiki, Encounter / Current Encounter: a clinical state needs a current_encounter, which an
// Encounter state sets and an EncounterEnd clears. Follows every path and remembers whether an
// encounter is closed, open or unknown (after a CallSubmodule, or at the start of a submodule).
export function checkEncounterScope(states, where, diag, { entry = 'closed' } = {}) {
  if (!states.Initial) return;
  const at = new Map([['Initial', new Set([entry])]]);
  const work = ['Initial'];
  const after = (s, before) => {
    if (s.type === 'Encounter') return new Set(['open']);
    if (s.type === 'EncounterEnd') return new Set(['closed']);
    if (s.type === 'CallSubmodule') return new Set(['unknown']);
    return before;
  };
  while (work.length) {
    const name = work.pop();
    const out = after(states[name], at.get(name));
    for (const t of targetsOf(states[name])) {
      if (!(t in states)) continue;
      const have = at.get(t) ?? new Set();
      const grown = [...out].filter((x) => !have.has(x));
      if (!at.has(t) || grown.length) {
        at.set(t, new Set([...have, ...out]));
        work.push(t);
      }
    }
  }
  for (const [name, status] of at) {
    const s = states[name];
    if (NEEDS_ENCOUNTER.has(s.type) && status.has('closed')) {
      diag.warn(
        'ENCOUNTER_REQUIRED',
        `${s.type} can be reached on a path with no open Encounter (the wiki says the engine raises an error then; 3 of the 536 shipped modules do it anyway).`,
        { ...where, element: name }
      );
    }
  }
  for (const [name, s] of Object.entries(states)) {
    if (s.type === 'Terminal' && at.get(name)?.has('open')) {
      diag.note(
        'ENCOUNTER_NOT_ENDED',
        'An Encounter can still be open at Terminal. The wiki only recommends an EncounterEnd (a wellness encounter needs none).',
        { ...where, element: name }
      );
    }
  }
}

// Kramer, event timing: an end state must come after its start state. The start is named by the
// state's name or through an attribute the start state assigns.
export function checkStartEndOrder(states, where, diag) {
  for (const [name, s] of Object.entries(states)) {
    const rule = END_STATES[s.type];
    if (!rule) continue;
    const starts = [];
    if (s[rule.field]) {
      const target = states[s[rule.field]];
      if (!target) {
        diag.warn('END_START_MISSING', `${s.type} names "${s[rule.field]}", which is not a state of this module.`, { ...where, element: name });
        continue;
      }
      if (target.type !== rule.start) {
        diag.warn('END_START_TYPE', `${s.type} names "${s[rule.field]}", which is a ${target.type}, not a ${rule.start}.`, { ...where, element: name });
        continue;
      }
      starts.push(s[rule.field]);
    } else if (s.referenced_by_attribute) {
      for (const [n, other] of Object.entries(states)) {
        if (other.type === rule.start && other.assign_to_attribute === s.referenced_by_attribute) starts.push(n);
      }
      if (!starts.length) continue; // set in another module
    } else continue;
    if (!starts.some((n) => reachableFrom(states, n).has(name))) {
      diag.warn('END_BEFORE_START', `${s.type} cannot be reached from its ${rule.start} (${starts.join(', ')}).`, { ...where, element: name });
    }
  }
}

// Attributes a Guard waits for. A Guard on an attribute nothing sets blocks the patient for good.
function guardAttributes(condition, out = new Set()) {
  if (!condition) return out;
  if (condition.condition_type === 'Attribute' && condition.attribute) out.add(condition.attribute);
  for (const sub of condition.conditions ?? []) guardAttributes(sub, out);
  if (condition.condition) guardAttributes(condition.condition, out);
  return out;
}

export const attributesSetIn = (states) => {
  const set = new Set();
  for (const s of Object.values(states)) {
    if (s.type === 'SetAttribute' || s.type === 'Counter') set.add(s.attribute);
    if (s.assign_to_attribute) set.add(s.assign_to_attribute);
  }
  return set;
};

// Kramer: attributes must be assigned before they are read. Synthea sets some itself and modules
// share attributes, so this only reports a Guard whose attribute no module of the run sets.
export function checkGuardAttributes(states, setSomewhere, where, diag) {
  for (const [name, s] of Object.entries(states)) {
    if (s.type !== 'Guard') continue;
    for (const attribute of guardAttributes(s.allow)) {
      if (!setSomewhere.has(attribute)) {
        diag.note(
          'GUARD_ATTRIBUTE_NEVER_SET',
          `Guard waits for attribute "${attribute}", which no module of this run sets (Synthea itself or another module may).`,
          { ...where, element: name }
        );
      }
    }
  }
}

// Whole run: the checks that need to know which modules are called by others.
export function verifyFlow(modules, diag) {
  const usable = modules.filter((m) => m.states && diag.forModule(m.fileBase).every((i) => i.level !== 'error'));
  const called = new Set();
  const setSomewhere = new Set();
  for (const m of usable) {
    for (const s of Object.values(m.states)) if (s.type === 'CallSubmodule') called.add(s.submodule);
    for (const a of attributesSetIn(m.states)) setSomewhere.add(a);
  }
  for (const m of usable) {
    const where = { module: m.fileBase };
    const isCalled = called.has(m.fileBase);
    if (!isCalled) checkInitialWait(m.states, where, diag);
    checkEncounterScope(m.states, where, diag, { entry: isCalled ? 'unknown' : 'closed' });
    checkStartEndOrder(m.states, where, diag);
    checkGuardAttributes(m.states, setSomewhere, where, diag);
  }
}
