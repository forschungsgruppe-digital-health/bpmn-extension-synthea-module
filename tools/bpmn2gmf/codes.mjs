// Code system URIs (as used by synthea:stateTypeConfig codeSystem, synthea:Condition.codeSystem and term:coding)
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

const localName = (el) => (el.$type ?? '').split(':').pop().toLowerCase();

// Collects every coding on a node, whatever form it comes in:
//   <synthea:stateTypeConfig codeSystem= code= codeDisplay= />   (the form the models use)
//   <term:coding .../>                                           (optional input from the separate term: extension)
//   <term:annotations><term:annotation><term:coding/>…           (that extension's own form)
// The namespace prefix is ignored, and so is whether a descriptor was registered
// (generic elements keep children in $children, typed ones in values/codings).
function collect(el, out) {
  if (el.$type === 'synthea:StateTypeConfig' && el.code) {
    out.push({ uri: el.codeSystem, code: el.code, display: el.codeDisplay });
  }
  if (localName(el) === 'coding' && (el.system || el.code)) {
    out.push({ uri: el.system, code: el.code, display: el.display });
  }
  for (const child of el.$children ?? []) collect(child, out);
  for (const key of ['values', 'codings']) {
    for (const child of el[key] ?? []) collect(child, out);
  }
}

export function readCodings(node) {
  const out = [];
  for (const el of Object.values(node.ext).flat()) collect(el, out);
  return out;
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
