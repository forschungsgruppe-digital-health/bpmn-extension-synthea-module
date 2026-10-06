// Fields Synthea requires per state type (States wiki: everything not marked
// "(optional)"). An array entry is a choice group: exactly one of its fields
// must be present. This is what the converter checks the output against; a
// missing field is reported, not guessed.
//
// Deliberately partial: states the project does not use yet (AllergyOnset's
// reaction details, Physiology, Encounter) are added when they are modeled.
export const REQUIRED_FIELDS = {
  Guard: ['allow'],
  Delay: [['exact', 'range']],
  SetAttribute: ['attribute'],
  Counter: ['attribute', 'action'],
  CallSubmodule: ['submodule'],
  ConditionOnset: ['codes'],
  AllergyOnset: ['codes'],
  MedicationOrder: ['codes'],
  CarePlanStart: ['codes'],
  Procedure: ['codes'],
  ImagingStudy: ['procedure_code', 'series'],
  Device: ['code'],
  SupplyList: ['supplies'],
  VitalSign: ['vital_sign', 'unit', ['exact', 'range']],
  Observation: ['category', 'unit', 'codes', ['exact', 'range', 'attribute', 'vital_sign', 'value_code']],
  MultiObservation: ['category', 'codes', 'observations'],
  DiagnosticReport: ['codes', 'observations'],
  Symptom: ['symptom', ['exact', 'range']],
  ConditionEnd: [['condition_onset', 'referenced_by_attribute', 'codes']],
  AllergyEnd: [['allergy_onset', 'referenced_by_attribute', 'codes']],
  MedicationEnd: [['medication_order', 'referenced_by_attribute', 'codes']],
  CarePlanEnd: [['careplan', 'referenced_by_attribute', 'codes']],
  DeviceEnd: [['device', 'referenced_by_attribute', 'codes']]
};

const present = (state, field) => {
  const v = state[field];
  return v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0);
};

// Returns descriptions of what is missing, e.g. ["category", "one of exact | range"].
export function missingFields(state) {
  const missing = [];
  for (const need of REQUIRED_FIELDS[state.type] ?? []) {
    if (Array.isArray(need)) {
      if (!need.some((f) => present(state, f))) missing.push(`one of ${need.join(' | ')}`);
    } else if (!present(state, need)) {
      missing.push(need);
    }
  }
  return missing;
}
