const { getStateType, getFhirmapResourceType } = require('../lib/utils');

/**
 * SYN-17 — stateType must not contradict fhirmap:resourceType.
 *
 * Derived from implicit-rules.md Table B / B.1. `fhirmap:` isn't
 * registered as a moddle extension in this project (it's a separate
 * package), so this rule reads the raw XML attribute directly rather than
 * through `is()` — see lib/utils.js#getFhirmapResourceType.
 *
 * Reported at "warn" in .bpmnlintrc, not "error": fhirmap:resourceType
 * may legitimately be absent while modeling is in progress.
 */

// stateType -> allowed fhirmap:resourceType values. `null` in the array
// means "resourceType should be absent for this stateType".
const ALLOWED = {
  MedicationOrder: ['MedicationRequest'],
  MedicationEnd: ['MedicationRequest'],
  Procedure: ['Procedure'],
  ImagingStudy: ['ImagingStudy'],
  Observation: ['Observation'],
  MultiObservation: ['Observation'],
  DiagnosticReport: ['DiagnosticReport'],
  Encounter: ['Encounter'],
  EncounterEnd: ['Encounter'],
  CarePlanStart: ['CarePlan'],
  CarePlanEnd: ['CarePlan'],
  Device: ['Device'],
  DeviceEnd: ['Device'],
  SupplyList: ['SupplyRequest'],
  ConditionOnset: ['Condition'],
  ConditionEnd: ['Condition'],
  AllergyOnset: ['AllergyIntolerance'],
  AllergyEnd: ['AllergyIntolerance'],
  VitalSign: [null],
  Symptom: [null],
  SetAttribute: [null],
  Counter: [null],
  Death: [null]
};

module.exports = function() {

  function check(node, reporter) {

    const stateType = getStateType(node);

    if (!stateType || !(stateType in ALLOWED)) {
      return;
    }

    const resourceType = getFhirmapResourceType(node);
    const allowed = ALLOWED[stateType];

    const isAllowed = allowed.includes(resourceType) || (resourceType === null && allowed.includes(null));

    if (!isAllowed) {
      reporter.report(
        node.id,
        'stateType="' + stateType + '" is inconsistent with fhirmap:resourceType="' + (resourceType || '(absent)') +
        '" — expected ' + describeAllowed(allowed) + ' (implicit-rules.md, Table B/B.1).'
      );
    }
  }

  function describeAllowed(allowed) {
    return allowed.map((a) => a === null ? '(absent)' : `"${a}"`).join(' or ');
  }

  return { check };
};
