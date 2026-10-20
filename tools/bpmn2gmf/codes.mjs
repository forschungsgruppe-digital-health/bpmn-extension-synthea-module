// Code system URIs (as used by synthea:stateTypeConfig codeSystem, and synthea:Condition.codeSystem)
// -> the names Synthea's GMF expects in `codes`.
const SYSTEMS = {
  'http://snomed.info/sct': 'SNOMED-CT',
  'http://loinc.org': 'LOINC',
  'http://www.nlm.nih.gov/research/umls/rxnorm': 'RxNorm'
};

export const systemName = (uri) => SYSTEMS[uri] ?? null;

// Which code systems each state type accepts (implicit-rules.md, "term:" table).
export const SYSTEMS_BY_STATE_TYPE = {
  ConditionOnset: ['SNOMED-CT'],
  ConditionEnd: ['SNOMED-CT'],
  AllergyOnset: ['SNOMED-CT', 'RxNorm'],
  AllergyEnd: ['SNOMED-CT', 'RxNorm'],
  MedicationOrder: ['RxNorm'],
  MedicationEnd: ['RxNorm'],
  CarePlanStart: ['SNOMED-CT'],
  CarePlanEnd: ['SNOMED-CT'],
  Procedure: ['SNOMED-CT'],
  ImagingStudy: ['SNOMED-CT'],
  Device: ['SNOMED-CT'],
  DeviceEnd: ['SNOMED-CT'],
  Observation: ['LOINC'],
  MultiObservation: ['LOINC'],
  DiagnosticReport: ['LOINC'],
  Death: ['SNOMED-CT']
};

// The code of a node: <synthea:stateTypeConfig codeSystem= code= codeDisplay= />.
// A state has one code (the extension keeps no other source of codes).
export function readCodings(node) {
  return (node.ext['synthea:StateTypeConfig'] ?? [])
    .filter((el) => el.code)
    .map((el) => ({ uri: el.codeSystem, code: el.code, display: el.codeDisplay }));
}

// Codes of a node as Synthea wants them for `stateType`: only systems the state
// accepts, in Synthea's naming. `ignored` lists the codings that were left out
// (other vocabulary on the same element, e.g. IHE codes next to a SNOMED one).
export function codesForState(node, stateType) {
  const allowed = SYSTEMS_BY_STATE_TYPE[stateType] ?? [];
  const codes = [];
  const ignored = [];
  for (const c of readCodings(node)) {
    const system = systemName(c.uri);
    if (system && allowed.includes(system) && c.code) {
      codes.push({ system, code: c.code, display: c.display ?? '' });
    } else {
      ignored.push(c);
    }
  }
  return { codes, ignored };
}
