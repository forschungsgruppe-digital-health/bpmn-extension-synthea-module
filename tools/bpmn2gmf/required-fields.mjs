// Fields Synthea requires per state type: everything the States wiki does not mark "(optional)", checked
// against the whole page on 2026-11-04. An array entry is a choice group: exactly one of its fields
// must be present. This is what the converter checks the output against; a missing field is
// reported, not guessed. Encounter is handled in missingFields (it depends on `wellness`).
//
// Where this is more lenient than the wiki, because the 536 shipped modules do it too:
//   - ConditionOnset / AllergyOnset: the wiki does not mark target_encounter optional, but 1360 of
//     1624 ConditionOnset states have none (Synthea records the diagnosis in the current encounter).
//   - Symptom: the wiki does not mark `cause` optional, but 208 of 309 states have none.
//   - SetAttribute: the wiki lists a choice group (value, value_code, range, expression, series_data),
//     but 48 of 791 states have none (a copy from another attribute, or just resetting it).
// `distribution` (GMF v2) is a third choice next to exact and range on Delay (the wiki lists it); shipped modules
// also use it on Observation (33 states) and Symptom (11), and Observation has sampled_data and attachment
// (1 state each). Found by checking the generated JSON Schema against the 536 shipped modules, 2026-11-11.
// An Observation with a coded value (value_code) has no unit (5 shipped states, e.g. the questionnaire in
// homelessness), so `unit` is only required together with a numeric value: it is a choice with value_code.
// Vaccine is not on the wiki page; the engine reads codes[0], so codes is required.
// Physiology is not converted (PHYSIOLOGY_UNSUPPORTED).
export const REQUIRED_FIELDS = {
  Guard: ['allow'],
  Delay: [['exact', 'range', 'distribution']],
  SetAttribute: ['attribute'],
  Counter: ['attribute', 'action'],
  CallSubmodule: ['submodule'],
  ConditionOnset: ['codes'],
  AllergyOnset: ['allergy_type', 'category', 'codes'],
  MedicationOrder: ['codes'],
  CarePlanStart: ['codes'],
  Procedure: ['codes'],
  Vaccine: ['codes'],
  ImagingStudy: ['procedure_code', 'series'],
  Device: ['code'],
  SupplyList: ['supplies'],
  VitalSign: ['vital_sign', 'unit', ['exact', 'range']],
  Observation: ['category', ['unit', 'value_code'], 'codes', ['exact', 'range', 'distribution', 'attribute', 'vital_sign', 'value_code', 'sampled_data', 'attachment']],
  MultiObservation: ['category', 'codes', 'observations'],
  DiagnosticReport: ['codes', 'observations'],
  Symptom: ['symptom', ['exact', 'range', 'distribution']],
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
  // A wellness encounter is scheduled by Synthea itself and needs no class or code.
  const required = state.type === 'Encounter'
    ? (state.wellness ? [] : ['encounter_class', 'codes'])
    : REQUIRED_FIELDS[state.type] ?? [];
  for (const need of required) {
    if (Array.isArray(need)) {
      if (!need.some((f) => present(state, f))) missing.push(`one of ${need.join(' | ')}`);
    } else if (!present(state, need)) {
      missing.push(need);
    }
  }
  return missing;
}
