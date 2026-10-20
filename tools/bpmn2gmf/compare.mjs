// Compares converted modules with hand-written Synthea modules by *content*, not by
// names or layout: every state that carries clinical meaning is reduced to a
// signature (type + codes + the values that matter), and the two lists of
// signatures are compared as multisets. State names, Simple/Encounter-bracket
// states and the exact transition structure are deliberately left out: our
// diagrams are allowed to differ there (gateway states, a different split into
// submodules).

const SKIPPED = new Set(['Initial', 'Terminal', 'Simple', 'EncounterEnd', 'CallSubmodule', 'Guard']);

// attribute names: Synthea's "Lung Cancer Type" and our lung_cancer_type are the same
const attr = (a) => String(a).trim().toLowerCase().replace(/[\s]+/g, '_');
// JSON with sorted keys, so {low, high} and {high, low} are the same value
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x));
// Codes are part of a signature unless `ignoreCodes` is set. The real pathway files carry no
// codes any more (term: is a separate extension), so comparing them with upstream leaves them out.
let ignoreCodes = false;
const codes = (list) => (ignoreCodes ? '' : (list ?? []).map((c) => `${c.system}:${c.code}`).sort().join(','));
const value = (o) => canon(o.range ?? o.exact ?? o.value_code ?? o.vital_sign ?? null);

function observation(o) {
  return `${codes(o.codes)} ${o.category} ${o.unit} ${value(o)}`;
}

// `alias` maps an attribute name (normalized) to the name the other side uses, for the
// attributes that are only *referred to* (copied from, cause of death): upstream's
// attribute "Lung Cancer" is called lung_cancer_diagnosis here.
export function signature(state, alias = {}) {
  const ref = (name) => (name === undefined ? null : (alias[attr(name)] ?? attr(name)));
  switch (state.type) {
    case 'SetAttribute': {
      const given = state.value ?? state.valueCode ?? state.range ?? state.expression ?? state.distribution
        ?? (state.value_attribute ? { value_attribute: ref(state.value_attribute) } : null);
      return `SetAttribute ${attr(state.attribute)}=${canon(given)}`;
    }
    case 'Counter': return `Counter ${attr(state.attribute)} ${state.action} ${state.amount ?? 1}`;
    case 'Delay': {
      // Synthea's v2 syntax {distribution: {kind: EXACT, parameters: {value}}, unit} is the exact delay of v1
      const d = state.distribution;
      const exact = d?.kind === 'EXACT' ? { quantity: d.parameters.value, unit: state.unit } : null;
      return `Delay ${canon(state.exact ?? state.range ?? exact ?? d ?? null)}`;
    }
    case 'Symptom': return `Symptom ${value(state)}`; // upstream repeats the name "Cough"; the severity is what is comparable
    case 'Death': return `Death ${canon(state.range ?? state.exact ?? null)} cause=${state.referenced_by_attribute ? ref(state.referenced_by_attribute) : codes(state.codes) || 'none'}`;
    case 'Encounter': return `Encounter ${state.wellness ? 'wellness' : state.encounter_class} ${codes(state.codes)}`;
    case 'Observation': return `Observation ${observation(state)}`;
    case 'DiagnosticReport':
      return `DiagnosticReport ${codes(state.codes)} [${(state.observations ?? []).map(observation).sort().join(' ; ')}]`;
    case 'ImagingStudy':
      return `ImagingStudy ${ignoreCodes ? '' : state.procedure_code?.code} ${(state.series ?? []).map((s) => `${s.body_site?.code}/${s.modality?.code}`).join(',')}`;
    case 'MedicationOrder': case 'MedicationEnd': case 'ConditionOnset': case 'ConditionEnd':
    case 'CarePlanStart': case 'CarePlanEnd': case 'Procedure':
      return `${state.type} ${codes(state.codes)}`;
    default: return `${state.type} ${codes(state.codes)}`;
  }
}

const count = (arr) => arr.reduce((m, s) => m.set(s, (m.get(s) ?? 0) + 1), new Map());

export function signatures(states, alias, { ignoreCodes: skip = false } = {}) {
  ignoreCodes = skip;
  try {
    return Object.values(states).filter((s) => !SKIPPED.has(s.type)).map((s) => signature(s, alias));
  } finally {
    ignoreCodes = false;
  }
}

// Multiset difference in both directions, as readable lines.
export function compare(oursStates, upstreamStates, { alias = {}, ignoreCodes = false } = {}) {
  const ours = count(signatures(oursStates, {}, { ignoreCodes }));
  const theirs = count(signatures(upstreamStates, alias, { ignoreCodes }));
  const diff = (a, b) => [...a].flatMap(([sig, n]) => (n > (b.get(sig) ?? 0) ? [`${n - (b.get(sig) ?? 0)}x ${sig}`] : [])).sort();
  return { onlyOurs: diff(ours, theirs), onlyUpstream: diff(theirs, ours), same: !diff(ours, theirs).length && !diff(theirs, ours).length };
}

// Several of our modules together (a main module plus its submodules) against one upstream module.
export const merge = (...modules) => Object.assign({}, ...modules.map((m, i) => Object.fromEntries(Object.entries(m).map(([k, v]) => [`${i}:${k}`, v]))));

// Fields that link states to each other or to attributes, and optional fields that
// still change what Synthea does or writes (`duration` takes simulated time,
// `administration` makes an order inpatient, `activities` fill the care plan). Not part
// of the signatures (names differ legitimately), but worth a look: how many states carry each.
const LINKS = ['assign_to_attribute', 'referenced_by_attribute', 'value_attribute', 'reason', 'target_encounter', 'duration', 'administration', 'activities'];
export function links(states) {
  const out = Object.fromEntries(LINKS.map((k) => [k, 0]));
  for (const state of Object.values(states)) for (const k of LINKS) if (state[k] !== undefined) out[k]++;
  return out;
}
