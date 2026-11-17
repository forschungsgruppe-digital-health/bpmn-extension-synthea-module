const { is } = require('../lib/utils');
const { nearestReportableId, isSet } = require('../lib/values');

/**
 * SYN-41 — code-format-plausible.
 *
 * A code has the shape of its code system: a SNOMED CT identifier is 6 to 18 digits, a LOINC code
 * is digits, a hyphen and a check digit ("8480-6"), an RxNorm and a CVX code are digits. This does
 * not look the code up (that is the medical terminology extension's job; see
 * docs/validator-overview.md), it only catches what cannot be a code: a typo, a letter, a display
 * text pasted into the code field, a space.
 *
 * Checked on the code of a state (StateTypeConfig), of an encounter (EncounterContext), of a
 * condition (Condition), and the SNOMED codes of reactions, instructions, supplies and imaging
 * series (body site; a modality is a short DICOM code, a SOP class an object identifier).
 */
const SYSTEMS = {
  'http://snomed.info/sct': { name: 'SNOMED CT', pattern: /^\d{6,18}$/, shape: '6 to 18 digits' },
  'http://loinc.org': { name: 'LOINC', pattern: /^\d{1,7}-\d$/, shape: 'digits, a hyphen and a check digit, e.g. 8480-6' },
  'http://www.nlm.nih.gov/research/umls/rxnorm': { name: 'RxNorm', pattern: /^\d+$/, shape: 'digits only' },
  'http://hl7.org/fhir/sid/cvx': { name: 'CVX', pattern: /^\d+$/, shape: 'digits only' }
};

const SNOMED = SYSTEMS['http://snomed.info/sct'];

module.exports = function() {

  function check(node, reporter) {
    const id = nearestReportableId(node);

    const test = (code, system, where) => {
      if (!isSet(code) || !system) {
        return;
      }

      if (!system.pattern.test(String(code).trim()) || /\s/.test(String(code))) {
        reporter.report(id, `${where} "${code}" does not look like a ${system.name} code (${system.shape}).`);
      }
    };

    if (is(node, 'synthea:StateTypeConfig')) {
      test(node.code, SYSTEMS[node.codeSystem], 'The code');
    }

    if (is(node, 'synthea:EncounterContext')) {
      test(node.encounterCode, SYSTEMS[node.encounterCodeSystem], 'The encounter code');
    }

    if (is(node, 'synthea:Condition')) {
      test(node.code, SYSTEMS[node.codeSystem], 'The code');
    }

    if (is(node, 'synthea:AllergyReaction')) {
      test(node.code, SNOMED, 'The reaction code');
    }

    if (is(node, 'synthea:PrescriptionInstruction')) {
      test(node.code, SNOMED, 'The instruction code');
    }

    if (is(node, 'synthea:SupplyItem')) {
      test(node.code, SNOMED, 'The supply code');
    }

    if (is(node, 'synthea:ImagingStudySeries')) {
      test(node.bodySiteCode, SNOMED, 'The body site code');

      if (isSet(node.modalityCode) && !/^[A-Z]{2,4}$/.test(node.modalityCode)) {
        reporter.report(id, `The modality code "${node.modalityCode}" does not look like a DICOM modality (2 to 4 capital letters, e.g. DX, MR).`);
      }

      if (isSet(node.sopClassCode) && !/^\d+(\.\d+)+$/.test(node.sopClassCode)) {
        reporter.report(id, `The SOP class "${node.sopClassCode}" does not look like an object identifier (digits and dots, e.g. 1.2.840.10008.5.1.4.1.1.1.1).`);
      }
    }
  }

  return { check };
};
