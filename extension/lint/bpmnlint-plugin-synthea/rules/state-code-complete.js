const { is } = require('../lib/utils');

const SNOMED = 'http://snomed.info/sct';
const LOINC = 'http://loinc.org';
const RXNORM = 'http://www.nlm.nih.gov/research/umls/rxnorm';

// The code systems each state type accepts (mirrors SYSTEMS_BY_STATE_TYPE in
// tools/bpmn2gmf/codes.mjs). A state type that is not listed carries no code.
const SYSTEMS_BY_STATE_TYPE = {
  ConditionOnset: [SNOMED],
  ConditionEnd: [SNOMED],
  AllergyOnset: [SNOMED, RXNORM],
  AllergyEnd: [SNOMED, RXNORM],
  MedicationOrder: [RXNORM],
  MedicationEnd: [RXNORM],
  CarePlanStart: [SNOMED],
  CarePlanEnd: [SNOMED],
  Procedure: [SNOMED],
  ImagingStudy: [SNOMED],
  Device: [SNOMED],
  DeviceEnd: [SNOMED],
  Observation: [LOINC],
  MultiObservation: [LOINC],
  DiagnosticReport: [LOINC],
  Death: [SNOMED]
};

/**
 * SYN-31 — the code of a state is complete and in a system the state type accepts (warn).
 *
 * The clinical code of a state sits on its synthea:StateTypeConfig as `codeSystem`,
 * `code` and `codeDisplay`. Once one of them is set, all three are needed (Synthea
 * writes the display text into the record), and the system has to be one the state
 * type accepts: the converter drops a code in any other system, and the state then
 * lacks the `codes` field Synthea requires.
 */
module.exports = function() {

  function check(node, reporter) {

    if (!is(node, 'synthea:StateTypeConfig')) {
      return;
    }

    const fields = ['codeSystem', 'code', 'codeDisplay'];

    if (!fields.some((field) => node[field])) {
      return;
    }

    const missing = fields.filter((field) => !node[field]);

    if (missing.length) {
      reporter.report(
        nearestReportableId(node),
        `stateTypeConfig has a code but is missing ${missing.join(' and ')} — a code needs its system, the code and its display text.`
      );

      return;
    }

    const accepted = SYSTEMS_BY_STATE_TYPE[node.stateType];

    if (accepted && !accepted.includes(node.codeSystem)) {
      reporter.report(
        nearestReportableId(node),
        `codeSystem "${node.codeSystem}" is not accepted for stateType "${node.stateType}" (accepted: ${accepted.join(', ')}) — the converter drops the code.`
      );
    }
  }

  function nearestReportableId(node) {
    let current = node.$parent;

    while (current && !current.id) {
      current = current.$parent;
    }

    return current ? current.id : undefined;
  }

  return { check };
};
